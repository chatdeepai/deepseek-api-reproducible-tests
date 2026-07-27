"""Cross-process, serial provider-request accounting."""

from __future__ import annotations

import json
from pathlib import Path


class RequestBudget:
    def __init__(self, path: Path, *, cap: int) -> None:
        self.path = path
        self.cap = cap

    def initialize(self) -> None:
        if self.path.exists():
            raise RuntimeError("A prior run ledger exists; refusing an ambiguous rerun.")
        self._write({"schema_version": 1, "cap": self.cap, "issued": 0, "case_ids": []})

    def reserve(self, case_id: str) -> int:
        state = json.loads(self.path.read_text(encoding="utf-8"))
        if state.get("cap") != self.cap:
            raise RuntimeError("Run ledger cap mismatch.")
        issued = state.get("issued")
        case_ids = state.get("case_ids")
        if not isinstance(issued, int) or not isinstance(case_ids, list):
            raise RuntimeError("Invalid run ledger.")
        if issued >= self.cap:
            raise RuntimeError("Provider request cap reached.")
        if case_id in case_ids:
            raise RuntimeError("A case cannot reserve more than once.")
        state["issued"] = issued + 1
        state["case_ids"] = [*case_ids, case_id]
        self._write(state)
        return state["issued"]

    def snapshot(self) -> dict[str, object]:
        return json.loads(self.path.read_text(encoding="utf-8"))

    def _write(self, value: dict[str, object]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(value, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        temporary.replace(self.path)

