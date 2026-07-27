"""Allowlisted evidence validation and privacy scans."""

from __future__ import annotations

import re
from typing import Any


COMMON_RESULT_FIELDS = {
    "case_id",
    "runtime",
    "scenario",
    "execution",
    "requested_model",
    "thinking",
    "request_issued",
    "status",
    "outcome",
    "elapsed_ms",
}
OPTIONAL_RESULT_FIELDS = {
    "response_class",
    "content_nonempty",
    "finish_reason",
    "reasoning_field_present",
    "reasoning_nonempty",
    "chunk_count",
    "content_delta_seen",
    "reasoning_delta_seen",
    "terminal_finish_reason",
    "schema_valid",
    "validated_field_count",
    "steering_method",
    "tool_call_count",
    "tool_name_valid",
    "arguments_schema_valid",
    "matching_identifier_replayed_in_memory",
    "retriever_type",
    "selected_record_count",
    "source_node_count",
    "exception_class",
    "error_code",
    "expected_error_observed",
}
ALLOWED_RESULT_FIELDS = COMMON_RESULT_FIELDS | OPTIONAL_RESULT_FIELDS
FORBIDDEN_FIELDS = {
    "api_key",
    "authorization",
    "headers",
    "prompt",
    "messages",
    "output",
    "content",
    "reasoning_content",
    "request_id",
    "provider_request_id",
    "tool_call_id",
    "arguments",
    "retrieved_context",
    "raw",
    "balance",
    "account",
}
SECRET_PATTERNS = (
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*\b", re.IGNORECASE),
    re.compile(
        r"(?:api[_-]?key|authorization)\s*[:=]\s*[\"'][^\"']{8,}[\"']",
        re.IGNORECASE,
    ),
)
NON_ASCII_PATTERN = re.compile(r"[^\x00-\x7f]")
MOJIBAKE_TOKENS = (
    "\u00c3",
    "\u00c2",
    "\u00e2\u20ac",
    "\u00f0\u0178",
    "\u00ef\u00bb\u00bf",
    "\ufffd",
)


def assert_allowlisted_result(result: dict[str, Any]) -> None:
    unknown = set(result) - ALLOWED_RESULT_FIELDS
    forbidden = {key for key in result if key.lower() in FORBIDDEN_FIELDS}
    if unknown or forbidden:
        raise ValueError(
            f"Result violates field allowlist: unknown={sorted(unknown)!r}, "
            f"forbidden={sorted(forbidden)!r}"
        )


def secret_findings(text: str) -> int:
    findings = 0
    for pattern in SECRET_PATTERNS:
        for match in pattern.finditer(text):
            if any(
                marker in match.group(0)
                for marker in (
                    "offline-only-not-a-credential",
                    "set-outside-source-control",
                )
            ):
                continue
            findings += 1
    return findings


def text_findings(text: str) -> dict[str, int]:
    return {
        "non_ascii_characters": len(NON_ASCII_PATTERN.findall(text)),
        "mojibake_matches": sum(text.count(token) for token in MOJIBAKE_TOKENS),
    }


def safe_error_class(error: BaseException) -> str:
    name = error.__class__.__name__
    return name if re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,79}", name) else "Error"


def safe_error_code(error: BaseException) -> str | None:
    code = getattr(error, "code", None)
    if isinstance(code, str) and re.fullmatch(r"[A-Za-z0-9_.-]{1,80}", code):
        return code
    return None

def safe_status(error: BaseException) -> int | None:
    for name in ("status_code", "status"):
        value = getattr(error, name, None)
        if isinstance(value, int) and 100 <= value <= 599:
            return value
    return None
