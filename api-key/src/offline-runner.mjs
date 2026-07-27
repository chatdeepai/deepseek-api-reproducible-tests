import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const suiteDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modules = [
  "src/env-guard.mjs",
  "src/redact.mjs",
  "src/secret-scan.mjs",
  "src/rotation-state.mjs",
  "src/live-runner.mjs",
  "src/offline-runner.mjs",
  "tests/offline.test.mjs"
];

function run(commandArgs) {
  const result = spawnSync(process.execPath, commandArgs, {
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
  if (!run(["--check", modulePath])) {
    break;
  }
}

if (!process.exitCode && !process.argv.includes("--syntax-only")) {
  run(["--test", "tests/offline.test.mjs"]);
}
