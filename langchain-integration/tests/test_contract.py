from __future__ import annotations

import importlib.metadata
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from src.budget import RequestBudget
from src.plan import EXPECTED_PYTHON_VERSIONS, load_plan
from src.postrun import audit_summary
from src.security import assert_allowlisted_result, secret_findings, text_findings


class ContractTests(unittest.TestCase):
    def test_plan_is_exact_and_frozen(self) -> None:
        plan = load_plan()
        self.assertEqual(plan["provider_request_cap"], 16)
        self.assertEqual(len(plan["cases"]), 16)
        self.assertEqual(
            [case["sequence"] for case in plan["cases"]],
            list(range(1, 17)),
        )
        self.assertEqual(
            [case["model"] for case in plan["cases"] if case["scenario"] == "alias_probe"],
            ["deepseek-chat", "deepseek-reasoner"],
        )

    def test_installed_python_versions_match_pins(self) -> None:
        observed = {
            distribution: importlib.metadata.version(distribution)
            for distribution in EXPECTED_PYTHON_VERSIONS
        }
        self.assertEqual(observed, EXPECTED_PYTHON_VERSIONS)
        from langchain.agents import create_agent
        from langchain.tools import tool

        self.assertTrue(callable(create_agent))
        self.assertTrue(callable(tool))

    def test_budget_refuses_duplicate_and_seventeenth_reservation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "ledger.json"
            budget = RequestBudget(path, cap=16)
            budget.initialize()
            for index in range(16):
                self.assertEqual(budget.reserve(f"case-{index + 1}"), index + 1)
            with self.assertRaises(RuntimeError):
                budget.reserve("case-17")

    def test_result_policy_rejects_raw_fields_and_sensitive_text(self) -> None:
        safe = {"results": [{"case_id": "x", "content_nonempty": True}]}
        assert_allowlisted_result(safe)
        with self.assertRaises(ValueError):
            assert_allowlisted_result({"results": [{"content": "not allowed"}]})
        text = json.dumps(safe)
        self.assertEqual(secret_findings(text), 0)
        self.assertEqual(
            text_findings(text),
            {"non_ascii_characters": 0, "mojibake_matches": 0},
        )

    def test_live_coordinator_is_inert_without_explicit_opt_in(self) -> None:
        from src.live_runner import main

        environment = dict(os.environ)
        environment.pop("ALLOW_PROVIDER_REQUESTS", None)
        environment.pop("DEEPSEEK_API_KEY", None)
        with patch.dict(os.environ, environment, clear=True):
            with self.assertRaises(SystemExit):
                main()

    def test_postrun_privacy_audit_accepts_only_ordered_sanitized_metadata(self) -> None:
        plan = load_plan()
        summary = {
            "status": "offline_fixture",
            "provider_requests_issued": 0,
            "concurrency": 1,
            "automatic_retries": 0,
            "results": [
                {
                    "case_id": case["id"],
                    "request_issued": False,
                    "outcome": "not_run",
                }
                for case in plan["cases"]
            ],
        }
        audit = audit_summary(summary)
        self.assertEqual(audit["status"], "pass")
        self.assertEqual(audit["secret_findings"], 0)
        self.assertEqual(audit["non_ascii_characters"], 0)


if __name__ == "__main__":
    unittest.main()
