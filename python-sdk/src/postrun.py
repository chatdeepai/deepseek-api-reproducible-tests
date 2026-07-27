"""Validate and convert a sanitized live summary into public evidence files."""

from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path
from typing import Any

from src.plan import load_plan
from src.security import (
    assert_allowlisted_result,
    language_findings,
    secret_findings,
)


ROOT = Path(__file__).resolve().parents[1]
RESULT_PATH = ROOT / "results" / "live-summary.json"
CSV_PATH = ROOT / "results" / "live-case-summary.csv"
AUDIT_PATH = ROOT / "results" / "postrun-audit-summary.json"
TEXT_SUFFIXES = {".csv", ".json", ".md", ".py", ".toml"}
EXCLUDED_DIRECTORIES = {".python-deps", ".venv", "__pycache__"}
CSV_FIELDS = [
    "case_id",
    "client",
    "scenario",
    "requested_model",
    "thinking",
    "request_issued",
    "status",
    "elapsed_ms",
    "finish_reason",
    "content_nonempty",
    "reasoning_present",
    "event_count",
    "json_valid",
    "tool_call_valid",
    "exception_class",
    "error_code",
    "skip_code",
]


def _validate_summary(plan: dict[str, Any], summary: dict[str, Any]) -> None:
    if summary.get("status") != "completed":
        raise ValueError("Live summary is not marked completed.")
    if summary.get("openai_python_version") != plan["openai_python_version"]:
        raise ValueError("SDK version does not match the frozen plan.")
    if summary.get("provider_request_cap") != plan["provider_request_cap"]:
        raise ValueError("Provider cap does not match the frozen plan.")
    if summary.get("concurrency") != 1 or summary.get("automatic_retries") != 0:
        raise ValueError("Live summary violates serial zero-retry controls.")

    cases = summary.get("cases")
    if not isinstance(cases, list) or len(cases) != len(plan["cases"]):
        raise ValueError("Live summary case count does not match the plan.")
    for expected, actual in zip(plan["cases"], cases, strict=True):
        comparisons = {
            "case_id": expected["id"],
            "client": expected["client"],
            "scenario": expected["scenario"],
            "requested_model": expected["model"],
            "thinking": expected["thinking"],
        }
        for field, value in comparisons.items():
            if actual.get(field) != value:
                raise ValueError(f"Case mismatch at {expected['id']}: {field}")

    issued = sum(bool(case.get("request_issued")) for case in cases)
    skipped = len(cases) - issued
    if issued != summary.get("requests_issued"):
        raise ValueError("requests_issued does not match case records.")
    if skipped != summary.get("requests_skipped"):
        raise ValueError("requests_skipped does not match case records.")
    if issued > plan["provider_request_cap"]:
        raise ValueError("Live summary exceeds the provider request cap.")
    assert_allowlisted_result(summary)


def _csv_row(case: dict[str, Any]) -> dict[str, Any]:
    reasoning_present = case.get("reasoning_field_present")
    if reasoning_present is None:
        reasoning_present = case.get("reasoning_delta_seen")
    finish_reason = case.get("finish_reason")
    if finish_reason is None:
        finish_reason = case.get("terminal_finish_reason")
    return {
        "case_id": case.get("case_id"),
        "client": case.get("client"),
        "scenario": case.get("scenario"),
        "requested_model": case.get("requested_model"),
        "thinking": case.get("thinking"),
        "request_issued": case.get("request_issued"),
        "status": case.get("status"),
        "elapsed_ms": case.get("elapsed_ms"),
        "finish_reason": finish_reason,
        "content_nonempty": case.get("content_nonempty"),
        "reasoning_present": reasoning_present,
        "event_count": case.get("event_count"),
        "json_valid": case.get("json_valid"),
        "tool_call_valid": case.get("tool_call_valid"),
        "exception_class": case.get("exception_class"),
        "error_code": case.get("error_code"),
        "skip_code": case.get("skip_code"),
    }


def _publishable_text_files() -> list[Path]:
    files = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        if any(part in EXCLUDED_DIRECTORIES for part in path.parts):
            continue
        if path.suffix.lower() in TEXT_SUFFIXES or path.name in {".gitignore", ".gitkeep"}:
            files.append(path)
    return sorted(files)


def _scan_publishable_files() -> dict[str, int]:
    files = _publishable_text_files()
    secrets = 0
    arabic_characters = 0
    mojibake_matches = 0
    for path in files:
        text = path.read_text(encoding="utf-8")
        secrets += secret_findings(text)
        language = language_findings(text)
        arabic_characters += language["arabic_characters"]
        mojibake_matches += language["mojibake_matches"]
    return {
        "text_files_scanned": len(files),
        "secret_findings": secrets,
        "arabic_characters": arabic_characters,
        "mojibake_matches": mojibake_matches,
    }


def build_public_evidence() -> dict[str, Any]:
    plan = load_plan()
    summary_text = RESULT_PATH.read_text(encoding="utf-8")
    if secret_findings(summary_text):
        raise ValueError("Credential-like text found in live summary.")
    language = language_findings(summary_text)
    if language["arabic_characters"] or language["mojibake_matches"]:
        raise ValueError("Language or encoding finding in live summary.")
    summary = json.loads(summary_text)
    _validate_summary(plan, summary)

    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CSV_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS, extrasaction="raise")
        writer.writeheader()
        writer.writerows(_csv_row(case) for case in summary["cases"])

    status_counts = Counter(
        str(case["status"]) if case.get("status") is not None else "none"
        for case in summary["cases"]
    )
    audit = {
        "schema_version": 1,
        "status": "pass",
        "source_plan_cases": len(plan["cases"]),
        "result_cases": len(summary["cases"]),
        "requests_issued": summary["requests_issued"],
        "requests_skipped": summary["requests_skipped"],
        "provider_request_cap": plan["provider_request_cap"],
        "concurrency": summary["concurrency"],
        "automatic_retries": summary["automatic_retries"],
        "http_status_counts": dict(sorted(status_counts.items())),
        "csv_columns": len(CSV_FIELDS),
        "csv_rows": len(summary["cases"]),
        "scan": {},
    }
    AUDIT_PATH.write_text(
        json.dumps(audit, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )
    audit["scan"] = _scan_publishable_files()
    if any(
        audit["scan"][field]
        for field in ("secret_findings", "arabic_characters", "mojibake_matches")
    ):
        raise ValueError(f"Post-run scan failed: {audit['scan']}")
    AUDIT_PATH.write_text(
        json.dumps(audit, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )
    return audit


def main() -> None:
    audit = build_public_evidence()
    print(
        json.dumps(
            {
                "status": audit["status"],
                "requests_issued": audit["requests_issued"],
                "csv_rows": audit["csv_rows"],
                "secret_findings": audit["scan"]["secret_findings"],
            }
        )
    )


if __name__ == "__main__":
    main()

