"""Guarded coordinator for the frozen Python and JavaScript live plan.

The module is inert on import. A provider request requires both an explicit
ALLOW_PROVIDER_REQUESTS=1 opt-in and DEEPSEEK_API_KEY in the process
environment. The coordinator never prints or persists prompts, responses,
reasoning text, headers, provider IDs, tool arguments, or credentials.
"""

from __future__ import annotations

import asyncio
import importlib.metadata
import json
import os
import platform
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from src.adapter import (
    AdapterSettings,
    build_chat_model,
    build_local_context_runnable,
)
from src.budget import RequestBudget
from src.plan import EXPECTED_PYTHON_VERSIONS, cases_for_runtime, load_plan
from src.postrun import AUDIT_PATH, SUMMARY_PATH, audit_summary
from src.security import (
    assert_allowlisted_result,
    safe_error_class,
    safe_error_code,
    safe_status,
)


ROOT = Path(__file__).resolve().parents[1]
LEDGER_PATH = ROOT / "results" / "run-ledger.json"
JS_PARTIAL_PATH = ROOT / "results" / "js-partial.json"
PYTHON_API_BASE = "https://api.deepseek.com/v1"
SYNTHETIC_PROMPT = "Return one concise synthetic answer."


def _settings(case: dict[str, Any]) -> AdapterSettings:
    return AdapterSettings(
        model=case["model"],
        base_url=PYTHON_API_BASE,
        max_tokens=case["max_tokens"],
        thinking=case["thinking"],
        reasoning_effort=case["reasoning_effort"],
        timeout_seconds=30,
        max_retries=0,
    )


def _base_result(
    case: dict[str, Any],
    started: float,
    *,
    request_issued: bool,
    status: int | None,
) -> dict[str, Any]:
    return {
        "case_id": case["id"],
        "runtime": case["runtime"],
        "execution": case["execution"],
        "scenario": case["scenario"],
        "requested_model": case["model"],
        "thinking": case["thinking"],
        "request_issued": request_issued,
        "status": status,
        "elapsed_ms": round((time.monotonic() - started) * 1000),
    }


def _error_result(
    case: dict[str, Any],
    started: float,
    error: BaseException,
    *,
    expected: bool,
) -> dict[str, Any]:
    return {
        **_base_result(case, started, request_issued=True, status=safe_status(error)),
        "outcome": "expected_provider_error" if expected else "provider_error",
        "exception_class": safe_error_class(error),
        "error_code": safe_error_code(error),
    }


def _message_result(case: dict[str, Any], started: float, message: Any) -> dict[str, Any]:
    content = getattr(message, "content", None)
    additional = getattr(message, "additional_kwargs", {})
    metadata = getattr(message, "response_metadata", {})
    return {
        **_base_result(case, started, request_issued=True, status=200),
        "outcome": "success",
        "message_class": message.__class__.__name__,
        "content_nonempty": isinstance(content, str) and bool(content),
        "reasoning_field_present": "reasoning_content" in additional,
        "reasoning_nonempty": bool(additional.get("reasoning_content")),
        "finish_reason": metadata.get("finish_reason"),
    }


def _reserve(budget: RequestBudget, case: dict[str, Any]) -> None:
    budget.reserve(case["id"])


def _run_sync_case(
    case: dict[str, Any],
    *,
    api_key: str,
    budget: RequestBudget,
) -> dict[str, Any]:
    started = time.monotonic()
    model = build_chat_model(_settings(case), api_key=api_key)
    _reserve(budget, case)
    try:
        if case["scenario"] == "stream":
            chunk_count = 0
            content_seen = False
            reasoning_seen = False
            terminal = None
            for chunk in model.stream(SYNTHETIC_PROMPT):
                chunk_count += 1
                content_seen = content_seen or bool(getattr(chunk, "content", None))
                reasoning_seen = reasoning_seen or bool(
                    getattr(chunk, "additional_kwargs", {}).get("reasoning_content")
                )
                terminal = (
                    getattr(chunk, "response_metadata", {}).get("finish_reason")
                    or terminal
                )
            return {
                **_base_result(case, started, request_issued=True, status=200),
                "outcome": "success",
                "chunk_count": chunk_count,
                "content_delta_seen": content_seen,
                "reasoning_delta_seen": reasoning_seen,
                "terminal_finish_reason": terminal,
            }
        if case["scenario"] == "structured_output":
            from pydantic import BaseModel, ConfigDict, Field

            class StructuredAnswer(BaseModel):
                model_config = ConfigDict(extra="forbid")
                label: str
                score: int = Field(ge=0, le=5)

            runnable = model.with_structured_output(
                StructuredAnswer,
                method="json_mode",
            )
            parsed = runnable.invoke(
                'Return JSON matching exactly: {"label":"synthetic","score":1}.'
            )
            return {
                **_base_result(case, started, request_issued=True, status=200),
                "outcome": "success",
                "schema_valid": isinstance(parsed, StructuredAnswer),
                "validated_field_count": 2,
            }
        if case["scenario"] == "local_context_rag":
            chain = build_local_context_runnable(
                model,
                [
                    "Synthetic retention policy: records are retained for 30 days.",
                    "Synthetic support hours: the desk closes at 17:00 UTC.",
                ],
            )
            result = chain.invoke("How long are retention records kept?")
            return {
                **_base_result(case, started, request_issued=True, status=200),
                "outcome": "success",
                "retriever_type": "deterministic_local_lexical",
                "selected_record_count": 1,
                "content_nonempty": isinstance(result, str) and bool(result),
            }
        message = model.invoke(SYNTHETIC_PROMPT)
        result = _message_result(case, started, message)
        if case["scenario"] == "alias_probe":
            result["outcome"] = "alias_accepted"
        elif case["scenario"] == "invalid_model":
            result["outcome"] = "unexpected_model_accepted"
            result["expected_error_observed"] = False
        return result
    except BaseException as error:
        expected = case["scenario"] in {"alias_probe", "invalid_model"}
        result = _error_result(case, started, error, expected=expected)
        if case["scenario"] == "alias_probe":
            result["outcome"] = "alias_rejected"
        elif case["scenario"] == "invalid_model":
            result["expected_error_observed"] = True
        return result


