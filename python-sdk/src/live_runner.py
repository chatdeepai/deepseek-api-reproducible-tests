"""Guarded, serial, zero-retry DeepSeek provider runner.

No provider request is possible unless ALLOW_PROVIDER_REQUESTS=1 is supplied
and a credential is available through the environment. Public summaries retain
allowlisted metadata only.
"""

from __future__ import annotations

import asyncio
import json
import os
import platform
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from src.plan import cases_for_client, load_plan
from src.security import (
    assert_allowlisted_result,
    assert_no_secrets,
    safe_error_class,
    safe_error_code,
)


ROOT = Path(__file__).resolve().parents[1]
RESULT_PATH = ROOT / "results" / "live-summary.json"
PROVIDER_ORIGIN = "https://api.deepseek.com"
TOOL_NAME = "get_temperature"
TOOL_DEFINITION = {
    "type": "function",
    "function": {
        "name": TOOL_NAME,
        "description": "Return a synthetic temperature for one city.",
        "parameters": {
            "type": "object",
            "properties": {"city": {"type": "string"}},
            "required": ["city"],
            "additionalProperties": False,
        },
    },
}


def _base_body(case: dict[str, Any], prompt: str) -> dict[str, Any]:
    body: dict[str, Any] = {
        "model": case["model"],
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": case["max_tokens"],
        "stream": case["stream"],
        "extra_body": {"thinking": {"type": case["thinking"]}},
    }
    if case["reasoning_effort"]:
        body["reasoning_effort"] = case["reasoning_effort"]
    return body


def _success_base(case: dict[str, Any], started_at: float) -> dict[str, Any]:
    return {
        "case_id": case["id"],
        "client": case["client"],
        "scenario": case["scenario"],
        "requested_model": case["model"],
        "thinking": case["thinking"],
        "request_issued": True,
        "status": 200,
        "elapsed_ms": round((time.monotonic() - started_at) * 1000),
        "exception_class": None,
        "error_code": None,
    }


def _error_result(
    case: dict[str, Any],
    started_at: float,
    error: Exception,
    *,
    expected: bool = False,
) -> dict[str, Any]:
    status = getattr(error, "status_code", None)
    return {
        "case_id": case["id"],
        "client": case["client"],
        "scenario": case["scenario"],
        "requested_model": case["model"],
        "thinking": case["thinking"],
        "request_issued": True,
        "status": status if isinstance(status, int) else None,
        "elapsed_ms": round((time.monotonic() - started_at) * 1000),
        "exception_class": safe_error_class(error),
        "error_code": safe_error_code(error),
        "expected_error": expected,
    }


def _standard_result(case: dict[str, Any], started_at: float, response: Any) -> dict[str, Any]:
    choices = getattr(response, "choices", [])
    choice = choices[0] if choices else None
    message = getattr(choice, "message", None)
    content = getattr(message, "content", None)
    reasoning = getattr(message, "reasoning_content", None)
    return {
        **_success_base(case, started_at),
        "choice_count": len(choices),
        "finish_reason": getattr(choice, "finish_reason", None),
        "content_nonempty": isinstance(content, str) and len(content) > 0,
        "reasoning_field_present": hasattr(message, "reasoning_content"),
        "reasoning_nonempty": isinstance(reasoning, str) and len(reasoning) > 0,
    }


def _validate_tool_call(message: Any) -> tuple[bool, Any | None]:
    calls = getattr(message, "tool_calls", None)
    if not isinstance(calls, list) or len(calls) != 1:
        return False, None
    call = calls[0]
    function = getattr(call, "function", None)
    if getattr(function, "name", None) != TOOL_NAME:
        return False, None
    try:
        parsed = json.loads(function.arguments)
    except (TypeError, json.JSONDecodeError):
        return False, None
    valid = (
        isinstance(parsed, dict)
        and set(parsed) == {"city"}
        and isinstance(parsed["city"], str)
        and 0 < len(parsed["city"]) <= 80
    )
    return valid, call if valid else None


def _reserve(counter: list[int], cap: int) -> None:
    if counter[0] >= cap:
        raise RuntimeError("Provider request cap reached.")
    counter[0] += 1


