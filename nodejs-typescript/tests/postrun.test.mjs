import assert from "node:assert/strict";
import test from "node:test";

import { loadPlan } from "../dist/src/plan.js";
import { auditSummary } from "../dist/src/postrun.js";

function syntheticSummary(plan, planSha256) {
  const results = plan.cases.map((item) => ({
    case_id: item.id,
    runtime: "nodejs-typescript",
    scenario: item.scenario,
    requested_model: item.model,
    request_issued: true,
    status: item.scenario === "invalid_model" ? 400 : 200,
    elapsed_ms: 1,
    outcome: item.scenario === "invalid_model" ? "expected_provider_error" : "success",
  }));
  return {
    schema_version: 1,
    status: "completed",
    planned_case_count: plan.cases.length,
    provider_origin: plan.provider_origin,
    openai_version: plan.versions.openai,
    typescript_version: plan.versions.typescript,
    plan_sha256: planSha256,
    provider_requests_issued: results.length,
    provider_request_cap: plan.provider_request_cap,
    concurrency: 1,
    automatic_retries: 0,
    results,
  };
}

test("postrun audit passes only for matching plan, summary, and completed ledger", async () => {
  const { plan, sha256 } = await loadPlan();
  const summary = syntheticSummary(plan, sha256);
  const ledger = {
    schema_version: 1,
    status: "completed",
    plan_sha256: sha256,
    cap: 9,
    issued: 9,
    case_ids: plan.cases.map((item) => item.id),
  };
  const audit = auditSummary(summary, plan, ledger, "2026-07-27T00:00:00.000Z");
  assert.equal(audit.status, "pass");
  assert.ok(Object.values(audit.checks).every(Boolean));
});

test("postrun audit fails closed on order or ledger accounting drift", async () => {
  const { plan, sha256 } = await loadPlan();
  const summary = syntheticSummary(plan, sha256);
  [summary.results[0], summary.results[1]] = [
    summary.results[1],
    summary.results[0],
  ];
  const ledger = {
    schema_version: 1,
    status: "completed",
    plan_sha256: sha256,
    cap: 9,
    issued: 8,
    case_ids: plan.cases.slice(0, 8).map((item) => item.id),
  };
  const audit = auditSummary(summary, plan, ledger, "2026-07-27T00:00:00.000Z");
  assert.equal(audit.status, "fail");
  assert.equal(audit.checks.case_order_matches_plan, false);
  assert.equal(audit.checks.ledger_count_matches, false);
});

test("postrun audit refuses forbidden raw result fields", async () => {
  const { plan, sha256 } = await loadPlan();
  const summary = syntheticSummary(plan, sha256);
  summary.results[0].content = "not publishable";
  const ledger = {
    schema_version: 1,
    status: "completed",
    plan_sha256: sha256,
    cap: 9,
    issued: 9,
    case_ids: plan.cases.map((item) => item.id),
  };
  assert.throws(() => auditSummary(summary, plan, ledger), /Forbidden evidence field/);
});
