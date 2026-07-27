import { runLockedLive } from "./live-guard.mjs";

try {
  await runLockedLive();
} catch {
  console.error(
    "Live execution is locked: the frozen observability study is complete and its credential was revoked.",
  );
  process.exitCode = 1;
}