async def _run_async_case(
    case: dict[str, Any],
    *,
    api_key: str,
    budget: RequestBudget,
) -> dict[str, Any]:
    started = time.monotonic()
    model = build_chat_model(_settings(case), api_key=api_key)
    _reserve(budget, case)
    try:
        if case["scenario"] == "stream":
            chunk_count = 0
            content_seen = False
            reasoning_seen = False
            terminal = None
            async for chunk in model.astream(SYNTHETIC_PROMPT):
                chunk_count += 1
                content_seen = content_seen or bool(getattr(chunk, "content", None))
                reasoning_seen = reasoning_seen or bool(
                    getattr(chunk, "additional_kwargs", {}).get("reasoning_content")
                )
                terminal = (
                    getattr(chunk, "response_metadata", {}).get("finish_reason")
                    or terminal
                )
            return {
                **_base_result(case, started, request_issued=True, status=200),
                "outcome": "success",
                "chunk_count": chunk_count,
                "content_delta_seen": content_seen,
                "reasoning_delta_seen": reasoning_seen,
                "terminal_finish_reason": terminal,
            }
        message = await model.ainvoke(SYNTHETIC_PROMPT)
        return _message_result(case, started, message)
    except BaseException as error:
        return _error_result(case, started, error, expected=False)


async def _run_tool_pair(
    initial_case: dict[str, Any],
    continuation_case: dict[str, Any],
    *,
    api_key: str,
    budget: RequestBudget,
) -> list[dict[str, Any]]:
    from langchain_core.messages import HumanMessage, ToolMessage
    from pydantic import BaseModel, ConfigDict

    class SyntheticLookup(BaseModel):
        """Look up one synthetic local key."""

        model_config = ConfigDict(extra="forbid")
        key: str

    model = build_chat_model(_settings(initial_case), api_key=api_key)
    bound = model.bind_tools(
        [SyntheticLookup],
        tool_choice="SyntheticLookup",
        strict=True,
    )
    initial_started = time.monotonic()
    _reserve(budget, initial_case)
    try:
        initial = await bound.ainvoke(
            "Use the synthetic lookup tool with the exact key retention."
        )
        calls = getattr(initial, "tool_calls", [])
        valid = (
            len(calls) == 1
            and calls[0].get("name") == "SyntheticLookup"
            and calls[0].get("args") == {"key": "retention"}
            and isinstance(calls[0].get("id"), str)
        )
        initial_result = {
            **_base_result(initial_case, initial_started, request_issued=True, status=200),
            "outcome": "success",
            "tool_call_count": len(calls),
            "tool_name_valid": len(calls) == 1
            and calls[0].get("name") == "SyntheticLookup",
            "arguments_schema_valid": valid,
            "strict_schema_requested": True,
            "beta_route_expected_by_wrapper": True,
        }
        if not valid:
            return [
                initial_result,
                {
                    **_base_result(
                        continuation_case,
                        time.monotonic(),
                        request_issued=False,
                        status=None,
                    ),
                    "outcome": "safety_skipped",
                    "skip_reason": "tool_validation_failed",
                },
            ]
        continuation_started = time.monotonic()
        _reserve(budget, continuation_case)
        final = await bound.ainvoke(
            [
                HumanMessage(
                    content="Use the synthetic lookup tool with the exact key retention."
                ),
                initial,
                ToolMessage(
                    content="Synthetic approved observation.",
                    tool_call_id=calls[0]["id"],
                ),
            ]
        )
        continuation_result = {
            **_base_result(
                continuation_case,
                continuation_started,
                request_issued=True,
                status=200,
            ),
            "outcome": "success",
            "matching_identifier_replayed_in_memory": True,
            "content_nonempty": bool(getattr(final, "content", None)),
        }
        return [initial_result, continuation_result]
    except BaseException as error:
        return [
            _error_result(initial_case, initial_started, error, expected=False),
            {
                **_base_result(
                    continuation_case,
                    time.monotonic(),
                    request_issued=False,
                    status=None,
                ),
                "outcome": "safety_skipped",
                "skip_reason": "tool_initial_failed",
            },
        ]


