import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateUsageCost,
  estimateCaseCost,
} from "../source/cost.mjs";
import {
  calibrateHumanReview,
  cohenKappa,
  resolveJudgeDisagreement,
} from "../source/judge.mjs";
import { clone, loadFixtures } from "./helpers.mjs";

const fixtures = await loadFixtures();

test("Cohen kappa is one for perfect non-degenerate agreement", () => {
  const result = cohenKappa(
    ["pass", "fail", "uncertain"],
    ["pass", "fail", "uncertain"],
  );
  assert.equal(result.kappa, 1);
});

test("judge agreement is accepted", () => {
  assert.deepEqual(
    resolveJudgeDisagreement({ judgeA: "pass", judgeB: "pass" }),
    {
      decision: "accept",
      reason: "judge_agreement",
      resolved_label: "pass",
    },
  );
});

test("shared uncertainty routes to human review", () => {
  assert.equal(
    resolveJudgeDisagreement({
      judgeA: "uncertain",
      judgeB: "uncertain",
    }).reason,
    "shared_uncertainty",
  );
});

test("opposing judges route to human review", () => {
  assert.equal(
    resolveJudgeDisagreement({ judgeA: "pass", judgeB: "fail" }).reason,
    "opposing_judges",
  );
});

test("deterministic disagreement overrides judge agreement", () => {
  const result = resolveJudgeDisagreement({
    judgeA: "pass",
    judgeB: "pass",
    deterministicPass: false,
  });
  assert.equal(result.decision, "human_review");
  assert.equal(result.reason, "deterministic_metric_conflict");
});

test("human calibration publishes aggregates only", () => {
  const summary = calibrateHumanReview(fixtures.calibration);
  assert.equal(summary.sample_size, 12);
  assert.equal(summary.cohen_kappa, 0.25);
  assert.equal(summary.disagreement_count, 6);
  assert.equal(summary.reviewer_identity_stored, false);
  assert.equal(summary.review_text_stored, false);
});

test("case cost uses the dated price snapshot", () => {
  const row = fixtures.responses.responses.find(
    (item) =>
      item.task_id === "exact-token" && item.variant === "candidate",
  );
  const estimate = estimateCaseCost(row.model, row.usage, fixtures.pricing);
  assert.equal(estimate.status, "estimated");
  assert.equal(estimate.estimated_cost_usd, "0.000010440000");
  assert.equal(estimate.snapshot_id, "deepseek-pricing-2026-07-27");
});

test("reasoning tokens are not added to completion twice", () => {
  const row = fixtures.responses.responses.find(
    (item) =>
      item.task_id === "thinking-math" && item.variant === "candidate",
  );
  const estimate = estimateCaseCost(row.model, row.usage, fixtures.pricing);
  assert.equal(estimate.completion_tokens, 26);
  assert.equal(estimate.reasoning_tokens, 18);
  assert.equal(estimate.reasoning_tokens_already_in_completion, true);
});

test("invalid usage returns an explicit non-estimate", () => {
  const row = clone(fixtures.responses.responses[0]);
  row.usage.total_tokens += 1;
  const estimate = estimateCaseCost(
    row.model,
    row.usage,
    fixtures.pricing,
  );
  assert.equal(estimate.status, "invalid_usage");
  assert.equal(estimate.estimated_cost_usd, null);
});

test("unknown model is not silently priced", () => {
  const estimate = estimateCaseCost(
    "unknown-model",
    fixtures.responses.responses[0].usage,
    fixtures.pricing,
  );
  assert.equal(estimate.status, "unsupported_model");
});

test("aggregate cost reconciles variants and totals", () => {
  const aggregate = aggregateUsageCost(
    fixtures.responses.responses,
    fixtures.pricing,
  );
  assert.equal(aggregate.overall.case_count, 12);
  assert.equal(aggregate.variants.baseline.case_count, 6);
  assert.equal(aggregate.variants.candidate.case_count, 6);
  assert.equal(
    aggregate.overall.total_tokens,
    aggregate.variants.baseline.total_tokens +
      aggregate.variants.candidate.total_tokens,
  );
  assert.equal(aggregate.estimate_not_bill, true);
});
