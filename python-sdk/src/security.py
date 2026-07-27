"""Result allowlisting and secret/language scans."""

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
    "tool_call_id",
    "arguments",
    "balance",
    "account",
    "raw",
}

SECRET_PATTERNS = [
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*\b", re.IGNORECASE),
    re.compile(
        r"(?:api[_-]?key|authorization)\s*[:=]\s*[\"'][^\"']{8,}[\"']",
        re.IGNORECASE,
    ),
]
ARABIC_PATTERN = re.compile(
    r"[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]"
)
MOJIBAKE_TOKENS = (
    "\u00c3",
    "\u00c2",
    "\u00e2\u20ac",
    "\u00e2\u20ac\u2122",
    "\u00e2\u20ac\u0153",
    "\u00e2\u20ac\u009d",
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
            value = match.group(0)
            if any(
                marker in value
                for marker in (
                    "offline-only-not-a-credential",
                    "set-outside-source-control",
                    "test-only-not-a-provider-key",
                    "your api key",
                )
            ):
                continue
            findings += 1
    return findings


def assert_no_secrets(text: str) -> None:
    findings = secret_findings(text)
    if findings:
        raise ValueError(f"Refusing to persist {findings} credential-like finding(s).")


def language_findings(text: str) -> dict[str, int]:
    return {
        "arabic_characters": len(ARABIC_PATTERN.findall(text)),
        "mojibake_matches": sum(text.count(token) for token in MOJIBAKE_TOKENS),
    }


def safe_error_class(error: Exception) -> str:
    name = error.__class__.__name__
    return name if re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,79}", name) else "Error"


def safe_error_code(error: Exception) -> str | None:
    code = getattr(error, "code", None)
    if isinstance(code, str) and re.fullmatch(r"[A-Za-z0-9_.-]{1,80}", code):
        return code
    return None
