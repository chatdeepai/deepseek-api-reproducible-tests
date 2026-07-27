import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runLockedLive } from "../source/live-guard.mjs";
import {
  EXPECTED_LIVE_CASE_COUNT,
  loadFrozenPlan,
  validateFrozenPlan,
} from "../source/plan.mjs";
import { auditLiveSummary } from "../source/postrun.mjs";

const liveSummary = JSON.parse(
  await readFile(
    new URL("../results/live-summary.json", import.meta.url),
    "utf8",
  ),
);

test("the root-provided frozen plan validates and hashes consistently", async () => {
  const first = await loadFrozenPlan();
  const second = await loadFrozenPlan();
  assert.equal(first.plan.cases.length, EXPECTED_LIVE_CASE_COUNT);
  assert.match(first.sha256, /^[a-f0-9]{64}$/);
  assert.equal(first.sha256, second.sha256);
  assert.equal(first.plan.constraints.concurrency, 1);
  assert.equal(first.plan.constraints.provider_retries, 0);
});

test("frozen plan mutation is rejected", async () => {
  const { plan } = await loadFrozenPlan();
  const mutated = structuredClone(plan);
  mutated.cases[0].max_tokens = 999;
  assert.throws(() => validateFrozenPlan(mutated), /case 1 changed/);
});

test("completed live execution is locked against rerun", async () => {
  let networkCalls = 0;
  await assert.rejects(
    runLockedLive({
      fetchImpl: async () => {
        networkCalls += 1;
      },
    }),
    /complete/,
  );
  assert.equal(networkCalls, 0);
});

test("postrun audit validates the preserved eight-case live summary", async () => {
  const { plan, sha256 } = await loadFrozenPlan();
  const audit = auditLiveSummary({
    plan,
    planSha256: sha256,
    summary: liveSummary,
    auditedAt: "2026-07-27T20:00:00.000Z",
  });
  assert.equal(audit.status, "pass");
  assert.equal(audit.observed_case_count, 8);
  assert.equal(audit.observed_http_200, 7);
  assert.equal(audit.observed_expected_http_400, 1);
  assert.equal(audit.observed_total_tokens, 10_134);
  assert.equal(audit.observed_estimated_cost_usd, 0.000808071);
  assert.ok(Object.values(audit.checks).every(Boolean));
});

test("postrun audit catches live fact drift and forbidden payload fields", async () => {
  const { plan, sha256 } = await loadFrozenPlan();
  const mutated = structuredClone(liveSummary);
  mutated.totals.total_tokens = 1;
  mutated.cases[0].content = "not publishable";
  const audit = auditLiveSummary({
    plan,
    planSha256: sha256,
    summary: mutated,
    auditedAt: "2026-07-27T20:00:00.000Z",
  });
  assert.equal(audit.status, "fail");
  assert.equal(audit.checks.total_tokens_reconcile, false);
  assert.equal(audit.checks.privacy_audit_passed, false);
});
