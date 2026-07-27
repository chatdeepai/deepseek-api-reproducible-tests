import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readJson } from "./io.mjs";
import {
  assertPrivacySafe,
  publicPrivacySummary,
} from "./privacy.mjs";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = dirname(MODULE_DIR);

export async function auditGeneratedResults(options = {}) {
  const resultsDir = options.resultsDir ?? join(ROOT_DIR, "results");
  const names = [
    "offline-summary.json",
    "human-calibration-summary.json",
    "live-plan-hash.json",
  ];
  const artifacts = await Promise.all(
    names.map((name) => readJson(join(resultsDir, name))),
  );
  return publicPrivacySummary(
    artifacts.map((artifact) => assertPrivacySafe(artifact)),
  );
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const summary = await auditGeneratedResults();
  process.stdout.write(
    `${JSON.stringify({
      passed: summary.passed,
      artifact_count: summary.artifact_count,
      issue_count: summary.issue_count,
    })}\n`,
  );
}
