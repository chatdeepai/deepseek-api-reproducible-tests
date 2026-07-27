import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const suiteDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modules = [
  "src/env-guard.mjs",
  "src/tool-choice.mjs",
  "src/strict-schema.mjs",
  "src/argument-validator.mjs",
  "src/replay.mjs",
  "src/summarize.mjs",
  "src/redact.mjs",
  "src/secret-scan.mjs",
  "src/orchestrator.mjs",
  "src/live-runner.mjs",
  "src/live-followup.mjs",
  "src/offline-runner.mjs",
  "fixtures/scenarios.mjs",
  "tests/offline.test.mjs"
];

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: suiteDirectory,
    stdio: "inherit",
    windowsHide: true
  });
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    return false;
  }
  return true;
}

for (const modulePath of modules) {
  if (!run(["--check", modulePath])) break;
}

if (!process.exitCode && !process.argv.includes("--syntax-only")) {
  run(["--test", "tests/offline.test.mjs"]);
}
