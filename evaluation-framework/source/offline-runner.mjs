import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { aggregateUsageCost } from "./cost.mjs";
import {
  validateGoldenDataset,
  validateOfflineResponses,
} from "./dataset.mjs";
import { evaluateTask } from "./evaluators.mjs";
import {
  calibrateHumanReview,
  resolveJudgeDisagreement,
} from "./judge.mjs";
import { atomicWriteJson, readJson } from "./io.mjs";
import { buildPlanHashArtifact, validateLivePlan } from "./plan.mjs";
import {
  assertPrivacySafe,
  publicPrivacySummary,
} from "./privacy.mjs";
import { scorePairedRegression } from "./regression.mjs";
import { summarizeRate } from "./statistics.mjs";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = dirname(MODULE_DIR);

function countBy(items, keySelector) {
  const counts = {};
  for (const item of items) {
    const key = keySelector(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function buildJudgeRoutingSummary() {
  const routes = [
    resolveJudgeDisagreement({ judgeA: "pass", judgeB: "pass" }),
    resolveJudgeDisagreement({ judgeA: "uncertain", judgeB: "uncertain" }),
    resolveJudgeDisagreement({ judgeA: "pass", judgeB: "fail" }),
    resolveJudgeDisagreement({
      judgeA: "pass",
      judgeB: "pass",
      deterministicPass: false,
    }),
  ];
  return {
    scenario_count: routes.length,
    decision_counts: countBy(routes, (item) => item.decision),
    reason_counts: countBy(routes, (item) => item.reason),
  };
}

function publicCaseResult(task, response, evaluation) {
  return {
    task_id: task.id,
    task_kind: task.kind,
    variant: response.variant,
    model_alias: response.model,
    critical: task.critical,
    passed: evaluation.passed,
    score: evaluation.score,
    evaluator_detail: evaluation,
    response_source: "frozen_synthetic_fixture",
    raw_provider_output_stored: false,
  };
}

export function buildOfflineArtifacts({
  dataset,
  responses,
  calibration,
  pricing,
  livePlan,
}) {
  const datasetValidation = validateGoldenDataset(dataset);
  const planValidation = validateLivePlan(livePlan);
  if (livePlan.dataset_id !== dataset.dataset_id) {
    throw new Error("Live plan and golden dataset IDs do not match.");
  }
  const responseValidation = validateOfflineResponses(
    responses,
    dataset,
    livePlan,
  );
  const taskMap = new Map(dataset.tasks.map((task) => [task.id, task]));
  const caseResults = responses.responses.map((response) => {
    const task = taskMap.get(response.task_id);
    const expectedModel =
      response.variant === "baseline"
        ? livePlan.baseline_model
        : livePlan.candidate_model;
    const evaluation = evaluateTask(task, {
      ...response,
      finish_reason: task.kind === "tool" ? "tool_calls" : "stop",
      returned_model_matches: response.model === expectedModel,
      tool_call_count:
        task.kind === "tool" && response.tool_call ? 1 : 0,
    });
    return publicCaseResult(task, response, evaluation);
  });

  const regressionRows = caseResults.map((item) => ({
    task_id: item.task_id,
    variant: item.variant,
    passed: item.passed,
    score: item.score,
    critical: item.critical,
  }));
  const regression = scorePairedRegression(regressionRows);
  const variantRates = Object.fromEntries(
    ["baseline", "candidate"].map((variant) => {
      const selected = caseResults.filter((item) => item.variant === variant);
      const passes = selected.filter((item) => item.passed).length;
      return [variant, summarizeRate(passes, selected.length)];
    }),
  );
  const humanCalibration = calibrateHumanReview(calibration);
  const cost = aggregateUsageCost(responses.responses, pricing);
  const planHash = buildPlanHashArtifact(livePlan);

  const offlineSummary = {
    schema_version: 1,
    artifact_id: "deepseek-evaluation-offline-summary-v1",
    run_mode: "offline_synthetic",
    evidence_date_utc: livePlan.frozen_at_utc,
    live_status: "not_run",
    live_network_requests: 0,
    dataset: datasetValidation,
    response_fixture: responseValidation,
    frozen_plan: {
      ...planValidation,
      hash_algorithm: planHash.algorithm,
      hash_digest_hex: planHash.digest_hex,
    },
    case_results: caseResults,
    variant_pass_rates: variantRates,
    paired_regression: regression,
    judge_disagreement_routing: buildJudgeRoutingSummary(),
    cost_estimate: cost,
    evidence_boundary: {
      synthetic_fixture_inputs_public: true,
      synthetic_response_fixture_is_provider_evidence: false,
      raw_provider_requests_stored: false,
      raw_provider_outputs_stored: false,
      provider_reasoning_stored: false,
      provider_identifiers_stored: false,
      credentials_stored: false,
      headers_stored: false,
      account_data_stored: false,
      raw_errors_stored: false,
      local_paths_stored: false,
    },
  };

  const summaryAudit = assertPrivacySafe(offlineSummary);
  const calibrationAudit = assertPrivacySafe(humanCalibration);
  const planHashAudit = assertPrivacySafe(planHash);
  const privacyAudit = publicPrivacySummary([
    summaryAudit,
    calibrationAudit,
    planHashAudit,
  ]);
  if (!privacyAudit.passed) {
    throw new Error("Generated artifacts are not safe to publish.");
  }

  return {
    offlineSummary,
    humanCalibration,
    privacyAudit,
    planHash,
  };
}

export async function runOfflineEvaluation(options = {}) {
  const rootDir = options.rootDir ?? DEFAULT_ROOT;
  const fixturesDir = join(rootDir, "fixtures");
  const resultsDir = options.resultsDir ?? join(rootDir, "results");
  const [dataset, responses, calibration, pricing, livePlan] =
    await Promise.all([
      readJson(join(fixturesDir, "golden-dataset.json")),
      readJson(join(fixturesDir, "offline-responses.json")),
      readJson(join(fixturesDir, "human-review-calibration.json")),
      readJson(join(fixturesDir, "pricing-snapshot.json")),
      readJson(join(fixturesDir, "live-plan.json")),
    ]);
  const artifacts = buildOfflineArtifacts({
    dataset,
    responses,
    calibration,
    pricing,
    livePlan,
  });
  await Promise.all([
    atomicWriteJson(
      join(resultsDir, "offline-summary.json"),
      artifacts.offlineSummary,
    ),
    atomicWriteJson(
      join(resultsDir, "human-calibration-summary.json"),
      artifacts.humanCalibration,
    ),
    atomicWriteJson(
      join(resultsDir, "privacy-audit.json"),
      artifacts.privacyAudit,
    ),
    atomicWriteJson(
      join(resultsDir, "live-plan-hash.json"),
      artifacts.planHash,
    ),
  ]);
  return artifacts;
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const artifacts = await runOfflineEvaluation();
  process.stdout.write(
    `${JSON.stringify({
      status: "completed_offline",
      case_count: artifacts.offlineSummary.case_results.length,
      pair_count: artifacts.offlineSummary.paired_regression.pair_count,
      privacy_passed: artifacts.privacyAudit.passed,
      live_network_requests: 0,
      plan_hash: artifacts.planHash.digest_hex,
    })}\n`,
  );
}
