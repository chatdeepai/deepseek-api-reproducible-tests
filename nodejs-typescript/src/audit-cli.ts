import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { atomicWriteJson, readJsonFile } from "./io.js";
import { loadPlan } from "./plan.js";
import { auditSummary } from "./postrun.js";
import type { RunLedgerState } from "./types.js";

const resultsDirectory = fileURLToPath(new URL("../../results/", import.meta.url));

try {
  const { plan } = await loadPlan();
  const summary = await readJsonFile<unknown>(
    join(resultsDirectory, "live-summary.json"),
  );
  const ledger = await readJsonFile<RunLedgerState>(
    join(resultsDirectory, "run-ledger.json"),
  );
  const audit = auditSummary(summary, plan, ledger);
  await atomicWriteJson(join(resultsDirectory, "privacy-audit.json"), audit);
  if (audit.status !== "pass") {
    throw new Error("Audit failed.");
  }
  console.log("Privacy audit passed.");
} catch {
  console.error("Privacy audit did not produce a publishable pass.");
  process.exitCode = 1;
}
