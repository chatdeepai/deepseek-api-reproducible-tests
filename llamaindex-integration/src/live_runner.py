"""Opt-in, serial coordinator for the frozen provider study.

Importing this module is inert. Provider access requires two explicit environment
variables and a clean results directory. The coordinator must never be run from
unit tests.
"""

from __future__ import annotations

import asyncio
import json
import os
import platform
import time
from datetime import datetime, timezone
from typing import Any

from llama_index.core import Document, VectorStoreIndex
from llama_index.core.base.llms.types import ThinkingBlock
from llama_index.core.embeddings import MockEmbedding
from llama_index.core.llms import ChatMessage, MessageRole
from llama_index.core.prompts import PromptTemplate
from llama_index.core.tools import FunctionTool
from pydantic import BaseModel, Field

from src.budget import RequestBudget
from src.config import (
    AUDIT_PATH,
    LEDGER_PATH,
    RESULTS_DIR,
    SUMMARY_PATH,
    assert_installed_versions,
    installed_versions,
    load_plan,
)
from src.models import build_model
from src.postrun import audit_summary
from src.security import (
    assert_allowlisted_result,
    safe_error_class,
    safe_error_code,
    safe_status,
)


class StructuredAnswer(BaseModel):
    label: str
    score: int = Field(ge=0, le=1)


def lookup_policy(key: str) -> str:
    """Read a synthetic policy record by key."""
    return "Synthetic retention is 30 days." if key == "retention" else "Not found."


def _finish_reason(response: Any) -> str | None:
    raw = getattr(response, "raw", None)
    choices = getattr(raw, "choices", None)
    if choices:
        value = getattr(choices[0], "finish_reason", None)
        return str(value) if value is not None else None
    return None


def _has_reasoning(response: Any) -> bool:
    message = getattr(response, "message", None)
    blocks = getattr(message, "blocks", [])
    return any(
        isinstance(block, ThinkingBlock) and bool(getattr(block, "content", ""))
        for block in blocks
    )


def _common(case: dict[str, Any]) -> dict[str, Any]:
    return {
        "case_id": case["case_id"],
        "runtime": case["runtime"],
        "scenario": case["scenario"],
        "execution": case["execution"],
        "requested_model": case["requested_model"],
        "thinking": case["thinking"],
        "request_issued": True,
    }


def _model(case: dict[str, Any], api_key: str, *, function_calling: bool | None = None):
    plan = load_plan()
    return build_model(
        model=case["requested_model"],
        api_base=plan["provider_origin"],
        api_key=api_key,
        thinking=case["thinking"] == "enabled",
        function_calling=function_calling,
        timeout=float(plan["default_timeout_seconds"]),
        max_tokens=256 if case["scenario"] == "thinking_chat" else 32,
    )


def _chat_messages() -> list[ChatMessage]:
    return [
        ChatMessage(
            role=MessageRole.USER,
            content="Return one short synthetic integration-test sentence.",
        )
    ]


async def _async_chat(model: Any) -> Any:
    return await model.achat(_chat_messages())


async def _async_complete(model: Any) -> Any:
    return await model.acomplete("Return one short synthetic integration-test sentence.")


async def _async_chat_stream(model: Any) -> list[Any]:
    stream = await model.astream_chat(_chat_messages())
    return [chunk async for chunk in stream]


async def _async_complete_stream(model: Any) -> list[Any]:
    stream = await model.astream_complete(
        "Return one short synthetic integration-test sentence."
    )
    return [chunk async for chunk in stream]


def _stream_result(case: dict[str, Any], chunks: list[Any]) -> dict[str, Any]:
    content_delta_seen = any(bool(getattr(chunk, "delta", "")) for chunk in chunks)
    reasoning_delta_seen = any(
        bool(getattr(chunk, "additional_kwargs", {}).get("thinking_delta"))
        for chunk in chunks
    )
    terminal = _finish_reason(chunks[-1]) if chunks else None
    result = {
        **_common(case),
        "status": 200,
        "outcome": "success",
        "chunk_count": len(chunks),
        "content_delta_seen": content_delta_seen,
        "terminal_finish_reason": terminal,
    }
    if case["scenario"] == "chat_stream":
        result["reasoning_delta_seen"] = reasoning_delta_seen
    return result


