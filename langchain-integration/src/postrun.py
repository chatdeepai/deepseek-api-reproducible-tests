"""Validate and publish a privacy audit for a sanitized live summary."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from src.plan import load_plan
from src.security import (
    assert_allowlisted_result,
    secret_findings,
    text_findings,
)


ROOT = Path(__file__).resolve().parents[1]
SUMMARY_PATH = ROOT / "results" / "live-summary.json"
AUDIT_PATH = ROOT / "results" / "privacy-audit.json"


def audit_summary(summary: dict[str, Any]) -> dict[str, Any]:
    plan = load_plan()
    assert_allowlisted_result(summary)
    encoded = json.dumps(summary, ensure_ascii=False, sort_keys=True)
    text = text_findings(encoded)
    secrets = secret_findings(encoded)
    results = summary.get("results")
    if not isinstance(results, list):
        raise ValueError("Summary results must be a list.")
    expected_ids = [case["id"] for case in plan["cases"]]
    observed_ids = [result.get("case_id") for result in results]
    issued = sum(result.get("request_issued") is True for result in results)
    checks = {
        "result_count_matches_plan": len(results) == len(expected_ids),
        "case_order_matches_plan": observed_ids == expected_ids,
        "request_count_matches_summary": issued
        == summary.get("provider_requests_issued"),
        "request_count_within_cap": issued <= plan["provider_request_cap"],
        "concurrency_is_one": summary.get("concurrency") == 1,
        "automatic_retries_are_zero": summary.get("automatic_retries") == 0,
        "secret_findings_are_zero": secrets == 0,
        "non_ascii_characters_are_zero": text["non_ascii_characters"] == 0,
        "mojibake_matches_are_zero": text["mojibake_matches"] == 0,
    }
    audit = {
        "schema_version": 1,
        "audited_at_utc": datetime.now(timezone.utc).isoformat(),
        "summary_status": summary.get("status"),
        "planned_case_count": len(expected_ids),
        "result_count": len(results),
        "provider_requests_issued": issued,
        "provider_request_cap": plan["provider_request_cap"],
        "forbidden_result_field_findings": 0,
        "secret_findings": secrets,
        **text,
        "checks": checks,
        "status": "pass" if all(checks.values()) else "fail",
    }
    assert_allowlisted_result(audit)
    return audit


def main() -> None:
    if not SUMMARY_PATH.exists():
        raise SystemExit("No sanitized live summary is available to audit.")
    summary = json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))
    audit = audit_summary(summary)
    AUDIT_PATH.write_text(
        json.dumps(audit, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    if audit["status"] != "pass":
        raise SystemExit("Privacy audit failed.")
    print("Privacy audit passed.")


if __name__ == "__main__":
    main()
