from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path

from src.budget import RequestBudget
from src.config import PINNED_PACKAGES, assert_installed_versions, load_plan
from src.security import assert_allowlisted_result, secret_findings, text_findings


EXPECTED_CASE_IDS = [
    "py-chat-sync-v4-flash",
    "py-chat-async-v4-flash",
    "py-complete-sync-v4-flash",
    "py-complete-async-v4-flash",
    "py-chat-stream-sync-v4-flash",
    "py-chat-stream-async-v4-flash",
    "py-complete-stream-sync-v4-flash",
    "py-complete-stream-async-v4-flash",
    "py-chat-v4-pro-thinking",
    "py-structured-predict-v4-flash",
    "py-tool-call-initial-v4-flash",
    "py-tool-call-continuation-v4-flash",
    "py-local-rag-query-engine-v4-flash",
    "py-alias-deepseek-chat-probe",
    "py-alias-deepseek-reasoner-probe",
    "py-invalid-model-error",
]


class ContractTests(unittest.TestCase):
    def test_installed_versions_match_exact_pins(self) -> None:
        assert_installed_versions()
        self.assertEqual(PINNED_PACKAGES["llama-index-core"], "0.14.23")

    def test_plan_is_exact_ordered_and_bounded(self) -> None:
        plan = load_plan()
        self.assertEqual(plan["provider_request_cap"], 16)
        self.assertEqual(plan["planned_provider_requests"], 16)
        self.assertEqual(plan["concurrency"], 1)
        self.assertEqual(plan["automatic_retries"], 0)
        self.assertEqual([case["case_id"] for case in plan["cases"]], EXPECTED_CASE_IDS)

    def test_every_case_declares_expected_evidence_fields(self) -> None:
        for case in load_plan()["cases"]:
            self.assertTrue(case["expected_evidence_fields"])
            self.assertEqual(case["runtime"], "python")

    def test_budget_rejects_duplicate_and_seventeenth_reservation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            budget = RequestBudget(Path(directory) / "ledger.json", cap=16)
            budget.initialize()
            budget.reserve("case-00")
            with self.assertRaises(RuntimeError):
                budget.reserve("case-00")
            for index in range(1, 16):
                budget.reserve(f"case-{index:02d}")
            with self.assertRaises(RuntimeError):
                budget.reserve("case-16")
            self.assertEqual(budget.snapshot()["issued"], 16)

    def test_result_policy_rejects_raw_and_unknown_fields(self) -> None:
        valid = {
            "case_id": "case",
            "runtime": "python",
            "scenario": "chat",
            "execution": "sync",
            "requested_model": "model",
            "thinking": "disabled",
            "request_issued": True,
            "status": 200,
            "outcome": "success",
            "elapsed_ms": 1,
            "content_nonempty": True,
        }
        assert_allowlisted_result(valid)
        with self.assertRaises(ValueError):
            assert_allowlisted_result({**valid, "raw": {"id": "forbidden"}})
        with self.assertRaises(ValueError):
            assert_allowlisted_result({**valid, "unregistered": True})

    def test_text_scans_detect_secrets_non_ascii_and_mojibake(self) -> None:
        self.assertEqual(secret_findings("ordinary ASCII"), 0)
        self.assertEqual(secret_findings("Bearer " + ("A" * 16)), 1)
        findings = text_findings("ASCII \u2019 \u00e2\u20ac")
        self.assertGreater(findings["non_ascii_characters"], 0)
        self.assertGreater(findings["mojibake_matches"], 0)

    def test_live_coordinator_is_inert_without_explicit_opt_in(self) -> None:
        previous = os.environ.pop("ALLOW_PROVIDER_REQUESTS", None)
        try:
            from src.live_runner import main

            with self.assertRaisesRegex(RuntimeError, "explicit opt-in"):
                main()
        finally:
            if previous is not None:
                os.environ["ALLOW_PROVIDER_REQUESTS"] = previous


if __name__ == "__main__":
    unittest.main()
