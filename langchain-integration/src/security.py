"""Allowlisted evidence validation and privacy scans."""

from __future__ import annotations

import re
from typing import Any


FORBIDDEN_RESULT_FIELDS = {
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


def assert_allowlisted_result(value: Any, path: str = "$") -> None:
    if isinstance(value, list):
        for index, item in enumerate(value):
            assert_allowlisted_result(item, f"{path}[{index}]")
        return
    if not isinstance(value, dict):
        return
    for key, child in value.items():
        if key.lower() in FORBIDDEN_RESULT_FIELDS:
            raise ValueError(f"Forbidden result field at {path}.{key}")
        assert_allowlisted_result(child, f"{path}.{key}")


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
