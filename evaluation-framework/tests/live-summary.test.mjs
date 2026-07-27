import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import { aggregateUsageCost } from "../source/cost.mjs";
import { readJson } from "../source/io.mjs";
import { hashLivePlan } from "../source/plan.mjs";
import { auditPublicArtifact } from "../source/privacy.mjs";
import { ROOT_DIR, loadFixtures } from "./helpers.mjs";

const fixtures = await loadFixtures();
const resultsDir = join(ROOT_DIR, "results");
const [summary, privacyAudit, ledger] = await Promise.all([
  readJson(join(resultsDir, "live-summary.json")),
  readJson(join(resultsDir, "live-privacy-audit.json")),
  readJson(join(resultsDir, "live-run-ledger.json")),
]);

test("live summary matches the frozen twelve-request plan", () => {
  assert.equal(summary.status, "complete");
  assert.equal(summary.plan_sha256, hashLivePlan(fixtures.livePlan));
  assert.equal(summary.method.planned_provider_requests, 12);
  assert.equal(summary.method.observed_provider_requests, 12);
  assert.equal(summary.method.concurrency, 1);
  assert.equal(summary.method.automatic_retries, 0);
  assert.equal(summary.observations.length, 12);
  assert.deepEqual(
    summary.observations.map((item) => item.sequence),
    Array.from({ length: 12 }, (_, index) => index + 1),
  );
  for (const row of summary.observations) {
    assert.equal(row.returned_model_matches, true);
    assert.equal(
      row.finish_reason,
      row.task_id === "tool-selection" ? "tool_calls" : "stop",
    );
  }
});

test("every planned model-task pair returned a scored observation", () => {
  const observed = new Set(
    summary.observations.map(
      (item) => `${item.task_id}:${item.variant}:${item.model}`,
    ),
  );
  const planned = new Set(
    fixtures.livePlan.cases.map(
      (item) => `${item.task_id}:${item.variant}:${item.model}`,
    ),
  );
  assert.deepEqual(observed, planned);
  assert.equal(summary.variants.baseline.case_count, 6);
  assert.equal(summary.variants.candidate.case_count, 6);
});

test("live usage and cost reconcile from the dated price snapshot", () => {
  for (const row of summary.observations) {
    assert.equal(
      row.usage.prompt_cache_hit_tokens +
        row.usage.prompt_cache_miss_tokens,
      row.usage.prompt_tokens,
    );
    assert.equal(
      row.usage.prompt_tokens + row.usage.completion_tokens,
      row.usage.total_tokens,
    );
    assert.ok(row.usage.reasoning_tokens <= row.usage.completion_tokens);
  }
  const recomputed = aggregateUsageCost(
    summary.observations,
    fixtures.pricing,
  );
  assert.deepEqual(recomputed, summary.usage_and_estimated_cost);
});

test("paired result and illustrative release gate are internally consistent", () => {
  assert.equal(summary.paired_regression.pair_count, 6);
  assert.equal(
    summary.paired_regression.wins +
      summary.paired_regression.losses +
      summary.paired_regression.ties,
    6,
  );
  assert.equal(summary.paired_regression.small_sample, true);
  assert.equal(
    summary.release_gate.policy_class,
    "illustrative_local_policy",
  );
  assert.equal(
    summary.release_gate.original_frozen_decision,
    "candidate_passes_example_gate",
  );
  assert.equal(summary.release_gate.decision, "human_review_required");
  assert.equal(
    summary.post_run_audit.status,
    "completed_with_evidence_gap",
  );
  assert.deepEqual(summary.post_run_audit.evidence_gap_codes, [
    "tool_call_cardinality_not_retained",
  ]);
  assert.equal(summary.not_a_general_model_benchmark, true);
  assert.equal(summary.not_an_sla, true);
});

test("sanitized live evidence passes the recursive privacy audit", () => {
  const recomputed = auditPublicArtifact(summary);
  assert.equal(recomputed.passed, true);
  assert.equal(recomputed.issue_count, 0);
  assert.equal(privacyAudit.passed, true);
  assert.equal(privacyAudit.issue_count, 0);
  assert.equal(/[^\x00-\x7F]/u.test(JSON.stringify(summary)), false);
});

test("request ledger proves the cap was exhausted without retries", () => {
  assert.equal(ledger.status, "complete");
  assert.equal(ledger.provider_request_cap, 12);
  assert.equal(ledger.provider_requests_reserved, 12);
  assert.equal(ledger.provider_requests_attempted, 12);
  assert.equal(ledger.provider_requests_completed, 12);
  assert.equal(ledger.automatic_retries, 0);
});