def _response_result(
    case: dict[str, Any],
    response: Any,
    *,
    alias: bool = False,
) -> dict[str, Any]:
    message = getattr(response, "message", None)
    text = (
        getattr(message, "content", None)
        if message is not None
        else getattr(response, "text", None)
    )
    reasoning = _has_reasoning(response)
    result = {
        **_common(case),
        "status": 200,
        "outcome": "alias_accepted" if alias else "success",
        "response_class": response.__class__.__name__,
        "content_nonempty": isinstance(text, str) and bool(text),
        "finish_reason": _finish_reason(response),
    }
    if case["scenario"] in {"chat", "thinking_chat", "alias_probe"}:
        result["reasoning_field_present"] = reasoning
        result["reasoning_nonempty"] = reasoning
    return result


def _execute_case(
    case: dict[str, Any],
    api_key: str,
    state: dict[str, Any],
) -> dict[str, Any]:
    scenario = case["scenario"]
    execution = case["execution"]
    model = _model(
        case,
        api_key,
        function_calling=True
        if scenario in {"structured_predict", "tool_initial", "tool_continuation"}
        else None,
    )

    if scenario == "chat":
        response = (
            model.chat(_chat_messages())
            if execution == "sync"
            else asyncio.run(_async_chat(model))
        )
        return _response_result(case, response)
    if scenario == "complete":
        response = (
            model.complete("Return one short synthetic integration-test sentence.")
            if execution == "sync"
            else asyncio.run(_async_complete(model))
        )
        return _response_result(case, response)
    if scenario == "chat_stream":
        chunks = (
            list(model.stream_chat(_chat_messages()))
            if execution == "sync"
            else asyncio.run(_async_chat_stream(model))
        )
        return _stream_result(case, chunks)
    if scenario == "complete_stream":
        chunks = (
            list(
                model.stream_complete(
                    "Return one short synthetic integration-test sentence."
                )
            )
            if execution == "sync"
            else asyncio.run(_async_complete_stream(model))
        )
        return _stream_result(case, chunks)
    if scenario == "thinking_chat":
        return _response_result(case, model.chat(_chat_messages()))
    if scenario == "structured_predict":
        answer = model.structured_predict(
            StructuredAnswer,
            PromptTemplate("Return a label and binary score for {topic}."),
            topic="a synthetic fixture",
        )
        return {
            **_common(case),
            "status": 200,
            "outcome": "success",
            "schema_valid": isinstance(answer, StructuredAnswer),
            "validated_field_count": 2,
            "steering_method": "function_calling",
        }
    if scenario == "tool_initial":
        tool = FunctionTool.from_defaults(fn=lookup_policy)
        user = ChatMessage(
            role=MessageRole.USER,
            content="Read the synthetic retention policy.",
        )
        response = model.chat_with_tools(
            [tool],
            user_msg=user,
            tool_required=True,
        )
        calls = model.get_tool_calls_from_response(response)
        valid = len(calls) == 1 and calls[0].tool_kwargs == {"key": "retention"}
        state["tool_user"] = user
        state["tool_response"] = response
        state["tool_selection"] = calls[0] if calls else None
        return {
            **_common(case),
            "status": 200,
            "outcome": "success",
            "tool_call_count": len(calls),
            "tool_name_valid": bool(calls) and calls[0].tool_name == "lookup_policy",
            "arguments_schema_valid": valid,
        }
    if scenario == "tool_continuation":
        user = state.get("tool_user")
        first = state.get("tool_response")
        selection = state.get("tool_selection")
        if user is None or first is None or selection is None:
            raise RuntimeError("Tool continuation requires the immediately prior case.")
        tool_message = ChatMessage(
            role=MessageRole.TOOL,
            content=lookup_policy(**selection.tool_kwargs),
            additional_kwargs={"tool_call_id": selection.tool_id},
        )
        response = model.chat([user, first.message, tool_message])
        return {
            **_common(case),
            "status": 200,
            "outcome": "success",
            "matching_identifier_replayed_in_memory": True,
            "content_nonempty": bool(response.message.content),
        }
    if scenario == "local_rag_query_engine":
        index = VectorStoreIndex.from_documents(
            [
                Document(
                    text=(
                        "Synthetic records are retained for 30 days and then deleted."
                    ),
                    metadata={
                        "record_id": "policy-retention",
                        "tenant": "tenant-alpha",
                    },
                )
            ],
            embed_model=MockEmbedding(embed_dim=8),
        )
        response = index.as_query_engine(llm=model, similarity_top_k=1).query(
            "How long are synthetic records retained?"
        )
        return {
            **_common(case),
            "status": 200,
            "outcome": "success",
            "retriever_type": "deterministic_local_mock_embedding",
            "selected_record_count": 1,
            "source_node_count": len(response.source_nodes),
            "content_nonempty": bool(str(response)),
        }
    if scenario == "alias_probe":
        return _response_result(case, model.chat(_chat_messages()), alias=True)
    if scenario == "invalid_model":
        try:
            model.chat(_chat_messages())
        except BaseException as error:
            return {
                **_common(case),
                "status": safe_status(error),
                "outcome": "expected_provider_error"
                if safe_status(error) == 400
                else "unexpected_error",
                "exception_class": safe_error_class(error),
                "error_code": safe_error_code(error),
                "expected_error_observed": safe_status(error) == 400,
            }
        raise RuntimeError("Invalid-model control unexpectedly succeeded.")
    raise RuntimeError(f"Unknown scenario: {scenario}")


