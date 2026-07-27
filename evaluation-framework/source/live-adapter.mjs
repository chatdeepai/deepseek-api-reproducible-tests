import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { aggregateUsageCost } from "./cost.mjs";
import { validateGoldenDataset } from "./dataset.mjs";
import { evaluateTask } from "./evaluators.mjs";
import { atomicWriteJson, readJson } from "./io.mjs";
import { hashLivePlan, validateLivePlan } from "./plan.mjs";
import {
  auditPublicArtifact,
  publicPrivacySummary,
} from "./privacy.mjs";
import { scorePairedRegression } from "./regression.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const FIXTURES = join(ROOT, "fixtures");
const RESULTS = join(ROOT, "results");

function integerOr(value, fallback = 0) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function summarizeUsage(rawUsage) {
  const promptTokens = integerOr(rawUsage?.prompt_tokens);
  const completionTokens = integerOr(rawUsage?.completion_tokens);
  const totalTokens = integerOr(
    rawUsage?.total_tokens,
    promptTokens + completionTokens,
  );
  const hitReturned = Number.isSafeInteger(
    rawUsage?.prompt_cache_hit_tokens,
  );
  const missReturned = Number.isSafeInteger(
    rawUsage?.prompt_cache_miss_tokens,
  );
  const hitTokens = integerOr(rawUsage?.prompt_cache_hit_tokens);
  const missTokens = integerOr(
    rawUsage?.prompt_cache_miss_tokens,
    Math.max(0, promptTokens - hitTokens),
  );
  const reasoningReturned = Number.isSafeInteger(
    rawUsage?.completion_tokens_details?.reasoning_tokens,
  );
  const reasoningTokens = integerOr(
    rawUsage?.completion_tokens_details?.reasoning_tokens,
  );

  if (
    hitTokens + missTokens !== promptTokens ||
    promptTokens + completionTokens !== totalTokens ||
    reasoningTokens > completionTokens
  ) {
    throw new Error("Provider usage fields did not reconcile.");
  }

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    prompt_cache_hit_tokens: hitTokens,
    prompt_cache_miss_tokens: missTokens,
    reasoning_tokens: reasoningTokens,
    cache_usage_fields_returned: hitReturned && missReturned,
    reasoning_token_field_returned: reasoningReturned,
  };
}

function systemPromptFor(task) {
  if (task.kind === "exact") {
    return "Follow the output contract exactly. Do not add whitespace, punctuation, or explanation.";
  }
  if (task.kind === "json_schema") {
    return "Return one nonempty JSON object that follows the user's exact contract. Return JSON only.";
  }
  if (task.kind === "grounded_qa") {
    return "Use only the supplied synthetic reference context. If the requested fact is absent, return exactly INSUFFICIENT_CONTEXT. Do not infer missing facts.";
  }
  if (task.kind === "tool") {
    return "Select the single approved synthetic function that satisfies the request. Propose a function call only; never execute a function.";
  }
  if (task.kind === "math") {
    return "Solve the synthetic arithmetic task. Put the answer at the end as FINAL: number, with no text after it.";
  }
  throw new Error("Unsupported live task kind.");
}

function userPromptFor(task) {
  if (task.kind === "grounded_qa") {
    return `REFERENCE CONTEXT:\n${task.context}\n\nQUESTION:\n${task.question}`;
  }
  return task.instruction;
}

function buildRequest(task, plannedCase) {
  const body = {
    model: plannedCase.model,
    messages: [
      { role: "system", content: systemPromptFor(task) },
      { role: "user", content: userPromptFor(task) },
    ],
    thinking: { type: plannedCase.thinking },
    max_tokens: plannedCase.max_tokens,
    stream: false,
  };

  if (plannedCase.reasoning_effort) {
    body.reasoning_effort = plannedCase.reasoning_effort;
  }
  if (task.kind === "json_schema") {
    body.response_format = { type: "json_object" };
  }
  if (task.kind === "tool") {
    body.tools = task.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description:
          tool.name === task.expected.tool_name
            ? "Look up one approved synthetic record by its key."
            : "Summarize a synthetic record that has already been retrieved.",
        parameters: tool.schema,
      },
    }));
    body.tool_choice = "required";
  }
  return body;
}

export function responseForEvaluator(
  task,
  { message, finishReason, returnedModelMatches },
) {
  const toolCalls = Array.isArray(message?.tool_calls)
    ? message.tool_calls
    : [];
  const responseContract = {
    finish_reason: finishReason,
    returned_model_matches: returnedModelMatches,
    tool_call_count: toolCalls.length,
  };
  if (task.kind === "tool") {
    const proposal = toolCalls[0]?.function;
    return {
      ...responseContract,
      tool_call: proposal
        ? { name: proposal.name, arguments: proposal.arguments }
        : null,
    };
  }
  return {
    ...responseContract,
    text: typeof message?.content === "string" ? message.content : "",
  };
}

