from __future__ import annotations

import json
from importlib.metadata import version
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PLAN_PATH = ROOT / "fixtures" / "request-plan.json"
RESULTS_DIR = ROOT / "results"
SUMMARY_PATH = RESULTS_DIR / "live-summary.json"
LEDGER_PATH = RESULTS_DIR / "run-ledger.json"
AUDIT_PATH = RESULTS_DIR / "privacy-audit.json"

PINNED_PACKAGES = {
    "llama-index-core": "0.14.23",
    "llama-index-llms-deepseek": "0.3.0",
    "llama-index-llms-openai-like": "0.5.3",
    "llama-index-llms-openai": "0.6.26",
    "openai": "2.48.0",
    "pydantic": "2.13.4",
}


def load_plan() -> dict[str, Any]:
    return json.loads(PLAN_PATH.read_text(encoding="utf-8"))


def installed_versions() -> dict[str, str]:
    return {name: version(name) for name in PINNED_PACKAGES}


def assert_installed_versions() -> None:
    actual = installed_versions()
    if actual != PINNED_PACKAGES:
        raise RuntimeError(f"Pinned package mismatch: {actual!r}")