def _atomic_json(path: Any, value: dict[str, Any]) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(value, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def main() -> int:
    if os.environ.get("ALLOW_PROVIDER_REQUESTS") != "1":
        raise RuntimeError("Provider requests are disabled; explicit opt-in is required.")
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        raise RuntimeError("DEEPSEEK_API_KEY must be supplied through the environment.")
    if SUMMARY_PATH.exists() or LEDGER_PATH.exists() or AUDIT_PATH.exists():
        raise RuntimeError("Prior live artifacts exist; refusing an ambiguous rerun.")

    assert_installed_versions()
    plan = load_plan()
    budget = RequestBudget(LEDGER_PATH, cap=plan["provider_request_cap"])
    budget.initialize()
    state: dict[str, Any] = {}
    results: list[dict[str, Any]] = []
    study_started = time.perf_counter()

    for case in plan["cases"]:
        started = time.perf_counter()
        dependency_missing = (
            case["scenario"] == "tool_continuation"
            and state.get("tool_selection") is None
        )
        if dependency_missing:
            result = {
                **_common(case),
                "request_issued": False,
                "status": None,
                "outcome": "skipped_dependency",
                "matching_identifier_replayed_in_memory": False,
                "content_nonempty": False,
            }
        else:
            budget.reserve(case["case_id"])
            try:
                result = _execute_case(case, api_key, state)
            except BaseException as error:
                result = {
                    **_common(case),
                    "status": safe_status(error),
                    "outcome": "unexpected_error",
                    "exception_class": safe_error_class(error),
                    "error_code": safe_error_code(error),
                    "expected_error_observed": False,
                }
        result["elapsed_ms"] = round((time.perf_counter() - started) * 1000)
        assert_allowlisted_result(result)
        results.append(result)

    ledger = budget.snapshot()
    summary = {
        "schema_version": 1,
        "status": "completed",
        "study": plan["study"],
        "tested_at_utc": datetime.now(timezone.utc).isoformat(),
        "provider_origin": plan["provider_origin"],
        "python_version": platform.python_version(),
        "python_packages": installed_versions(),
        "planned_provider_requests": plan["planned_provider_requests"],
        "provider_request_cap": plan["provider_request_cap"],
        "provider_requests_issued": ledger["issued"],
        "concurrency": plan["concurrency"],
        "automatic_retries": plan["automatic_retries"],
        "elapsed_ms": round((time.perf_counter() - study_started) * 1000),
        "results": results,
    }
    _atomic_json(SUMMARY_PATH, summary)
    audit_summary()
    print(
        f"Completed {len(results)} cases with {ledger['issued']} provider requests; "
        "privacy audit passed."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
