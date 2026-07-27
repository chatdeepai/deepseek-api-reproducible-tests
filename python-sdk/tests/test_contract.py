from __future__ import annotations

import copy
import unittest

from src.live_runner import run_live
from src.plan import load_plan, validate_plan
from src.security import (
    assert_allowlisted_result,
    language_findings,
    secret_findings,
)


class ContractTests(unittest.TestCase):
    def test_frozen_plan_is_exactly_fourteen_serial_zero_retry_cases(self) -> None:
        plan = load_plan()
        validate_plan(plan)
        self.assertEqual(plan["provider_request_cap"], 14)
        self.assertEqual(plan["planned_provider_requests"], 14)
        self.assertEqual(plan["concurrency"], 1)
        self.assertEqual(plan["automatic_retries"], 0)

    def test_client_and_scenario_matrix_is_complete(self) -> None:
        plan = load_plan()
        self.assertEqual(
            [case["client"] for case in plan["cases"]].count("sync"),
            6,
        )
        self.assertEqual(
            [case["client"] for case in plan["cases"]].count("async"),
            8,
        )
        self.assertEqual(
            [case["scenario"] for case in plan["cases"]].count("standard_chat"),
            4,
        )
        self.assertEqual(
            [case["scenario"] for case in plan["cases"]].count("streaming_chat"),
            4,
        )

    def test_thinking_is_explicit_and_generation_caps_are_low(self) -> None:
        plan = load_plan()
        self.assertTrue(
            all(case["thinking"] in {"enabled", "disabled"} for case in plan["cases"])
        )
        self.assertTrue(all(16 <= case["max_tokens"] <= 96 for case in plan["cases"]))
        enabled = [case for case in plan["cases"] if case["thinking"] == "enabled"]
        self.assertTrue(all(case["model"] == "deepseek-v4-pro" for case in enabled))
        self.assertTrue(all(case["reasoning_effort"] == "high" for case in enabled))

    def test_mutated_plan_is_rejected(self) -> None:
        plan = load_plan()
        mutated = copy.deepcopy(plan)
        mutated["automatic_retries"] = 2
        with self.assertRaisesRegex(ValueError, "zero retries"):
            validate_plan(mutated)

    def test_live_runner_fails_closed_before_importing_sdk(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "Provider requests are disabled"):
            run_live(api_key=None, allow_provider_requests=False)

    def test_result_allowlist_rejects_raw_fields(self) -> None:
        with self.assertRaisesRegex(ValueError, "Forbidden result field"):
            assert_allowlisted_result({"cases": [{"reasoning_content": "forbidden"}]})
        assert_allowlisted_result({"cases": [{"reasoning_nonempty": True}]})

    def test_secret_and_language_scans(self) -> None:
        synthetic_secret = "sk-" + ("A" * 24)
        self.assertEqual(secret_findings(synthetic_secret), 1)
        self.assertEqual(
            secret_findings("DEEPSEEK_API_KEY is read from the environment."),
            0,
        )
        self.assertEqual(language_findings("English-only synthetic fixture."), {
            "arabic_characters": 0,
            "mojibake_matches": 0,
        })


if __name__ == "__main__":
    unittest.main()

