import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { readJson } from "./io.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const templatePath = join(ROOT, "article-gutenberg-template.html");
const outputPath = join(ROOT, "article-gutenberg-preupload.html");
const resultPath = join(ROOT, "results", "live-summary.json");
const privacyPath = join(ROOT, "results", "live-privacy-audit.json");

const [template, result, privacy] = await Promise.all([
  readFile(templatePath, "utf8"),
  readJson(resultPath),
  readJson(privacyPath),
]);

if (result.status !== "complete" || privacy.passed !== true) {
  throw new Error("Live evidence is incomplete or failed privacy review.");
}

const overall = result.usage_and_estimated_cost.overall;
const paired = result.paired_regression;
const replacements = {
  GITHUB_PACKAGE_URL:
    "https://github.com/chatdeepai/deepseek-api-reproducible-tests/tree/main/evaluation-framework",
  LIVE_STUDY_DATE: "July 27, 2026 UTC",
  PLAN_SHA256: result.plan_sha256,
  REQUEST_CAP: String(result.method.planned_provider_requests),
  LIVE_PREFLIGHT_RESULT:
    "all 12 requests returned HTTP 200, the returned model matched the planned canonical ID in every observation, and a backend fingerprint field was present",
  LIVE_MODEL_IDS:
    "<code>deepseek-v4-flash</code>, <code>deepseek-v4-pro</code>",
  OBSERVED_REQUEST_COUNT: String(result.method.observed_provider_requests),
  BASELINE_PASS_COUNT: String(result.variants.baseline.pass_count),
  BASELINE_CASE_COUNT: String(result.variants.baseline.case_count),
  CANDIDATE_PASS_COUNT: String(result.variants.candidate.pass_count),
  CANDIDATE_CASE_COUNT: String(result.variants.candidate.case_count),
  PAIRED_WINS: String(paired.wins),
  PAIRED_LOSSES: String(paired.losses),
  PAIRED_TIES: String(paired.ties),
  TOTAL_PROMPT_TOKENS: String(overall.prompt_tokens),
  TOTAL_COMPLETION_TOKENS: String(overall.completion_tokens),
  TOTAL_TOKENS: String(overall.total_tokens),
  ESTIMATED_COST_USD: overall.estimated_cost_usd,
  PRICE_SNAPSHOT_DATE: "July 27, 2026",
  FAILED_CASE_SUMMARY:
    "0 failures under the original frozen evaluator; post-run evidence audit requires human review because tool-call cardinality was not retained; 7 of 12 offline reviewer-calibration items also routed to human review",
  LIVE_PRIVACY_AUDIT_STATUS:
    `Passed; ${privacy.issue_count} issues across ${privacy.audited_node_count} audited nodes`,
  RELEASE_GATE_OUTCOME:
    result.release_gate.decision === "human_review_required"
      ? "Human review required after the post-run evidence audit; the original frozen illustrative gate recorded a pass, but tool-call cardinality was not retained"
      : "Candidate passed this illustrative gate; high-risk deployment still requires human authorization",
  LIVE_RESULT_INTERPRETATION:
    "Flash and Pro each passed 6 of 6 bounded contracts under the original frozen evaluator, so all six paired comparisons were ties. This is mixed or insufficient comparative evidence, not proof of equivalence. The Wilson 95% interval for an observed 6 of 6 pass rate is 0.609657 to 1.000000, which is too wide for a production reliability claim. A post-run evidence audit changed the publication decision to human review required because the sanitizer did not retain tool-call cardinality.",
  LIVE_LIMITATIONS:
    "The live result contains one observation per task-model pair and no stochastic repeats. The frozen sanitizer retained only the first tool proposal, not the total proposal count.",
};

let article = template;
for (const [token, value] of Object.entries(replacements)) {
  article = article.replaceAll(`{{${token}}}`, value);
}

const unresolved = [
  ...article.matchAll(/\{\{([A-Z0-9_]+)\}\}/g),
].map((match) => match[1]);
const allowed = new Set(
  Array.from({ length: 8 }, (_, index) => {
    const value = String(index + 1).padStart(2, "0");
    return [`VISUAL_${value}_ID`, `VISUAL_${value}_URL`];
  }).flat(),
);
const unexpected = unresolved.filter((token) => !allowed.has(token));
if (unexpected.length > 0) {
  throw new Error(`Unexpected unresolved tokens: ${unexpected.join(", ")}`);
}
if (/[\u0600-\u06FF]/u.test(article)) {
  throw new Error("The article contains Arabic characters.");
}

await writeFile(outputPath, article, "utf8");
console.log(
  JSON.stringify({
    output: "article-gutenberg-preupload.html",
    unresolved_visual_tokens: unresolved.length,
    characters: article.length,
  }),
);
