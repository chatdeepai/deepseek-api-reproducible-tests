import {
  pairedSignTestPValue,
  summarizeRate,
} from "./statistics.mjs";

function round(value) {
  return Number(value.toFixed(6));
}

export function scorePairedRegression(results) {
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("Paired regression results are required.");
  }
  const groups = new Map();
  for (const item of results) {
    if (
      typeof item.task_id !== "string" ||
      !["baseline", "candidate"].includes(item.variant) ||
      typeof item.passed !== "boolean" ||
      typeof item.score !== "number" ||
      item.score < 0 ||
      item.score > 1
    ) {
      throw new Error("A paired regression row is invalid.");
    }
    const group = groups.get(item.task_id) ?? {};
    if (group[item.variant]) {
      throw new Error("A task variant cannot appear twice.");
    }
    group[item.variant] = item;
    groups.set(item.task_id, group);
  }

  const pairs = [...groups.entries()].map(([taskId, pair]) => {
    if (!pair.baseline || !pair.candidate) {
      throw new Error(`Task ${taskId} is missing a paired variant.`);
    }
    const delta = pair.candidate.score - pair.baseline.score;
    return {
      task_id: taskId,
      baseline_passed: pair.baseline.passed,
      candidate_passed: pair.candidate.passed,
      baseline_score: pair.baseline.score,
      candidate_score: pair.candidate.score,
      score_delta: round(delta),
      outcome: delta > 0 ? "win" : delta < 0 ? "loss" : "tie",
      critical: Boolean(pair.baseline.critical || pair.candidate.critical),
    };
  });
  pairs.sort((left, right) => left.task_id.localeCompare(right.task_id));

  const wins = pairs.filter((item) => item.outcome === "win").length;
  const losses = pairs.filter((item) => item.outcome === "loss").length;
  const ties = pairs.filter((item) => item.outcome === "tie").length;
  const baselinePasses = pairs.filter((item) => item.baseline_passed).length;
  const candidatePasses = pairs.filter((item) => item.candidate_passed).length;
  const criticalRegressions = pairs
    .filter((item) => item.outcome === "loss" && item.critical)
    .map((item) => item.task_id);
  const meanDelta =
    pairs.reduce((total, item) => total + item.score_delta, 0) / pairs.length;
  const pValue = pairedSignTestPValue(wins, losses);

  return {
    schema_version: 1,
    pair_count: pairs.length,
    wins,
    losses,
    ties,
    discordant_pair_count: wins + losses,
    net_wins: wins - losses,
    baseline_pass_rate: round(baselinePasses / pairs.length),
    candidate_pass_rate: round(candidatePasses / pairs.length),
    pass_rate_delta: round(
      candidatePasses / pairs.length - baselinePasses / pairs.length,
    ),
    mean_score_delta: round(meanDelta),
    baseline_rate_interval: summarizeRate(baselinePasses, pairs.length),
    candidate_rate_interval: summarizeRate(candidatePasses, pairs.length),
    paired_sign_test_p_value: pValue,
    small_sample: pairs.length < 30,
    critical_regression_count: criticalRegressions.length,
    critical_regression_task_ids: criticalRegressions,
    classification:
      criticalRegressions.length > 0
        ? "mixed_small_sample_with_critical_regression"
        : pValue <= 0.05 && wins > losses
          ? "candidate_improvement_signal"
          : "mixed_or_insufficient_evidence",
    pairs,
  };
}
