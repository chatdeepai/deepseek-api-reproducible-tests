"""Bounded DeepSeek compatibility runner for the official OpenAI Python SDK.

This module makes no request unless ALLOW_PROVIDER_REQUESTS=1 and a key is
provided explicitly. Raw prompts, content, reasoning, headers, request IDs,
tool-call IDs, and account data are never written to the result file.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PLAN_PATH = ROOT / "fixtures" / "request-plan.json"
RESULT_PATH = ROOT / "results" / "python-live-summary.json"
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
FORBIDDEN_RESULT_FIELDS = {
    "authorization",
    "headers",
    "prompt",
    "messages",
    "content",
    "reasoning_content",
    "request_id",
    "tool_call_id",
    "arguments",
    "raw",
}
SECRET_PATTERNS = [
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*", re.IGNORECASE),
    re.compile(r"(?:api[_-]?key|authorization)\s*[:=]\s*[\"'][^\"']{8,}[\"']", re.IGNORECASE),
]


def load_plan() -> dict[str, Any]:
    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    cases = plan.get("cases")
    if not isinstance(cases, list):
        raise RuntimeError("Plan must contain a cases array.")
    if plan.get("provider_request_cap") != 20:
        raise RuntimeError("The provider request cap must remain exactly 20.")
    if plan.get("planned_provider_requests") != len(cases) or len(cases) > 20:
        raise RuntimeError("The provider request plan has an invalid case count.")
    if plan.get("concurrency") != 1 or plan.get("automatic_retries") != 0:
        raise RuntimeError("The plan must use concurrency 1 and zero automatic retries.")
    if [item.get("sequence") for item in cases] != list(range(1, len(cases) + 1)):
        raise RuntimeError("Case sequence values must be contiguous and ordered.")
    if len({item.get("id") for item in cases}) != len(cases):
        raise RuntimeError("Case IDs must be unique.")
    python_cases = [item for item in cases if item.get("sdk") == "python"]
    node_cases = [item for item in cases if item.get("sdk") == "node"]
    if len(python_cases) != 10 or len(node_cases) != 10:
        raise RuntimeError("Each SDK must have exactly ten preregistered requests.")
    return plan


def assert_allowlisted_result(value: Any, path: str = "$") -> None:
    if isinstance(value, list):
        for index, item in enumerate(value):
            assert_allowlisted_result(item, f"{path}[{index}]")
        return
    if not isinstance(value, dict):
        return
    for key, child in value.items():
        if key.lower() in FORBIDDEN_RESULT_FIELDS:
            raise RuntimeError(f"Forbidden result field at {path}.{key}")
        assert_allowlisted_result(child, f"{path}.{key}")


def assert_no_secrets(text: str) -> None:
    findings = sum(len(pattern.findall(text)) for pattern in SECRET_PATTERNS)
    if findings:
        raise RuntimeError(f"Refusing to persist {findings} credential-like finding(s).")


def safe_error_class(error: Exception) -> str:
    name = error.__class__.__name__
    return name if re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,79}", name) else "Error"


def safe_error_code(error: Exception) -> str | None:
    code = getattr(error, "code", None)
    return code if isinstance(code, str) and re.fullmatch(r"[A-Za-z0-9_.-]{1,80}", code) else None


def base_chat(case_item: dict[str, Any], prompt: str) -> dict[str, Any]:
    body: dict[str, Any] = {
        "model": case_item["model"],
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": case_item["max_tokens"],
        "stream": False,
    }
    if case_item.get("thinking"):
        body["extra_body"] = {"thinking": {"type": case_item["thinking"]}}
    return body


def success_base(case_item: dict[str, Any], started_at: float) -> dict[str, Any]:
    return {
        "case_id": case_item["id"],
        "sdk": "python",
        "scenario": case_item["scenario"],
        "requested_model": case_item.get("model"),
        "request_issued": True,
        "status": 200,
        "elapsed_ms": round((time.monotonic() - started_at) * 1000),
        "exception_class": None,
        "error_code": None,
    }


def error_result(
    case_item: dict[str, Any],
    started_at: float,
    error: Exception,
    expected_error: bool = False,
) -> dict[str, Any]:
    status = getattr(error, "status_code", None)
    return {
        "case_id": case_item["id"],
        "sdk": "python",
        "scenario": case_item["scenario"],
        "requested_model": case_item.get("model"),
        "request_issued": True,
        "status": status if isinstance(status, int) else None,
        "elapsed_ms": round((time.monotonic() - started_at) * 1000),
        "exception_class": safe_error_class(error),
        "error_code": safe_error_code(error),
        "expected_error": expected_error,
    }


def validate_tool_call(message: Any) -> tuple[bool, Any | None]:
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
        and list(parsed.keys()) == ["city"]
        and isinstance(parsed["city"], str)
        and len(parsed["city"]) > 0
    )
    return valid, call if valid else None


def execute_python_case(client: Any, case_item: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    started_at = time.monotonic()
    scenario = case_item["scenario"]

    if scenario == "models_list":
        try:
            page = client.models.list()
            data = getattr(page, "data", None)
            model_ids = [
                item.id for item in data if isinstance(getattr(item, "id", None), str)
            ] if isinstance(data, list) else []
            return {
                **success_base(case_item, started_at),
                "list_object": isinstance(data, list),
                "model_count": len(model_ids),
                "expected_flash_present": "deepseek-v4-flash" in model_ids,
                "expected_pro_present": "deepseek-v4-pro" in model_ids,
            }
        except Exception as error:  # SDK status types are captured below.
            return error_result(case_item, started_at, error)

    if scenario == "basic_chat":
        try:
            response = client.chat.completions.create(
                **base_chat(case_item, "Reply with one short word.")
            )
            choices = getattr(response, "choices", [])
            choice = choices[0] if choices else None
            message = getattr(choice, "message", None)
            text = getattr(message, "content", None)
            reasoning = getattr(message, "reasoning_content", None)
            return {
                **success_base(case_item, started_at),
                "choice_count": len(choices),
                "finish_reason": getattr(choice, "finish_reason", None),
                "content_nonempty": isinstance(text, str) and len(text) > 0,
                "reasoning_field_present": hasattr(message, "reasoning_content"),
                "reasoning_nonempty": isinstance(reasoning, str) and len(reasoning) > 0,
            }
        except Exception as error:
            return error_result(case_item, started_at, error)

    if scenario in {"thinking_disabled", "thinking_enabled"}:
        try:
            body = base_chat(case_item, "Return a short answer.")
            if scenario == "thinking_enabled":
                body["reasoning_effort"] = "high"
            response = client.chat.completions.create(**body)
            choice = response.choices[0]
            message = choice.message
            reasoning = getattr(message, "reasoning_content", None)
            return {
                **success_base(case_item, started_at),
                "finish_reason": choice.finish_reason,
                "content_nonempty": isinstance(message.content, str) and len(message.content) > 0,
                "reasoning_field_present": hasattr(message, "reasoning_content"),
                "reasoning_nonempty": isinstance(reasoning, str) and len(reasoning) > 0,
            }
        except Exception as error:
            return error_result(case_item, started_at, error)

    if scenario == "streaming":
        try:
            body = base_chat(case_item, "Reply with one short word.")
            body["stream"] = True
            stream = client.chat.completions.create(**body)
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
                    content_seen = content_seen or (isinstance(content, str) and len(content) > 0)
                    reasoning_seen = reasoning_seen or (
                        isinstance(reasoning, str) and len(reasoning) > 0
                    )
                    if isinstance(getattr(choice, "finish_reason", None), str):
                        terminal_finish_reason = choice.finish_reason
            return {
                **success_base(case_item, started_at),
                "event_count": event_count,
                "content_delta_seen": content_seen,
                "reasoning_delta_seen": reasoning_seen,
                "terminal_finish_reason": terminal_finish_reason,
            }
        except Exception as error:
            return error_result(case_item, started_at, error)

    if scenario == "json_output":
        try:
            body = base_chat(
                case_item,
                'Return JSON exactly matching this example: {"ok":true}.',
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
            return {
                **success_base(case_item, started_at),
                "content_nonempty": isinstance(text, str) and len(text) > 0,
                "json_valid": json_valid,
            }
        except Exception as error:
            return error_result(case_item, started_at, error)

    if scenario == "tool_initial":
        try:
            body = base_chat(case_item, "Call get_temperature once for Oslo.")
            body["tools"] = [TOOL_DEFINITION]
            body["tool_choice"] = {"type": "function", "function": {"name": TOOL_NAME}}
            response = client.chat.completions.create(**body)
            choice = response.choices[0]
            message = choice.message
            valid, call = validate_tool_call(message)
            calls = message.tool_calls if isinstance(message.tool_calls, list) else []
            if valid and call is not None:
                state["tool_message"] = {
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
                state["tool_call"] = call
            return {
                **success_base(case_item, started_at),
                "finish_reason": choice.finish_reason,
                "tool_call_count": len(calls),
                "tool_call_valid": valid,
            }
        except Exception as error:
            return error_result(case_item, started_at, error)

    if scenario == "tool_continuation":
        if "tool_message" not in state or "tool_call" not in state:
            return {
                "case_id": case_item["id"],
                "sdk": "python",
                "scenario": scenario,
                "request_issued": False,
                "status": None,
                "elapsed_ms": 0,
                "skip_code": "unsafe_or_missing_initial_tool_call",
            }
        try:
            body = base_chat(case_item, "Call get_temperature once for Oslo.")
            body["messages"] = [
                {"role": "user", "content": "Call get_temperature once for Oslo."},
                state["tool_message"],
                {
                    "role": "tool",
                    "tool_call_id": state["tool_call"].id,
                    "content": "6 C",
                },
            ]
            response = client.chat.completions.create(**body)
            choice = response.choices[0]
            text = choice.message.content
            return {
                **success_base(case_item, started_at),
                "finish_reason": choice.finish_reason,
                "content_nonempty": isinstance(text, str) and len(text) > 0,
                "replay_call_alias": "T1",
            }
        except Exception as error:
            return error_result(case_item, started_at, error)

    if scenario == "invalid_model":
        try:
            client.chat.completions.create(
                **base_chat(case_item, "Return one short word.")
            )
            return {
                **success_base(case_item, started_at),
                "expected_error": True,
                "unexpected_success": True,
            }
        except Exception as error:
            return error_result(case_item, started_at, error, expected_error=True)

    if scenario == "alias_probe":
        try:
            body = base_chat(case_item, "Return one short word.")
            if case_item.get("thinking") == "enabled":
                body["reasoning_effort"] = "high"
            response = client.chat.completions.create(**body)
            returned_model = getattr(response, "model", None)
            if not (
                isinstance(returned_model, str)
                and re.fullmatch(r"[A-Za-z0-9._-]{1,100}", returned_model)
            ):
                returned_model = None
            choice = response.choices[0] if response.choices else None
            message = getattr(choice, "message", None)
            return {
                **success_base(case_item, started_at),
                "returned_model": returned_model,
                "finish_reason": getattr(choice, "finish_reason", None),
                "reasoning_field_present": hasattr(message, "reasoning_content"),
            }
        except Exception as error:
            return error_result(case_item, started_at, error, expected_error=True)

    raise RuntimeError(f"Unknown scenario: {scenario}")


def run_python_live(api_key: str | None, allow_provider_requests: bool = False) -> dict[str, Any]:
    if not allow_provider_requests:
        raise RuntimeError(
            "Provider requests are disabled. Set ALLOW_PROVIDER_REQUESTS=1 explicitly."
        )
    if not isinstance(api_key, str) or len(api_key) < 8:
        raise RuntimeError("DEEPSEEK_API_KEY is required and is never persisted.")

    plan = load_plan()
    cases = [item for item in plan["cases"] if item["sdk"] == "python"]
    if len(cases) != 10 or plan["provider_request_cap"] != 20:
        raise RuntimeError("Refusing to run a mutated request plan.")

    from openai import OpenAI, __version__ as openai_version

    client = OpenAI(
        api_key=api_key,
        base_url=PROVIDER_ORIGIN,
        max_retries=0,
        timeout=plan["default_timeout_ms"] / 1000,
    )
    started_at = datetime.now(timezone.utc).isoformat()
    state: dict[str, Any] = {}
    results = [execute_python_case(client, case_item, state) for case_item in cases]
    issued = sum(1 for item in results if item["request_issued"])
    summary = {
        "schema_version": 1,
        "status": "completed",
        "sdk": "python",
        "sdk_version": openai_version,
        "runtime_version": sys.version.split()[0],
        "started_at": started_at,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "source_plan_cases": len(cases),
        "requests_issued": issued,
        "requests_skipped": len(cases) - issued,
        "provider_request_cap": plan["provider_request_cap"],
        "concurrency": 1,
        "automatic_retries": 0,
        "provider_origin": PROVIDER_ORIGIN,
        "cases": results,
    }
    assert_allowlisted_result(summary)
    return summary


def main() -> None:
    summary = run_python_live(
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
