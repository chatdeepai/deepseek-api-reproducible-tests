import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { atomicWriteJson, readJson } from "./io.mjs";
import { loadFrozenPlan } from "./plan.mjs";
import { auditLiveSummary } from "./postrun.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

try {
  const { plan, sha256 } = await loadFrozenPlan();
  const summary = await readJson(join(root, "results", "live-summary.json"));
  const audit = auditLiveSummary({
    plan,
    planSha256: sha256,
    summary,
  });
  await atomicWriteJson(
    join(root, "results", "live-privacy-audit.json"),
    audit,
  );
  if (audit.status !== "pass") {
    throw new Error("The live evidence audit failed.");
  }
  console.log("Live evidence audit passed without modifying the live summary.");
} catch {
  console.error("The live evidence audit did not produce a publishable pass.");
  process.exitCode = 1;
}
