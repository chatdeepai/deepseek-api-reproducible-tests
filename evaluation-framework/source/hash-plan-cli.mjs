import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { atomicWriteJson, readJson } from "./io.mjs";
import { buildPlanHashArtifact } from "./plan.mjs";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = dirname(MODULE_DIR);

export async function writePlanHash(options = {}) {
  const planPath =
    options.planPath ?? join(ROOT_DIR, "fixtures", "live-plan.json");
  const outputPath =
    options.outputPath ?? join(ROOT_DIR, "results", "live-plan-hash.json");
  const plan = await readJson(planPath);
  const artifact = buildPlanHashArtifact(plan);
  await atomicWriteJson(outputPath, artifact);
  return artifact;
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const artifact = await writePlanHash();
  process.stdout.write(`${artifact.digest_hex}\n`);
}
