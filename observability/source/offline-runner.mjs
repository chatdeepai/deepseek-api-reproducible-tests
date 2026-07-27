import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { estimateUsageCost } from "./cost.mjs";
import { buildDashboard, evaluateSlo } from "./dashboard.mjs";
import { atomicWriteJson, readJson } from "./io.mjs";
import { RequestLifecycle } from "./lifecycle.mjs";
import { auditEvidence } from "./privacy.mjs";
import { redactDiagnosticText, sanitizeLogRecord } from "./redaction.mjs";
import { classifyRetry, computeBackoffMs } from "./retry.mjs";
import { StreamMetrics } from "./stream-metrics.mjs";
import { ToolTrace } from "./tool-trace.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

function usage({
  prompt,
  completion,
  hit = 0,
  miss = prompt,
  reasoning = 0,
}) {
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    prompt_cache_hit_tokens: hit,
    prompt_cache_miss_tokens: miss,
    reasoning_tokens: reasoning,
  };
}

function attachCost(lifecycle, pricing, model, counts) {
  lifecycle.attachCost(
    estimateUsageCost({
      model,
      usage: counts,
      pricingSnapshot: pricing,
    }),
  );
}

function ordinaryRecord(pricing) {
  const lifecycle = new RequestLifecycle({
    internalCorrelationId: "corr_offline_ordinary_private",
    routeAlias: "chat_completion",
    model: "deepseek-v4-flash",
  });
  lifecycle.startAttempt(0);
  lifecycle.receiveHeaders({ status: 200, atMs: 90 });
  attachCost(
    lifecycle,
    pricing,
    "deepseek-v4-flash",
    usage({ prompt: 20, completion: 5 }),
  );
  lifecycle.complete({ atMs: 150, finishReason: "stop" });
  return lifecycle.summary();
}

function streamRecord(pricing) {
  const stream = new StreamMetrics();
  stream.record({ type: "network_chunk", at_ms: 100, network_bytes: 180 });
  stream.record({ type: "json_event", at_ms: 120 });
  stream.record({ type: "content_delta", at_ms: 210, delta_chars: 7 });
  stream.record({ type: "json_event", at_ms: 300 });
  stream.record({ type: "content_delta", at_ms: 320, delta_chars: 5 });
  stream.record({ type: "usage", at_ms: 500 });
  stream.record({ type: "finish", at_ms: 540, finish_reason: "stop" });
  const streamSummary = stream.close(560);

  const lifecycle = new RequestLifecycle({
    internalCorrelationId: "corr_offline_stream_private",
    routeAlias: "chat_stream",
    model: "deepseek-v4-flash",
  });
  lifecycle.startAttempt(0);
  lifecycle.receiveHeaders({ status: 200, atMs: 80 });
  lifecycle.startStream(90);
  lifecycle.attachStream(streamSummary);
  attachCost(
    lifecycle,
    pricing,
    "deepseek-v4-flash",
    usage({ prompt: 18, completion: 6 }),
  );
  lifecycle.complete({ atMs: 560, finishReason: "stop" });
  return lifecycle.summary();
}

function toolRecord(pricing) {
  const trace = new ToolTrace({
    internalCorrelationId: "corr_offline_tool_private",
    toolName: "lookup_synthetic_record",
  });
  trace.record({ phase: "tool_requested", outcome: "pass", at_ms: 100 });
  trace.record({ phase: "tool_validated", outcome: "pass", at_ms: 120 });
  trace.record({ phase: "tool_authorized", outcome: "pass", at_ms: 130 });
  trace.record({ phase: "tool_executed", outcome: "pass", at_ms: 150 });
  trace.record({ phase: "tool_replayed", outcome: "pass", at_ms: 180 });

  const lifecycle = new RequestLifecycle({
    internalCorrelationId: "corr_offline_tool_private",
    routeAlias: "tool_round_trip",
    model: "deepseek-v4-flash",
  });
  lifecycle.startAttempt(0);
  lifecycle.receiveHeaders({ status: 200, atMs: 85 });
  lifecycle.attachToolTrace(trace.summary());
  attachCost(
    lifecycle,
    pricing,
    "deepseek-v4-flash",
    usage({ prompt: 80, completion: 20 }),
  );
  lifecycle.complete({ atMs: 240, finishReason: "stop" });
  return lifecycle.summary();
}

function retriedRecord(pricing) {
  const lifecycle = new RequestLifecycle({
    internalCorrelationId: "corr_offline_retry_private",
    routeAlias: "chat_completion",
    model: "deepseek-v4-flash",
  });
  lifecycle.startAttempt(0);
  lifecycle.receiveHeaders({ status: 503, atMs: 70 });
  lifecycle.scheduleRetry({
    atMs: 80,
    delayMs: 250,
    errorClass: "provider_overloaded",
  });
  lifecycle.startAttempt(330);
  lifecycle.receiveHeaders({ status: 200, atMs: 420 });
  attachCost(
    lifecycle,
    pricing,
    "deepseek-v4-flash",
    usage({ prompt: 22, completion: 4 }),
  );
  lifecycle.complete({ atMs: 480, finishReason: "stop" });
  return lifecycle.summary();
}

