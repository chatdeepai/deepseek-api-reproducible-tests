import type { RequestPlan, RunLedgerState } from "./types.js";
import { assertAllowlistedResult, assertSafeEvidence, inspectText } from "./security.js";

export interface PrivacyAudit {
  schema_version: number;
  audited_at_utc: string;
  summary_status: unknown;
  planned_case_count: number;
  result_count: number;
  provider_requests_issued: number;
  provider_request_cap: number;
  forbidden_result_field_findings: number;
  secret_findings: number;
  non_ascii_characters: number;
  mojibake_matches: number;
  checks: Record<string, boolean>;
  status: "pass" | "fail";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected an evidence object.");
  }
  return value as Record<string, unknown>;
}

export function auditSummary(
  summaryValue: unknown,
  plan: RequestPlan,
  ledger: RunLedgerState,
  auditedAt = new Date().toISOString(),
): PrivacyAudit {
  assertAllowlistedResult(summaryValue);
  assertSafeEvidence(ledger);
  const encoded = JSON.stringify(summaryValue);
  const text = inspectText(encoded);
  const summary = asRecord(summaryValue);
  const rawResults = summary.results;
  if (!Array.isArray(rawResults)) {
    throw new Error("Summary results must be an array.");
  }
  const results = rawResults.map(asRecord);
  const expectedIds = plan.cases.map((item) => item.id);
  const observedIds = results.map((item) => item.case_id);
  const issuedIds = results
    .filter((item) => item.request_issued === true)
    .map((item) => item.case_id);

  const checks: Record<string, boolean> = {
    summary_completed: summary.status === "completed",
    planned_case_count_matches:
      summary.planned_case_count === expectedIds.length,
    summary_cap_matches_plan:
      summary.provider_request_cap === plan.provider_request_cap,
    provider_origin_matches:
      summary.provider_origin === plan.provider_origin,
    openai_version_matches:
      summary.openai_version === plan.versions.openai,
    typescript_version_matches:
      summary.typescript_version === plan.versions.typescript,
    result_count_matches_plan: results.length === expectedIds.length,
    case_order_matches_plan:
      JSON.stringify(observedIds) === JSON.stringify(expectedIds),
    result_ids_are_unique: new Set(observedIds).size === observedIds.length,
    request_count_matches_summary:
      issuedIds.length === summary.provider_requests_issued,
    request_count_within_cap:
      issuedIds.length <= plan.provider_request_cap,
    concurrency_is_one:
      summary.concurrency === 1 && plan.concurrency === 1,
    automatic_retries_are_zero:
      summary.automatic_retries === 0 && plan.automatic_retries === 0,
    ledger_completed: ledger.status === "completed",
    ledger_cap_matches: ledger.cap === plan.provider_request_cap,
    ledger_count_matches: ledger.issued === issuedIds.length,
    ledger_case_order_matches:
      JSON.stringify(ledger.case_ids) === JSON.stringify(issuedIds),
    ledger_plan_matches: ledger.plan_sha256 === summary.plan_sha256,
    secret_findings_are_zero: text.secret_findings === 0,
    non_ascii_characters_are_zero: text.non_ascii_characters === 0,
    mojibake_matches_are_zero: text.mojibake_matches === 0,
  };

  const audit: PrivacyAudit = {
    schema_version: 1,
    audited_at_utc: auditedAt,
    summary_status: summary.status,
    planned_case_count: expectedIds.length,
    result_count: results.length,
    provider_requests_issued: issuedIds.length,
    provider_request_cap: plan.provider_request_cap,
    forbidden_result_field_findings: 0,
    ...text,
    checks,
    status: Object.values(checks).every(Boolean) ? "pass" : "fail",
  };
  assertSafeEvidence(audit);
  return audit;
}
