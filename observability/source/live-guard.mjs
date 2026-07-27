export async function runLockedLive() {
  throw new Error(
    "The frozen observability study is complete; live execution is locked.",
  );
}