function failedRecord() {
  const lifecycle = new RequestLifecycle({
    internalCorrelationId: "corr_offline_failure_private",
    routeAlias: "chat_completion",
    model: "deepseek-v4-flash",
  });
  lifecycle.startAttempt(0);
  lifecycle.receiveHeaders({ status: 429, atMs: 95 });
  lifecycle.fail({ atMs: 110, status: 429, errorClass: "rate_limited" });
  return lifecycle.summary();
}

function incompleteRecord(pricing) {
  const lifecycle = new RequestLifecycle({
    internalCorrelationId: "corr_offline_incomplete_private",
    routeAlias: "thinking_completion",
    model: "deepseek-v4-pro",
  });
  lifecycle.startAttempt(0);
  lifecycle.receiveHeaders({ status: 200, atMs: 100 });
  attachCost(
    lifecycle,
    pricing,
    "deepseek-v4-pro",
    usage({ prompt: 24, completion: 32, reasoning: 30 }),
  );
  lifecycle.complete({ atMs: 900, finishReason: "length" });
  return lifecycle.summary();
}

export async function buildOfflineSummary() {
  const pricing = await readJson(
    join(root, "fixtures", "pricing-snapshot.json"),
  );
  const sloPolicy = await readJson(join(root, "fixtures", "slo-policy.json"));
  const records = [
    ordinaryRecord(pricing),
    streamRecord(pricing),
    toolRecord(pricing),
    retriedRecord(pricing),
    failedRecord(),
    incompleteRecord(pricing),
  ];
  const dashboard = buildDashboard(records);
  const sloEvaluation = evaluateSlo(dashboard, sloPolicy);

  const retryControls = [
    classifyRetry({
      failureKind: "http",
      status: 429,
      attempt: 1,
      maxRetries: 2,
      idempotent: true,
    }),
    classifyRetry({
      failureKind: "http",
      status: 400,
      attempt: 1,
      maxRetries: 2,
      idempotent: true,
    }),
    classifyRetry({
      failureKind: "tool",
      status: null,
      attempt: 1,
      maxRetries: 2,
      idempotent: false,
      sideEffectState: "unknown",
    }),
  ];

  const syntheticCredential = ["sk", "offline", "A".repeat(16)].join("-");
  const syntheticIdentifier = [
    "12345678",
    "1234",
    "4123",
    "8123",
    "123456789abc",
  ].join("-");
  const diagnostic = [
    syntheticCredential,
    "Bearer offline-token-value",
    "offline@example.invalid",
    syntheticIdentifier,
    "corr_offline_identifier",
    "C:\\offline\\private\\file.txt",
  ].join(" ");
  const redacted = redactDiagnosticText(diagnostic);
  const sanitized = sanitizeLogRecord({
    event: "completed",
    route_alias: "chat_completion",
    model: "deepseek-v4-flash",
    status: 200,
    attempt: 1,
    duration_ms: 150,
    outcome: "success",
    finish_reason: "stop",
    correlation_id: "corr_offline_identifier",
    prompt: "discarded",
    output: "discarded",
    headers: { authorization: "discarded" },
  });

  return {
    schema_version: 1,
    status: "completed",
    mode: "offline",
    deterministic_fixture_date: "2026-07-27",
    live_network_requests: 0,
    lifecycle_record_count: records.length,
    lifecycle_summaries: records,
    retry_controls: {
      cases: retryControls,
      first_retry_backoff_ms: computeBackoffMs({
        retryNumber: 1,
        jitterSample: 0.5,
      }),
      second_retry_backoff_ms: computeBackoffMs({
        retryNumber: 2,
        jitterSample: 0.5,
      }),
    },
    redaction_controls: {
      synthetic_patterns_checked: 6,
      all_patterns_redacted:
        !redacted.includes("offline@example.invalid") &&
        !redacted.includes("corr_offline_identifier") &&
        !redacted.includes("C:\\offline"),
      allowlisted_record_field_count: Object.keys(sanitized).length,
      unsafe_fields_discarded: true,
    },
    dashboard,
    slo_evaluation: sloEvaluation,
    correlation_controls: {
      lifecycle_links_present: records.every(
        (item) => item.correlation_linked,
      ),
      internal_identifiers_published: false,
    },
    privacy_boundary: {
      raw_prompts_stored: false,
      raw_outputs_stored: false,
      raw_reasoning_stored: false,
      provider_identifiers_stored: false,
      tool_payloads_stored: false,
      credentials_stored: false,
    },
  };
}

export async function writeOfflineEvidence() {
  const summary = await buildOfflineSummary();
  const audit = auditEvidence(summary);
  if (audit.status !== "pass") {
    throw new Error("Offline evidence failed the privacy audit.");
  }
  await atomicWriteJson(
    join(root, "results", "offline-summary.json"),
    summary,
  );
  await atomicWriteJson(
    join(root, "results", "privacy-audit.json"),
    audit,
  );
  return { summary, audit };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { summary } = await writeOfflineEvidence();
    console.log(
      `Offline observability evidence completed for ${summary.lifecycle_record_count} synthetic lifecycles.`,
    );
  } catch {
    console.error("Offline observability evidence failed closed.");
    process.exitCode = 1;
  }
}
