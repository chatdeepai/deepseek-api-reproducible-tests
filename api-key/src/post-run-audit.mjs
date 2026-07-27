import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import { scanText } from "./secret-scan.mjs";

const suiteDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(suiteDirectory, "results/final-results-summary.json");

const EXPECTED_SUCCESS_CASES = Object.freeze([
  "LIVE-01",
  "LIVE-02",
  "LIVE-03",
  "ROT-01",
  "ROT-02",
  "ROT-04"
]);

const EXPECTED_REJECTION_CASES = Object.freeze([
  "AUTH-01",
  "AUTH-02",
  "AUTH-03",
  "AUTH-04",
  "ROT-03",
  "ROT-05"
]);

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function everyTrue(record) {
  return (
    record !== null &&
    typeof record === "object" &&
    Object.values(record).every((value) => value === true)
  );
}

function caseById(results, caseId) {
  return results.find((item) => item?.case_id === caseId) ?? null;
}

export function auditSanitizedHistoricalResult(source) {
  if (source === null || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError("A parsed sanitized result object is required.");
  }

  const results = Array.isArray(source.results) ? source.results : [];
  const caseIds = results.map((item) => item?.case_id);
  const uniqueCaseIds = new Set(caseIds);
  const successCases = EXPECTED_SUCCESS_CASES.map((caseId) => caseById(results, caseId));
  const rejectionCases = EXPECTED_REJECTION_CASES.map((caseId) => caseById(results, caseId));
  const modelCase = caseById(results, "LIVE-01");
  const completionCase = caseById(results, "LIVE-02");
  const balanceCase = caseById(results, "LIVE-03");
  const usage = completionCase?.usage;
  const serialized = JSON.stringify(source);

  const checks = {
    sourceSchemaRecognized:
      source.schema_version === "1.0.0" &&
      source.evidence_type === "bounded_deepseek_api_key_lifecycle_observations",
    declaredCaseCountMatches:
      source.execution?.logical_live_cases === 12 &&
      source.execution?.http_requests === 12 &&
      results.length === 12,
    caseIdsAreUnique: uniqueCaseIds.size === 12 && caseIds.every(
      (caseId) => typeof caseId === "string" && caseId.length > 0
    ),
    allCasesMarkedPassed: results.length === 12 && results.every(
      (item) => item?.passed === true
    ),
    exactAuthorizedStatuses:
      successCases.every((item) => item?.status === 200 && item?.passed === true),
    exactRejectedStatuses:
      rejectionCases.every((item) => item?.status === 401 && item?.passed === true),
    modelListSchemaRecorded:
      modelCase?.status === 200 &&
      everyTrue(modelCase?.schema_checks) &&
      Array.isArray(modelCase?.model_ids) &&
      modelCase.model_ids.length === modelCase?.model_count &&
      modelCase.model_ids.every((id) => typeof id === "string" && id.length > 0),
    completionSchemaRecorded:
      completionCase?.status === 200 &&
      everyTrue(completionCase?.schema_checks) &&
      completionCase?.model === "deepseek-v4-flash" &&
      completionCase?.finish_reason === "stop" &&
      completionCase?.content_exact_authenticated_ok === true,
    completionUsageReconciles:
      isNonNegativeInteger(usage?.prompt_tokens) &&
      isNonNegativeInteger(usage?.completion_tokens) &&
      isNonNegativeInteger(usage?.total_tokens) &&
      usage.prompt_tokens + usage.completion_tokens === usage.total_tokens,
    balanceSchemaRecorded:
      balanceCase?.status === 200 &&
      everyTrue(balanceCase?.schema_checks) &&
      typeof balanceCase?.is_available === "boolean" &&
      balanceCase?.monetary_values_published === false,
    temporaryKeysClosed:
      source.credential_lifecycle?.temporary_keys_created === 2 &&
      source.credential_lifecycle?.temporary_keys_revoked === 2 &&
      source.credential_lifecycle?.temporary_key_rows_remaining === 0,
    privacyFlagsClosed:
      source.privacy !== null &&
      typeof source.privacy === "object" &&
      Object.values(source.privacy).every(
        (value) => value === false || value === 0
      ),
    staticSecretScanClean: scanText(serialized, {
      source: "results/final-results-summary.json"
    }).length === 0
  };

  const passed = Object.values(checks).every((value) => value === true);

  return Object.freeze({
    schema_version: "1.1.0",
    audit_type: "offline_audit_of_preserved_sanitized_observation",
    source: "results/final-results-summary.json",
    source_run_id: typeof source.run_id === "string" ? source.run_id : null,
    source_test_date_utc:
      typeof source.test_date_utc === "string" ? source.test_date_utc : null,
    provider_requests_issued: 0,
    verdict: passed ? "pass" : "fail",
    checks: Object.freeze({ ...checks }),
    interpretation:
      "This deterministic audit validates the preserved sanitized July 27 observation. It does not reissue provider requests and does not claim that the corrected future-run harness produced the historical result.",
    limitations: Object.freeze([
      "Credentials, raw headers, raw response bodies, account data, and monetary values were intentionally omitted and cannot be reconstructed by this audit.",
      "A future provider rerun must produce a new dated result instead of overwriting the preserved observation."
    ])
  });
}

async function main() {
  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  const audit = auditSanitizedHistoricalResult(source);
  console.log(JSON.stringify(audit, null, 2));
  if (audit.verdict !== "pass") {
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