def _run_python(
    cases: list[dict[str, Any]],
    *,
    api_key: str,
    budget: RequestBudget,
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    index = 0
    while index < len(cases):
        case = cases[index]
        if case["scenario"] == "tool_initial":
            results.extend(
                asyncio.run(
                    _run_tool_pair(
                        case,
                        cases[index + 1],
                        api_key=api_key,
                        budget=budget,
                    )
                )
            )
            index += 2
            continue
        if case["execution"] == "async":
            results.append(
                asyncio.run(_run_async_case(case, api_key=api_key, budget=budget))
            )
        else:
            results.append(_run_sync_case(case, api_key=api_key, budget=budget))
        index += 1
    return results


def _node_binary() -> str:
    configured = os.environ.get("NODE_BINARY")
    if configured:
        return configured
    discovered = shutil.which("node")
    if discovered:
        return discovered
    raise RuntimeError(
        "Node 20 or newer is required; set NODE_BINARY when it is not on PATH."
    )


def _run_javascript(api_key: str) -> tuple[list[dict[str, Any]], str]:
    environment = os.environ.copy()
    environment.update(
        {
            "ALLOW_PROVIDER_REQUESTS": "1",
            "DEEPSEEK_API_KEY": api_key,
            "LANGCHAIN_PLAN_PATH": str(ROOT / "fixtures" / "request-plan.json"),
            "LANGCHAIN_LEDGER_PATH": str(LEDGER_PATH),
            "LANGCHAIN_JS_RESULT_PATH": str(JS_PARTIAL_PATH),
        }
    )
    process = subprocess.run(
        [_node_binary(), str(ROOT / "js" / "live-runner.mjs")],
        cwd=ROOT,
        env=environment,
        capture_output=True,
        timeout=300,
        check=False,
    )
    if process.returncode != 0:
        raise RuntimeError(
            f"JavaScript live runner failed with exit code {process.returncode}."
        )
    value = json.loads(JS_PARTIAL_PATH.read_text(encoding="utf-8"))
    results = value.get("results")
    if not isinstance(results, list):
        raise RuntimeError("JavaScript runner did not return a result list.")
    node_version = value.get("node_version")
    if not isinstance(node_version, str):
        raise RuntimeError("JavaScript runner did not report its runtime version.")
    return results, node_version


def _verify_python_versions() -> dict[str, str]:
    observed = {
        distribution: importlib.metadata.version(distribution)
        for distribution in EXPECTED_PYTHON_VERSIONS
    }
    if observed != EXPECTED_PYTHON_VERSIONS:
        raise RuntimeError("Installed Python versions do not match the frozen plan.")
    return observed


def main() -> None:
    if os.environ.get("ALLOW_PROVIDER_REQUESTS") != "1":
        raise SystemExit("Provider requests are disabled.")
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        raise SystemExit("DEEPSEEK_API_KEY must be supplied through the environment.")
    if SUMMARY_PATH.exists() or LEDGER_PATH.exists() or JS_PARTIAL_PATH.exists():
        raise SystemExit("Prior result state exists; refusing an ambiguous rerun.")

    plan = load_plan()
    versions = _verify_python_versions()
    budget = RequestBudget(LEDGER_PATH, cap=plan["provider_request_cap"])
    budget.initialize()
    started = time.monotonic()
    python_results = _run_python(
        cases_for_runtime(plan, "python"),
        api_key=api_key,
        budget=budget,
    )
    javascript_results, node_version = _run_javascript(api_key)
    results = [*python_results, *javascript_results]
    ledger = budget.snapshot()
    summary = {
        "schema_version": 1,
        "status": "completed",
        "tested_at_utc": datetime.now(timezone.utc).isoformat(),
        "study": "DeepSeek LangChain integration bounded live study",
        "provider_origin": plan["provider_origin"],
        "python_version": platform.python_version(),
        "python_packages": versions,
        "node_version": node_version,
        "javascript_packages": plan["versions"]["javascript"],
        "planned_provider_requests": plan["planned_provider_requests"],
        "provider_request_cap": plan["provider_request_cap"],
        "provider_requests_issued": ledger["issued"],
        "concurrency": 1,
        "automatic_retries": 0,
        "elapsed_ms": round((time.monotonic() - started) * 1000),
        "results": results,
    }
    assert_allowlisted_result(summary)
    SUMMARY_PATH.write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    audit = audit_summary(summary)
    AUDIT_PATH.write_text(
        json.dumps(audit, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    if audit["status"] != "pass":
        raise SystemExit("The postrun privacy audit failed.")
    print(
        f"Completed {len(results)} planned cases with "
        f"{ledger['issued']} provider request(s); privacy audit passed."
    )


if __name__ == "__main__":
    main()
