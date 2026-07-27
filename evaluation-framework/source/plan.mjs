import { createHash } from "node:crypto";

const REQUIRED_FALSE_POLICY_FIELDS = [
  "persist_api_key",
  "persist_headers",
  "persist_provider_request_bodies",
  "persist_provider_response_bodies",
  "persist_provider_reasoning",
  "persist_provider_tool_arguments",
  "persist_provider_tool_results",
  "persist_provider_identifiers",
  "persist_account_data",
  "persist_raw_errors",
  "persist_local_paths",
];

function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function validateLivePlan(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new Error("Live plan must be an object.");
  }
  if (
    plan.schema_version !== 1 ||
    plan.status !== "not_run" ||
    plan.planned_provider_requests !== 12 ||
    plan.provider_request_cap !== 12 ||
    plan.concurrency !== 1 ||
    plan.automatic_retries !== 0 ||
    plan.timeout_ms !== 30000
  ) {
    throw new Error("Live plan safety limits or status changed.");
  }
  if (!Array.isArray(plan.cases) || plan.cases.length !== 12) {
    throw new Error("Live plan must contain exactly twelve cases.");
  }
  const sequences = plan.cases.map((item) => item.sequence);
  if (sequences.some((value, index) => value !== index + 1)) {
    throw new Error("Live plan cases must remain serial and ordered.");
  }
  const keys = new Set();
  for (const item of plan.cases) {
    if (!["baseline", "candidate"].includes(item.variant)) {
      throw new Error("Live plan variant is invalid.");
    }
    const expectedModel =
      item.variant === "baseline"
        ? plan.baseline_model
        : plan.candidate_model;
    if (item.model !== expectedModel) {
      throw new Error("Live plan variant and model do not match.");
    }
    const key = `${item.task_id}:${item.variant}`;
    if (keys.has(key)) throw new Error("Live plan task variant is duplicated.");
    keys.add(key);
  }
  if (keys.size !== 12) {
    throw new Error("Live plan must contain six complete pairs.");
  }
  if (
    plan.evidence_policy?.publish_synthetic_fixture_inputs !== true ||
    REQUIRED_FALSE_POLICY_FIELDS.some(
      (field) => plan.evidence_policy?.[field] !== false,
    )
  ) {
    throw new Error("Live plan evidence policy changed.");
  }
  return {
    status: plan.status,
    planned_provider_requests: plan.planned_provider_requests,
    concurrency: plan.concurrency,
    automatic_retries: plan.automatic_retries,
    pair_count: plan.cases.length / 2,
    synthetic_fixture_inputs_public: true,
  };
}

export function canonicalPlanJson(plan) {
  validateLivePlan(plan);
  return canonicalize(plan);
}

export function hashLivePlan(plan) {
  return createHash("sha256").update(canonicalPlanJson(plan), "utf8").digest("hex");
}

export function buildPlanHashArtifact(plan) {
  const validation = validateLivePlan(plan);
  return {
    schema_version: 1,
    artifact_id: "deepseek-evaluation-live-plan-hash-v1",
    algorithm: "SHA-256",
    canonicalization: "recursive-key-sort-json-v1",
    plan_status: validation.status,
    planned_provider_requests: validation.planned_provider_requests,
    concurrency: validation.concurrency,
    automatic_retries: validation.automatic_retries,
    digest_hex: hashLivePlan(plan),
    provider_requests_made: 0,
  };
}