def _run_sync_cases(
    client: Any,
    cases: list[dict[str, Any]],
    counter: list[int],
    cap: int,
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for case in cases:
        started_at = time.monotonic()
        _reserve(counter, cap)
        try:
            if case["scenario"] == "standard_chat":
                response = client.chat.completions.create(
                    **_base_body(case, "Return one concise synthetic answer.")
                )
                results.append(_standard_result(case, started_at, response))
                continue

            if case["scenario"] == "streaming_chat":
                stream = client.chat.completions.create(
                    **_base_body(case, "Return one concise synthetic answer.")
                )
                event_count = 0
                content_seen = False
                reasoning_seen = False
                terminal_finish_reason = None
                for chunk in stream:
                    event_count += 1
                    for choice in getattr(chunk, "choices", []):
                        delta = getattr(choice, "delta", None)
                        content = getattr(delta, "content", None)
                        reasoning = getattr(delta, "reasoning_content", None)
                        content_seen = content_seen or (
                            isinstance(content, str) and len(content) > 0
                        )
                        reasoning_seen = reasoning_seen or (
                            isinstance(reasoning, str) and len(reasoning) > 0
                        )
                        if isinstance(getattr(choice, "finish_reason", None), str):
                            terminal_finish_reason = choice.finish_reason
                results.append(
                    {
                        **_success_base(case, started_at),
                        "event_count": event_count,
                        "content_delta_seen": content_seen,
                        "reasoning_delta_seen": reasoning_seen,
                        "terminal_finish_reason": terminal_finish_reason,
                    }
                )
                continue

            if case["scenario"] == "json_output":
                body = _base_body(
                    case,
                    'Return JSON matching this compact example: {"ok":true}.',
                )
                body["response_format"] = {"type": "json_object"}
                response = client.chat.completions.create(**body)
                text = response.choices[0].message.content
                json_valid = False
                if isinstance(text, str) and text:
                    try:
                        json.loads(text)
                        json_valid = True
                    except json.JSONDecodeError:
                        json_valid = False
                results.append(
                    {
                        **_success_base(case, started_at),
                        "content_nonempty": isinstance(text, str) and len(text) > 0,
                        "json_valid": json_valid,
                    }
                )
                continue

            if case["scenario"] == "invalid_model":
                try:
                    client.chat.completions.create(
                        **_base_body(case, "Return one short synthetic answer.")
                    )
                    results.append(
                        {
                            **_success_base(case, started_at),
                            "expected_error": True,
                            "unexpected_success": True,
                        }
                    )
                except Exception as error:
                    results.append(_error_result(case, started_at, error, expected=True))
                continue

            raise RuntimeError(f"Unexpected sync scenario: {case['scenario']}")
        except Exception as error:
            results.append(_error_result(case, started_at, error))
    return results


async def _run_async_cases(
    client: Any,
    cases: list[dict[str, Any]],
    counter: list[int],
    cap: int,
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    tool_message: dict[str, Any] | None = None
    tool_call: Any | None = None

    for case in cases:
        started_at = time.monotonic()

        if case["scenario"] == "tool_continuation" and (
            tool_message is None or tool_call is None
        ):
            results.append(
                {
                    "case_id": case["id"],
                    "client": case["client"],
                    "scenario": case["scenario"],
                    "requested_model": case["model"],
                    "thinking": case["thinking"],
                    "request_issued": False,
                    "status": None,
                    "elapsed_ms": 0,
                    "skip_code": "unsafe_or_missing_initial_tool_call",
                }
            )
            continue

        _reserve(counter, cap)
        try:
            if case["scenario"] == "standard_chat":
                response = await client.chat.completions.create(
                    **_base_body(case, "Return one concise synthetic answer.")
                )
                results.append(_standard_result(case, started_at, response))
                continue

            if case["scenario"] == "streaming_chat":
                stream = await client.chat.completions.create(
                    **_base_body(case, "Return one concise synthetic answer.")
                )
                event_count = 0
                content_seen = False
                reasoning_seen = False
                terminal_finish_reason = None
                async for chunk in stream:
                    event_count += 1
                    for choice in getattr(chunk, "choices", []):
                        delta = getattr(choice, "delta", None)
                        content = getattr(delta, "content", None)
                        reasoning = getattr(delta, "reasoning_content", None)
                        content_seen = content_seen or (
                            isinstance(content, str) and len(content) > 0
                        )
                        reasoning_seen = reasoning_seen or (
                            isinstance(reasoning, str) and len(reasoning) > 0
                        )
                        if isinstance(getattr(choice, "finish_reason", None), str):
                            terminal_finish_reason = choice.finish_reason
                results.append(
                    {
                        **_success_base(case, started_at),
                        "event_count": event_count,
                        "content_delta_seen": content_seen,
                        "reasoning_delta_seen": reasoning_seen,
                        "terminal_finish_reason": terminal_finish_reason,
                    }
                )
                continue

            if case["scenario"] == "json_output":
                body = _base_body(
                    case,
                    'Return JSON matching this compact example: {"ok":true}.',
                )
                body["response_format"] = {"type": "json_object"}
                response = await client.chat.completions.create(**body)
                text = response.choices[0].message.content
                json_valid = False
                if isinstance(text, str) and text:
                    try:
                        json.loads(text)
                        json_valid = True
                    except json.JSONDecodeError:
                        json_valid = False
                results.append(
                    {
                        **_success_base(case, started_at),
                        "content_nonempty": isinstance(text, str) and len(text) > 0,
                        "json_valid": json_valid,
                    }
                )
                continue

            if case["scenario"] == "tool_initial":
                body = _base_body(case, "Call get_temperature once for Oslo.")
                body["tools"] = [TOOL_DEFINITION]
                body["tool_choice"] = {
                    "type": "function",
                    "function": {"name": TOOL_NAME},
                }
                response = await client.chat.completions.create(**body)
                choice = response.choices[0]
                message = choice.message
                valid, call = _validate_tool_call(message)
                calls = message.tool_calls if isinstance(message.tool_calls, list) else []
                if valid and call is not None:
                    tool_message = {
                        "role": "assistant",
                        "content": message.content or "",
                        "tool_calls": [
                            {
                                "id": call.id,
                                "type": "function",
                                "function": {
                                    "name": call.function.name,
                                    "arguments": call.function.arguments,
                                },
                            }
                        ],
                    }
                    tool_call = call
                results.append(
                    {
                        **_success_base(case, started_at),
                        "finish_reason": choice.finish_reason,
                        "tool_call_count": len(calls),
                        "tool_call_valid": valid,
                    }
                )
                continue

            if case["scenario"] == "tool_continuation":
                body = _base_body(case, "Call get_temperature once for Oslo.")
                body["messages"] = [
                    {"role": "user", "content": "Call get_temperature once for Oslo."},
                    tool_message,
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": "6 C",
                    },
                ]
                response = await client.chat.completions.create(**body)
                choice = response.choices[0]
                text = choice.message.content
                results.append(
                    {
                        **_success_base(case, started_at),
                        "finish_reason": choice.finish_reason,
                        "content_nonempty": isinstance(text, str) and len(text) > 0,
                        "replay_call_alias": "T1",
                    }
                )
                continue

            if case["scenario"] == "invalid_model":
                try:
                    await client.chat.completions.create(
                        **_base_body(case, "Return one short synthetic answer.")
                    )
                    results.append(
                        {
                            **_success_base(case, started_at),
                            "expected_error": True,
                            "unexpected_success": True,
                        }
                    )
                except Exception as error:
                    results.append(_error_result(case, started_at, error, expected=True))
                continue

            raise RuntimeError(f"Unexpected async scenario: {case['scenario']}")
        except Exception as error:
            results.append(_error_result(case, started_at, error))
    return results


def run_live(
    *,
    api_key: str | None,
    allow_provider_requests: bool = False,
) -> dict[str, Any]:
    if not allow_provider_requests:
        raise RuntimeError(
            "Provider requests are disabled. Set ALLOW_PROVIDER_REQUESTS=1 explicitly."
        )
    if not isinstance(api_key, str) or len(api_key) < 8:
        raise RuntimeError("DEEPSEEK_API_KEY is required and is never persisted.")

    plan = load_plan()
    from openai import AsyncOpenAI, OpenAI, __version__ as openai_version

    if openai_version != plan["openai_python_version"]:
        raise RuntimeError(
            f"Installed OpenAI Python {openai_version} does not match the frozen "
            f"{plan['openai_python_version']} plan."
        )

    started_at = datetime.now(timezone.utc)
    counter = [0]
    cap = plan["provider_request_cap"]
    sync_cases = cases_for_client(plan, "sync")
    async_cases = cases_for_client(plan, "async")

    with OpenAI(
        api_key=api_key,
        base_url=PROVIDER_ORIGIN,
        max_retries=0,
        timeout=plan["default_timeout_seconds"],
    ) as sync_client:
        sync_results = _run_sync_cases(sync_client, sync_cases, counter, cap)

    async def run_async() -> list[dict[str, Any]]:
        async with AsyncOpenAI(
            api_key=api_key,
            base_url=PROVIDER_ORIGIN,
            max_retries=0,
            timeout=plan["default_timeout_seconds"],
        ) as async_client:
            return await _run_async_cases(async_client, async_cases, counter, cap)

    async_results = asyncio.run(run_async())
    results = sync_results + async_results
    completed_at = datetime.now(timezone.utc)
    issued = sum(bool(item["request_issued"]) for item in results)

    summary = {
        "schema_version": 1,
        "status": "completed",
        "openai_python_version": openai_version,
        "python_runtime_version": platform.python_version(),
        "started_at": started_at.isoformat(),
        "completed_at": completed_at.isoformat(),
        "provider_origin": PROVIDER_ORIGIN,
        "provider_request_cap": cap,
        "source_plan_cases": len(plan["cases"]),
        "requests_issued": issued,
        "requests_skipped": len(results) - issued,
        "concurrency": 1,
        "automatic_retries": 0,
        "timeout_seconds": plan["default_timeout_seconds"],
        "cases": results,
    }
    assert_allowlisted_result(summary)
    return summary


def main() -> None:
    summary = run_live(
        api_key=os.environ.get("DEEPSEEK_API_KEY"),
        allow_provider_requests=os.environ.get("ALLOW_PROVIDER_REQUESTS") == "1",
    )
    output = json.dumps(summary, indent=2, ensure_ascii=True) + "\n"
    assert_no_secrets(output)
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text(output, encoding="utf-8")
    print(
        json.dumps(
            {
                "status": summary["status"],
                "requests_issued": summary["requests_issued"],
                "requests_skipped": summary["requests_skipped"],
            }
        )
    )


if __name__ == "__main__":
    main()
