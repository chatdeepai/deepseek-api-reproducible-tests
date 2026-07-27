import assert from "node:assert/strict";
import test from "node:test";

import { buildOfflineSummary } from "../source/offline-runner.mjs";
import { auditEvidence } from "../source/privacy.mjs";

test("privacy audit accepts the deterministic offline summary", async () => {
  const summary = await buildOfflineSummary();
  const audit = auditEvidence(summary);
  assert.equal(audit.status, "pass");
  assert.ok(Object.values(audit.checks).every(Boolean));
});

test("privacy audit rejects forbidden fields, credentials, identifiers, paths, and non-ASCII text", () => {
  const credential = ["sk", "offline", "B".repeat(16)].join("-");
  const cases = [
    { safe: true, content: "forbidden" },
    { safe: credential },
    { safe: "corr_private_published_value" },
    { safe: "C:\\private\\workspace\\result.json" },
    { safe: "non-ascii-\u00e9" },
  ];
  for (const item of cases) {
    assert.equal(auditEvidence(item).status, "fail");
  }
});

test("dashboard aggregates lifecycle, retry, stream, tool, token, and cost fields", async () => {
  const summary = await buildOfflineSummary();
  const dashboard = summary.dashboard;
  assert.equal(dashboard.request_total, 6);
  assert.equal(dashboard.success_total, 4);
  assert.equal(dashboard.incomplete_total, 1);
  assert.equal(dashboard.failure_total, 1);
  assert.equal(dashboard.retry_total, 1);
  assert.equal(dashboard.stream_total, 1);
  assert.equal(dashboard.tool_trace_total, 1);
  assert.equal(dashboard.complete_tool_trace_total, 1);
  assert.ok(dashboard.total_tokens > 0);
  assert.match(dashboard.estimated_cost_usd, /^\d+\.\d{12}$/);
});

test("SLO evaluation emits normalized alerts and honors minimum sample size", async () => {
  const summary = await buildOfflineSummary();
  assert.equal(summary.slo_evaluation.status, "critical");
  assert.ok(
    summary.slo_evaluation.alerts.some(
      (item) => item.metric === "availability_error_budget_burn",
    ),
  );

  const small = structuredClone(summary.dashboard);
  small.request_total = 2;
  const policy = {
    minimum_request_sample: 5,
    availability_target: 0.99,
    maximum_incomplete_rate: 0.01,
    maximum_p95_duration_ms: 2000,
    maximum_p95_time_to_first_content_ms: 800,
    warning_error_budget_burn: 2,
    critical_error_budget_burn: 5,
  };
  const { evaluateSlo } = await import("../source/dashboard.mjs");
  assert.equal(evaluateSlo(small, policy).status, "insufficient_data");
});
