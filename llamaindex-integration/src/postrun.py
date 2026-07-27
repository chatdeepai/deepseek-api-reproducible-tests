"""Independent privacy and contract audit for a sanitized live summary."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from src.config import AUDIT_PATH, SUMMARY_PATH, load_plan
from src.security import assert_allowlisted_result, secret_findings, text_findings


def _atomic_json(path: Any, value: dict[str, Any]) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(value, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def audit_summary() -> dict[str, Any]:
    plan = load_plan()
    text = SUMMARY_PATH.read_text(encoding="utf-8")
    summary = json.loads(text)
    results = summary.get("results")
    if not isinstance(results, list):
        raise RuntimeError("Summary results must be a list.")

    forbidden_findings = 0
    for result in results:
        try:
            assert_allowlisted_result(result)
        except ValueError:
            forbidden_findings += 1

    planned_ids = [case["case_id"] for case in plan["cases"]]
    result_ids = [
        result.get("case_id") for result in results if isinstance(result, dict)
    ]
    text_scan = text_findings(text)
    checks = {
        "summary_is_completed": summary.get("status") == "completed",
        "result_count_matches_plan": len(results) == len(planned_ids),
        "case_order_matches_plan": result_ids == planned_ids,
        "request_count_matches_summary": summary.get("provider_requests_issued")
        == sum(
            1
            for result in results
            if isinstance(result, dict) and result.get("request_issued") is True
        ),
        "request_count_within_cap": summary.get("provider_requests_issued", 17)
        <= plan["provider_request_cap"],
        "concurrency_is_one": summary.get("concurrency") == 1,
        "automatic_retries_are_zero": summary.get("automatic_retries") == 0,
        "forbidden_fields_are_zero": forbidden_findings == 0,
        "secret_findings_are_zero": secret_findings(text) == 0,
        "non_ascii_characters_are_zero": text_scan["non_ascii_characters"] == 0,
        "mojibake_matches_are_zero": text_scan["mojibake_matches"] == 0,
    }
    audit = {
        "schema_version": 1,
        "status": "pass" if all(checks.values()) else "fail",
        "audited_at_utc": datetime.now(timezone.utc).isoformat(),
        "summary_status": summary.get("status"),
        "planned_case_count": len(planned_ids),
        "result_count": len(results),
        "provider_request_cap": plan["provider_request_cap"],
        "provider_requests_issued": summary.get("provider_requests_issued"),
        "forbidden_result_field_findings": forbidden_findings,
        "secret_findings": secret_findings(text),
        **text_scan,
        "checks": checks,
    }
    _atomic_json(AUDIT_PATH, audit)
    if audit["status"] != "pass":
        raise RuntimeError("Privacy audit failed.")
    return audit


def main() -> int:
    audit_summary()
    print("Privacy audit passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
