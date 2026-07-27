"""Frozen request-plan loading and validation."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PLAN_PATH = ROOT / "fixtures" / "request-plan.json"


def load_plan() -> dict[str, Any]:
    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    validate_plan(plan)
    return plan


def validate_plan(plan: dict[str, Any]) -> None:
    cases = plan.get("cases")
    if not isinstance(cases, list):
        raise ValueError("Plan must contain a cases array.")
    if plan.get("provider_request_cap") != 14:
        raise ValueError("The provider request cap must remain exactly 14.")
    if plan.get("planned_provider_requests") != 14 or len(cases) != 14:
        raise ValueError("The plan must contain exactly 14 provider cases.")
    if plan.get("concurrency") != 1 or plan.get("automatic_retries") != 0:
        raise ValueError("The live plan must use concurrency 1 and zero retries.")
    if plan.get("openai_python_version") != "2.48.0":
        raise ValueError("The preregistered OpenAI Python version must remain 2.48.0.")

    sequences = [case.get("sequence") for case in cases]
    if sequences != list(range(1, 15)):
        raise ValueError("Case sequences must be contiguous and ordered.")
    ids = [case.get("id") for case in cases]
    if len(ids) != len(set(ids)):
        raise ValueError("Case IDs must be unique.")

    sync_cases = [case for case in cases if case.get("client") == "sync"]
    async_cases = [case for case in cases if case.get("client") == "async"]
    if len(sync_cases) != 6 or len(async_cases) != 8:
        raise ValueError("The plan must contain six sync and eight async cases.")

    scenario_counts = {
        scenario: sum(case.get("scenario") == scenario for case in cases)
        for scenario in {
            "standard_chat",
            "streaming_chat",
            "json_output",
            "tool_initial",
            "tool_continuation",
            "invalid_model",
        }
    }
    expected = {
        "standard_chat": 4,
        "streaming_chat": 4,
        "json_output": 2,
        "tool_initial": 1,
        "tool_continuation": 1,
        "invalid_model": 2,
    }
    if scenario_counts != expected:
        raise ValueError(f"Unexpected scenario matrix: {scenario_counts}")

    for case in cases:
        max_tokens = case.get("max_tokens")
        if not isinstance(max_tokens, int) or not 16 <= max_tokens <= 96:
            raise ValueError(f"Invalid token cap for {case.get('id')}.")
        if case.get("thinking") not in {"enabled", "disabled"}:
            raise ValueError(f"Thinking must be explicit for {case.get('id')}.")


def cases_for_client(plan: dict[str, Any], client: str) -> list[dict[str, Any]]:
    return [case for case in plan["cases"] if case["client"] == client]

