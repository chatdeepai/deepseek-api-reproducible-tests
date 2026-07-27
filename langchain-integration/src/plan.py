"""Frozen cross-runtime provider request-plan loading and validation."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PLAN_PATH = ROOT / "fixtures" / "request-plan.json"
EXPECTED_PYTHON_VERSIONS = {
    "langchain": "1.3.14",
    "langchain-deepseek": "1.1.0",
    "langchain-openai": "1.4.1",
    "langchain-core": "1.5.1",
    "openai": "2.48.0",
    "pydantic": "2.13.4",
}
EXPECTED_JAVASCRIPT_VERSIONS = {
    "@langchain/deepseek": "1.1.5",
    "@langchain/core": "1.2.3",
    "zod": "4.4.3",
    "node_minimum": "20",
}


def load_plan() -> dict[str, Any]:
    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    validate_plan(plan)
    return plan


def validate_plan(plan: dict[str, Any]) -> None:
    cases = plan.get("cases")
    if not isinstance(cases, list):
        raise ValueError("Plan must contain a cases array.")
    if plan.get("status") != "not_run":
        raise ValueError("The frozen plan must remain marked not_run.")
    if plan.get("provider_origin") != "https://api.deepseek.com":
        raise ValueError("The provider origin must remain exact.")
    if plan.get("provider_request_cap") != 16:
        raise ValueError("The provider request cap must remain exactly 16.")
    if plan.get("planned_provider_requests") != 16 or len(cases) != 16:
        raise ValueError("The plan must contain exactly 16 provider cases.")
    if plan.get("concurrency") != 1 or plan.get("automatic_retries") != 0:
        raise ValueError("The live plan must use concurrency 1 and zero retries.")

    versions = plan.get("versions", {})
    if versions.get("python") != EXPECTED_PYTHON_VERSIONS:
        raise ValueError("Unexpected Python dependency pins.")
    if versions.get("javascript") != EXPECTED_JAVASCRIPT_VERSIONS:
        raise ValueError("Unexpected JavaScript dependency pins.")

    sequences = [case.get("sequence") for case in cases]
    if sequences != list(range(1, 17)):
        raise ValueError("Case sequences must be contiguous and ordered.")
    ids = [case.get("id") for case in cases]
    if len(ids) != len(set(ids)):
        raise ValueError("Case IDs must be unique.")

    python_cases = [case for case in cases if case.get("runtime") == "python"]
    javascript_cases = [case for case in cases if case.get("runtime") == "javascript"]
    if len(python_cases) != 11 or len(javascript_cases) != 5:
        raise ValueError("The plan must contain 11 Python and five JavaScript cases.")

    scenario_counts = {
        scenario: sum(case.get("scenario") == scenario for case in cases)
        for scenario in {
            "invoke",
            "stream",
            "structured_output",
            "tool_initial",
            "tool_continuation",
            "local_context_rag",
            "alias_probe",
            "invalid_model",
        }
    }
    expected = {
        "invoke": 4,
        "stream": 3,
        "structured_output": 2,
        "tool_initial": 1,
        "tool_continuation": 1,
        "local_context_rag": 1,
        "alias_probe": 2,
        "invalid_model": 2,
    }
    if scenario_counts != expected:
        raise ValueError(f"Unexpected scenario matrix: {scenario_counts}")

    aliases = {
        case["model"] for case in cases if case.get("scenario") == "alias_probe"
    }
    if aliases != {"deepseek-chat", "deepseek-reasoner"}:
        raise ValueError("The plan must contain the two frozen alias probes.")

    for case in cases:
        if case.get("thinking") not in {"enabled", "disabled"}:
            raise ValueError(f"Thinking must be explicit for {case.get('id')}.")
        max_tokens = case.get("max_tokens")
        if not isinstance(max_tokens, int) or not 16 <= max_tokens <= 96:
            raise ValueError(f"Invalid token cap for {case.get('id')}.")


def cases_for_runtime(plan: dict[str, Any], runtime: str) -> list[dict[str, Any]]:
    return [case for case in plan["cases"] if case["runtime"] == runtime]