function variantSummary(rows, variant) {
  const selected = rows.filter((row) => row.variant === variant);
  const latencies = selected.map((row) => row.latency_ms);
  const successes = selected.filter((row) => row.passed).length;
  return {
    case_count: selected.length,
    pass_count: successes,
    fail_count: selected.length - successes,
    pass_rate:
      selected.length === 0
        ? null
        : Number((successes / selected.length).toFixed(6)),
    mean_latency_ms:
      selected.length === 0
        ? null
        : Math.round(
            latencies.reduce((total, value) => total + value, 0) /
              latencies.length,
          ),
    median_latency_ms: median(latencies),
    latency_is_not_an_sla: true,
  };
}

async function fileExists(path) {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function providerCall({
  apiKey,
  fetchImpl,
  task,
  plannedCase,
  timeoutMs,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetchImpl(
      "https://api.deepseek.com/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildRequest(task, plannedCase)),
        signal: controller.signal,
      },
    );
    const latencyMs = Date.now() - started;
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return {
      status: response.status,
      ok: response.ok,
      latencyMs,
      payload,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runLiveStudy({ apiKey, fetchImpl = globalThis.fetch }) {
  if (
    typeof apiKey !== "string" ||
    apiKey.length < 20 ||
    typeof fetchImpl !== "function"
  ) {
    throw new Error("A live key and fetch implementation are required.");
  }

  const datasetPath = join(FIXTURES, "golden-dataset.json");
  const planPath = join(FIXTURES, "live-plan.json");
  const pricingPath = join(FIXTURES, "pricing-snapshot.json");
  const hashArtifactPath = join(RESULTS, "live-plan-hash.json");
  const humanCalibrationPath = join(
    RESULTS,
    "human-calibration-summary.json",
  );
  const summaryPath = join(RESULTS, "live-summary.json");
  const ledgerPath = join(RESULTS, "live-run-ledger.json");
  const privacyPath = join(RESULTS, "live-privacy-audit.json");

  if (
    (await fileExists(summaryPath)) ||
    (await fileExists(ledgerPath))
  ) {
    throw new Error("A live run artifact already exists; refusing duplicates.");
  }

  const [dataset, plan, pricing, hashArtifact, humanCalibration] =
    await Promise.all([
      readJson(datasetPath),
      readJson(planPath),
      readJson(pricingPath),
      readJson(hashArtifactPath),
      readJson(humanCalibrationPath),
    ]);
  validateGoldenDataset(dataset);
  validateLivePlan(plan);

  const planDigest = hashLivePlan(plan);
  if (planDigest !== hashArtifact.digest_hex) {
    throw new Error("The live plan does not match its frozen digest.");
  }

  const datasetBytes = await readFile(datasetPath);
  const datasetDigest = createHash("sha256")
    .update(datasetBytes)
    .digest("hex");
  const taskMap = new Map(dataset.tasks.map((task) => [task.id, task]));
  const ledger = {
    schema_version: 1,
    artifact_id: "deepseek-evaluation-live-run-ledger-v1",
    status: "reserved",
    plan_digest_hex: planDigest,
    provider_request_cap: plan.provider_request_cap,
    provider_requests_reserved: plan.planned_provider_requests,
    provider_requests_attempted: 0,
    provider_requests_completed: 0,
    automatic_retries: 0,
    concurrency: 1,
  };
  await atomicWriteJson(ledgerPath, ledger);

  const rows = [];
  for (const plannedCase of plan.cases) {
    if (ledger.provider_requests_attempted >= plan.provider_request_cap) {
      throw new Error("The frozen provider request cap was reached.");
    }
    const task = taskMap.get(plannedCase.task_id);
    if (!task) throw new Error("A planned task is missing from the dataset.");

    ledger.provider_requests_attempted += 1;
    await atomicWriteJson(ledgerPath, ledger);
    const observation = await providerCall({
      apiKey,
      fetchImpl,
      task,
      plannedCase,
      timeoutMs: plan.timeout_ms,
    });
    ledger.provider_requests_completed += 1;

    if (!observation.ok || !observation.payload) {
      rows.push({
        sequence: plannedCase.sequence,
        task_id: plannedCase.task_id,
        variant: plannedCase.variant,
        model: plannedCase.model,
        critical: task.critical,
        http_status: observation.status,
        transport_passed: false,
        passed: false,
        score: 0,
        finish_reason: null,
        latency_ms: observation.latencyMs,
        response_text_retained: false,
        provider_payload_retained: false,
        provider_identifiers_retained: false,
        raw_error_retained: false,
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          prompt_cache_hit_tokens: 0,
          prompt_cache_miss_tokens: 0,
          reasoning_tokens: 0,
          cache_usage_fields_returned: false,
          reasoning_token_field_returned: false,
        },
      });
      await atomicWriteJson(ledgerPath, ledger);
      continue;
    }

    const choice = observation.payload.choices?.[0] ?? {};
    const message = choice.message ?? {};
    const finishReason =
      typeof choice.finish_reason === "string"
        ? choice.finish_reason
        : null;
    const returnedModelMatches =
      observation.payload.model === plannedCase.model;
    const evaluation = evaluateTask(
      task,
      responseForEvaluator(task, {
        message,
        finishReason,
        returnedModelMatches,
      }),
    );
    const usage = summarizeUsage(observation.payload.usage);
    rows.push({
      sequence: plannedCase.sequence,
      task_id: plannedCase.task_id,
      variant: plannedCase.variant,
      model: plannedCase.model,
      critical: task.critical,
      http_status: observation.status,
      transport_passed: true,
      returned_model_matches: returnedModelMatches,
      backend_fingerprint_returned:
        typeof observation.payload.system_fingerprint === "string" &&
        observation.payload.system_fingerprint.length > 0,
      finish_reason: finishReason,
      latency_ms: observation.latencyMs,
      provider_payload_retained: false,
      provider_identifiers_retained: false,
      raw_error_retained: false,
      ...evaluation,
      usage,
    });
    await atomicWriteJson(ledgerPath, ledger);
  }

  const regressionRows = rows.map((row) => ({
    task_id: row.task_id,
    variant: row.variant,
    passed: row.passed,
    score: row.score,
    critical: row.critical,
  }));
  const pairedRegression = scorePairedRegression(regressionRows);
  const allUsageAvailable = rows.every(
    (row) =>
      row.transport_passed &&
      row.usage.prompt_tokens + row.usage.completion_tokens ===
        row.usage.total_tokens,
  );
  const cost = allUsageAvailable
    ? aggregateUsageCost(rows, pricing)
    : {
        snapshot_id: pricing.snapshot_id,
        status: "incomplete_due_to_transport_failure",
        estimate_not_bill: true,
      };
  const baseline = variantSummary(rows, "baseline");
  const candidate = variantSummary(rows, "candidate");
  const releaseDecision =
    candidate.fail_count === 0 &&
    pairedRegression.critical_regression_count === 0
      ? "candidate_passes_example_gate"
      : "human_review_required";

  const summary = {
    schema_version: 1,
    artifact_id: "deepseek-v4-evaluation-live-summary-v1",
    status: "complete",
    study_type: "bounded_application_acceptance_test",
    not_a_general_model_benchmark: true,
    not_a_reliability_measurement: true,
    not_an_sla: true,
    completed_at_utc: new Date().toISOString(),
    dataset_id: dataset.dataset_id,
    dataset_sha256: datasetDigest,
    plan_sha256: planDigest,
    exact_models_tested: [plan.baseline_model, plan.candidate_model],
    method: {
      pair_count: dataset.tasks.length,
      planned_provider_requests: plan.planned_provider_requests,
      observed_provider_requests: ledger.provider_requests_completed,
      concurrency: plan.concurrency,
      automatic_retries: plan.automatic_retries,
      timeout_ms: plan.timeout_ms,
      synthetic_fixture_inputs_public: true,
      raw_provider_payloads_public: false,
    },
    variants: {
      baseline,
      candidate,
    },
    paired_regression: pairedRegression,
    observations: rows,
    usage_and_estimated_cost: cost,
    offline_human_review_calibration: humanCalibration,
    release_gate: {
      policy_class: "illustrative_local_policy",
      decision: releaseDecision,
      candidate_failed_case_count: candidate.fail_count,
      critical_regression_count:
        pairedRegression.critical_regression_count,
      human_override_required_for_high_risk_deployment: true,
    },
    retention: {
      synthetic_fixture_inputs_public: true,
      raw_provider_requests_public: false,
      raw_provider_outputs_public: false,
      provider_reasoning_public: false,
      provider_identifiers_public: false,
      credentials_public: false,
      headers_public: false,
      account_data_public: false,
      raw_errors_public: false,
      local_paths_public: false,
    },
  };

  const privateAudit = auditPublicArtifact(summary);
  const publicAudit = publicPrivacySummary([privateAudit]);
  if (!publicAudit.passed) {
    throw new Error("The sanitized live summary failed the privacy audit.");
  }

  ledger.status = "complete";
  ledger.release_decision = releaseDecision;
  await atomicWriteJson(summaryPath, summary);
  await atomicWriteJson(privacyPath, publicAudit);
  await atomicWriteJson(ledgerPath, ledger);
  return summary;
}
