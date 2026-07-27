import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const DEFAULT_PLAN_PATH = fileURLToPath(
  new URL("../fixtures/live-plan-frozen.json", import.meta.url),
);

const EXPECTED_CASES = [
  ["OBS-LIVE-01", "deepseek-v4-flash", 24],
  ["OBS-LIVE-02", "deepseek-v4-flash", 48],
  ["OBS-LIVE-03", "deepseek-v4-flash", 64],
  ["OBS-LIVE-04", "deepseek-v4-flash", 96],
  ["OBS-LIVE-05", "deepseek-v4-pro", 128],
  ["OBS-LIVE-06", "deepseek-v4-flash", 12],
  ["OBS-LIVE-07", "deepseek-v4-flash", 12],
  ["OBS-LIVE-08", "deepseek-observability-invalid", 8],
];

export function validateFrozenPlan(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new Error("The frozen live plan must be an object.");
  }
  if (
    plan.study !== "DeepSeek Observability live telemetry study" ||
    typeof plan.plan_frozen_at_utc !== "string"
  ) {
    throw new Error("The frozen live plan identity changed.");
  }
  if (
    plan.preflight?.models_endpoint_completed_before_freeze !== true ||
    plan.preflight.models_endpoint_status !== 200 ||
    plan.preflight.paid_generation_requests_completed_before_freeze !== 0 ||
    JSON.stringify(plan.preflight.models_observed) !==
      JSON.stringify(["deepseek-v4-flash", "deepseek-v4-pro"])
  ) {
    throw new Error("The frozen preflight record changed.");
  }
  if (
    plan.constraints?.concurrency !== 1 ||
    plan.constraints.provider_retries !== 0 ||
    plan.constraints.request_timeout_ms !== 30_000
  ) {
    throw new Error("The frozen execution controls changed.");
  }
  const privacyFlags = [
    "raw_prompt_storage",
    "raw_output_storage",
    "provider_request_id_storage",
    "api_key_storage",
  ];
  if (
    privacyFlags.some((key) => plan.constraints[key] !== false) ||
    plan.constraints.public_results_are_sanitized !== true
  ) {
    throw new Error("The frozen privacy controls changed.");
  }
  if (!Array.isArray(plan.cases) || plan.cases.length !== EXPECTED_CASES.length) {
    throw new Error("The frozen case count changed.");
  }

  for (let index = 0; index < EXPECTED_CASES.length; index += 1) {
    const item = plan.cases[index];
    const [id, model, maxTokens] = EXPECTED_CASES[index];
    if (
      item?.id !== id ||
      item.model !== model ||
      item.max_tokens !== maxTokens ||
      !["enabled", "disabled"].includes(item.thinking) ||
      typeof item.purpose !== "string" ||
      item.purpose.length < 20
    ) {
      throw new Error(`Frozen live case ${index + 1} changed.`);
    }
  }
  if (plan.cases[7].expected_http_status !== 400) {
    throw new Error("The invalid-model control changed.");
  }
  return plan;
}

export async function loadFrozenPlan(path = DEFAULT_PLAN_PATH) {
  const encoded = await readFile(path, "utf8");
  const plan = validateFrozenPlan(JSON.parse(encoded));
  return {
    plan,
    sha256: createHash("sha256").update(encoded, "utf8").digest("hex"),
  };
}

export const EXPECTED_LIVE_CASE_COUNT = EXPECTED_CASES.length;
