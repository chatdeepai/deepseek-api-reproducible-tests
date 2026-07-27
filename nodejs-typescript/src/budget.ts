import { constants } from "node:fs";
import { access, mkdir, open } from "node:fs/promises";
import { dirname, join } from "node:path";

import { atomicWriteJson, readJsonFile } from "./io.js";
import type { RunLedgerState } from "./types.js";

const RUN_STATE_FILES = [
  "run-ledger.json",
  "live-summary.json",
  "privacy-audit.json",
  "run-in-progress.json",
];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function assertFreshResults(resultsDirectory: string): Promise<void> {
  for (const name of RUN_STATE_FILES) {
    if (await exists(join(resultsDirectory, name))) {
      throw new Error("Prior run state exists; refusing an ambiguous rerun.");
    }
  }
}
export class RequestLedger {
  readonly path: string;
  readonly cap: number;
  readonly planSha256: string;

  constructor(path: string, options: { cap: number; planSha256: string }) {
    this.path = path;
    this.cap = options.cap;
    this.planSha256 = options.planSha256;
  }

  async initialize(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const handle = await open(this.path, "wx");
    try {
      const initial: RunLedgerState = {
        schema_version: 1,
        status: "running",
        plan_sha256: this.planSha256,
        cap: this.cap,
        issued: 0,
        case_ids: [],
      };
      await handle.writeFile(`${JSON.stringify(initial, null, 2)}\n`, "utf8");
    } finally {
      await handle.close();
    }
  }

  async reserve(caseId: string): Promise<number> {
    const state = await this.snapshot();
    this.assertValid(state, "running");
    if (state.issued >= this.cap) {
      throw new Error("Provider request cap reached.");
    }
    if (state.case_ids.includes(caseId)) {
      throw new Error("A provider case cannot reserve twice.");
    }
    const updated: RunLedgerState = {
      ...state,
      issued: state.issued + 1,
      case_ids: [...state.case_ids, caseId],
    };
    await atomicWriteJson(this.path, updated);
    return updated.issued;
  }

  async complete(): Promise<RunLedgerState> {
    const state = await this.snapshot();
    this.assertValid(state, "running");
    const completed: RunLedgerState = { ...state, status: "completed" };
    await atomicWriteJson(this.path, completed);
    return completed;
  }

  async interrupt(): Promise<void> {
    const state = await this.snapshot();
    if (state.status !== "running") {
      return;
    }
    this.assertValid(state, "running");
    await atomicWriteJson(this.path, {
      ...state,
      status: "interrupted",
      interruption_code: "run_interrupted",
    } satisfies RunLedgerState);
  }

  async snapshot(): Promise<RunLedgerState> {
    return readJsonFile<RunLedgerState>(this.path);
  }

  private assertValid(
    state: RunLedgerState,
    expectedStatus: RunLedgerState["status"],
  ): void {
    if (
      state.schema_version !== 1 ||
      state.status !== expectedStatus ||
      state.plan_sha256 !== this.planSha256 ||
      state.cap !== this.cap ||
      !Number.isInteger(state.issued) ||
      state.issued < 0 ||
      state.issued > this.cap ||
      !Array.isArray(state.case_ids) ||
      state.case_ids.length !== state.issued ||
      new Set(state.case_ids).size !== state.case_ids.length
    ) {
      throw new Error("Run ledger validation failed.");
    }
  }
}
