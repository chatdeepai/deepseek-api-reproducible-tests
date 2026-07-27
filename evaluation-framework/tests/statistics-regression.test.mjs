import assert from "node:assert/strict";
import test from "node:test";
import { buildOfflineArtifacts } from "../source/offline-runner.mjs";
import { scorePairedRegression } from "../source/regression.mjs";
import {
  pairedSignTestPValue,
  summarizeRate,
  wilsonInterval,
} from "../source/statistics.mjs";
import { loadFixtures } from "./helpers.mjs";

const fixtures = await loadFixtures();
const artifacts = buildOfflineArtifacts(fixtures);

test("Wilson interval handles zero samples honestly", () => {
  assert.deepEqual(wilsonInterval(0, 0), {
    estimate: null,
    low: null,
    high: null,
    sample_size: 0,
  });
});

test("Wilson interval stays bounded for all successes", () => {
  const interval = wilsonInterval(6, 6);
  assert.equal(interval.estimate, 1);
  assert.equal(interval.high, 1);
  assert.ok(interval.low > 0 && interval.low < 1);
});

test("Wilson interval rejects impossible counts", () => {
  assert.throws(() => wilsonInterval(4, 3), /invalid/);
});

test("small sample summary uses a wide-interval label", () => {
  const summary = summarizeRate(5, 6);
  assert.equal(summary.interpretation, "small_sample_wide_interval");
  assert.equal(summary.sample_size, 6);
});

test("paired sign test ignores ties by accepting discordant counts only", () => {
  assert.equal(pairedSignTestPValue(2, 1), 1);
  assert.equal(pairedSignTestPValue(0, 0), 1);
});

test("paired sign test rejects negative counts", () => {
  assert.throws(() => pairedSignTestPValue(-1, 2), /invalid/);
});

test("paired regression reconciles wins losses and ties", () => {
  const regression = artifacts.offlineSummary.paired_regression;
  assert.deepEqual(
    {
      pairs: regression.pair_count,
      wins: regression.wins,
      losses: regression.losses,
      ties: regression.ties,
    },
    { pairs: 6, wins: 2, losses: 1, ties: 3 },
  );
});

test("paired regression surfaces the critical tool regression", () => {
  const regression = artifacts.offlineSummary.paired_regression;
  assert.equal(regression.critical_regression_count, 1);
  assert.deepEqual(regression.critical_regression_task_ids, [
    "tool-selection",
  ]);
  assert.equal(
    regression.classification,
    "mixed_small_sample_with_critical_regression",
  );
});

test("paired regression reports the expected descriptive deltas", () => {
  const regression = artifacts.offlineSummary.paired_regression;
  assert.equal(regression.pass_rate_delta, 0.166667);
  assert.equal(regression.mean_score_delta, 0.166667);
  assert.equal(regression.small_sample, true);
});

test("paired regression rejects a missing pair", () => {
  assert.throws(
    () =>
      scorePairedRegression([
        {
          task_id: "only",
          variant: "baseline",
          passed: true,
          score: 1,
        },
      ]),
    /missing/,
  );
});

test("paired regression rejects duplicate variants", () => {
  const row = {
    task_id: "duplicate",
    variant: "baseline",
    passed: true,
    score: 1,
  };
  assert.throws(() => scorePairedRegression([row, row]), /twice/);
});
