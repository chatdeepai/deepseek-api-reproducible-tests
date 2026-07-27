import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readJson } from "../source/io.mjs";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = dirname(TEST_DIR);

export function clone(value) {
  return structuredClone(value);
}

export async function loadFixtures() {
  const fixtureDir = join(ROOT_DIR, "fixtures");
  const [dataset, responses, calibration, pricing, livePlan] =
    await Promise.all([
      readJson(join(fixtureDir, "golden-dataset.json")),
      readJson(join(fixtureDir, "offline-responses.json")),
      readJson(join(fixtureDir, "human-review-calibration.json")),
      readJson(join(fixtureDir, "pricing-snapshot.json")),
      readJson(join(fixtureDir, "live-plan.json")),
    ]);
  return { dataset, responses, calibration, pricing, livePlan };
}
