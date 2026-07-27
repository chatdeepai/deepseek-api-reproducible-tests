const LABELS = new Set(["pass", "fail", "uncertain"]);

function requireLabel(value) {
  if (!LABELS.has(value)) throw new Error("A judge label is invalid.");
  return value;
}

function round(value) {
  return Number(value.toFixed(6));
}

export function cohenKappa(labelsA, labelsB) {
  if (
    !Array.isArray(labelsA) ||
    !Array.isArray(labelsB) ||
    labelsA.length !== labelsB.length ||
    labelsA.length === 0
  ) {
    throw new Error("Kappa requires equal nonempty label arrays.");
  }
  labelsA.forEach(requireLabel);
  labelsB.forEach(requireLabel);

  const sampleSize = labelsA.length;
  const observed =
    labelsA.filter((label, index) => label === labelsB[index]).length /
    sampleSize;
  let expected = 0;
  for (const label of LABELS) {
    const rateA = labelsA.filter((item) => item === label).length / sampleSize;
    const rateB = labelsB.filter((item) => item === label).length / sampleSize;
    expected += rateA * rateB;
  }
  const kappa =
    Math.abs(1 - expected) < Number.EPSILON
      ? observed === 1
        ? 1
        : 0
      : (observed - expected) / (1 - expected);
  return {
    sample_size: sampleSize,
    observed_agreement: round(observed),
    expected_agreement: round(expected),
    kappa: round(kappa),
  };
}

export function resolveJudgeDisagreement({
  judgeA,
  judgeB,
  deterministicPass = null,
}) {
  requireLabel(judgeA);
  requireLabel(judgeB);
  if (deterministicPass !== null && typeof deterministicPass !== "boolean") {
    throw new Error("deterministicPass must be boolean or null.");
  }

  if (judgeA === judgeB && judgeA === "uncertain") {
    return {
      decision: "human_review",
      reason: "shared_uncertainty",
      resolved_label: null,
    };
  }
  if (judgeA === judgeB) {
    const resolved = judgeA;
    if (
      deterministicPass !== null &&
      deterministicPass !== (resolved === "pass")
    ) {
      return {
        decision: "human_review",
        reason: "deterministic_metric_conflict",
        resolved_label: null,
      };
    }
    return {
      decision: "accept",
      reason: "judge_agreement",
      resolved_label: resolved,
    };
  }
  if (
    new Set([judgeA, judgeB]).size === 2 &&
    [judgeA, judgeB].includes("uncertain")
  ) {
    return {
      decision: "human_review",
      reason: "one_judge_uncertain",
      resolved_label: null,
    };
  }
  return {
    decision: "human_review",
    reason: "opposing_judges",
    resolved_label: null,
  };
}

export function calibrateHumanReview(fixture) {
  if (!Array.isArray(fixture?.items) || fixture.items.length === 0) {
    throw new Error("Calibration items are required.");
  }
  const ids = fixture.items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Calibration item IDs must be unique.");
  }
  const labelsA = fixture.items.map((item) => requireLabel(item.reviewer_a));
  const labelsB = fixture.items.map((item) => requireLabel(item.reviewer_b));
  const experts = fixture.items.map((item) => requireLabel(item.expert));
  const kappa = cohenKappa(labelsA, labelsB);
  const reviewerAExpert =
    labelsA.filter((label, index) => label === experts[index]).length /
    labelsA.length;
  const reviewerBExpert =
    labelsB.filter((label, index) => label === experts[index]).length /
    labelsB.length;
  const routing = fixture.items.map((item) =>
    resolveJudgeDisagreement({
      judgeA: item.reviewer_a,
      judgeB: item.reviewer_b,
    }),
  );

  return {
    schema_version: 1,
    calibration_id: fixture.calibration_id,
    sample_size: fixture.items.length,
    observed_agreement: kappa.observed_agreement,
    expected_agreement: kappa.expected_agreement,
    cohen_kappa: kappa.kappa,
    reviewer_a_expert_agreement: round(reviewerAExpert),
    reviewer_b_expert_agreement: round(reviewerBExpert),
    disagreement_count: labelsA.filter(
      (label, index) => label !== labelsB[index],
    ).length,
    opposing_pass_fail_count: fixture.items.filter(
      (item) =>
        new Set([item.reviewer_a, item.reviewer_b]).size === 2 &&
        [item.reviewer_a, item.reviewer_b].includes("pass") &&
        [item.reviewer_a, item.reviewer_b].includes("fail"),
    ).length,
    human_review_queue_count: routing.filter(
      (item) => item.decision === "human_review",
    ).length,
    small_sample: fixture.items.length < 30,
    reviewer_identity_stored: false,
    review_text_stored: false,
  };
}
