import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { PlanCase, PlanSnapshot, RequestPlan, Scenario } from "./types.js";

const PLAN_PATH = fileURLToPath(
  new URL("../../fixtures/request-plan.json", import.meta.url),
);

const EXPECTED_CASES: ReadonlyArray<
  Readonly<Pick<PlanCase, "id" | "scenario" | "model" | "thinking" | "max_tokens">>
> = [
  {
    id: "node-ordinary-chat-v4-flash",
    scenario: "ordinary_chat",
    model: "deepseek-v4-flash",
    thinking: "disabled",
    max_tokens: 32,
  },
  {
    id: "node-stream-v4-flash",
    scenario: "streaming",
    model: "deepseek-v4-flash",
    thinking: "disabled",
    max_tokens: 32,
  },
  {
    id: "node-json-mode-v4-flash",
    scenario: "json_output",
    model: "deepseek-v4-flash",
    thinking: "disabled",
    max_tokens: 64,
  },
  {
    id: "node-tool-initial-v4-flash",
    scenario: "tool_initial",
    model: "deepseek-v4-flash",
    thinking: "disabled",
    max_tokens: 64,
  },
  {
    id: "node-tool-continuation-v4-flash",
    scenario: "tool_continuation",
    model: "deepseek-v4-flash",
    thinking: "disabled",
    max_tokens: 48,
  },
  {
    id: "node-thinking-v4-pro",
    scenario: "thinking",
    model: "deepseek-v4-pro",
    thinking: "enabled",
    max_tokens: 96,
  },
  {
    id: "node-alias-deepseek-chat",
    scenario: "alias_probe",
    model: "deepseek-chat",
    thinking: "disabled",
    max_tokens: 16,
  },
  {
    id: "node-alias-deepseek-reasoner",
    scenario: "alias_probe",
    model: "deepseek-reasoner",
    thinking: "enabled",
    max_tokens: 32,
  },
  {
    id: "node-invalid-model-error",
    scenario: "invalid_model",
    model: "deepseek-does-not-exist",
    thinking: "disabled",
    max_tokens: 16,
  },
];

const SCENARIOS = new Set<Scenario>([
  "ordinary_chat",
  "streaming",
  "json_output",
  "tool_initial",
  "tool_continuation",
  "thinking",
  "alias_probe",
  "invalid_model",
]);

function sameExpectedCase(actual: PlanCase, expected: (typeof EXPECTED_CASES)[number]): boolean {
  return (
    actual.id === expected.id &&
    actual.scenario === expected.scenario &&
    actual.model === expected.model &&
    actual.thinking === expected.thinking &&
    actual.max_tokens === expected.max_tokens
  );
}

export function validatePlan(value: unknown): asserts value is RequestPlan {
  if (!value || typeof value !== "object") {
    throw new Error("The request plan must be an object.");
  }
  const plan = value as Partial<RequestPlan>;
  if (!Array.isArray(plan.cases)) {
    throw new Error("The request plan must contain cases.");
  }
  if (
    plan.schema_version !== 1 ||
    plan.status !== "not_run" ||
    plan.provider_origin !== "https://api.deepseek.com"
  ) {
    throw new Error("The frozen request plan header changed.");
  }
  if (
    plan.provider_request_cap !== 9 ||
    plan.planned_provider_requests !== 9 ||
    plan.cases.length !== 9
  ) {
    throw new Error("The provider request cap must remain exactly nine.");
  }
  if (
    plan.concurrency !== 1 ||
    plan.automatic_retries !== 0 ||
    plan.default_timeout_ms !== 30000
  ) {
    throw new Error("Concurrency, retry, or timeout controls changed.");
  }
  if (
    plan.versions?.openai !== "6.49.0" ||
    plan.versions.typescript !== "7.0.2" ||
    plan.versions["@types/node"] !== "24.13.3" ||
    plan.versions.node_minimum !== "20"
  ) {
    throw new Error("A frozen dependency pin changed.");
  }
  if (
    !plan.evidence_policy ||
    Object.values(plan.evidence_policy).some((allowed) => allowed !== false)
  ) {
    throw new Error("Every persistence policy must remain false.");
  }

  const ids = new Set<string>();
  for (let index = 0; index < plan.cases.length; index += 1) {
    const actual = plan.cases[index];
    const expected = EXPECTED_CASES[index];
    if (!actual || !expected || !sameExpectedCase(actual, expected)) {
      throw new Error(`Frozen case ${index + 1} changed.`);
    }
    if (
      actual.sequence !== index + 1 ||
      !SCENARIOS.has(actual.scenario) ||
      ids.has(actual.id) ||
      typeof actual.acceptance !== "string" ||
      actual.acceptance.length < 20
    ) {
      throw new Error(`Frozen case ${index + 1} is invalid.`);
    }
    if (
      actual.reasoning_effort !== (actual.thinking === "enabled" ? "high" : null)
    ) {
      throw new Error(`Frozen case ${index + 1} has invalid reasoning controls.`);
    }
    ids.add(actual.id);
  }
}

export async function loadPlan(path = PLAN_PATH): Promise<PlanSnapshot> {
  const encoded = await readFile(path, "utf8");
  const parsed: unknown = JSON.parse(encoded);
  validatePlan(parsed);
  return {
    plan: parsed,
    sha256: createHash("sha256").update(encoded, "utf8").digest("hex"),
  };
}

export const EXPECTED_PROVIDER_REQUEST_CAP = 9;
