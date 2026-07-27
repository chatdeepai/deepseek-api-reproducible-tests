import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

import { atomicWriteJson, readJson } from "./io.mjs";
import {
  auditPublicArtifact,
  publicPrivacySummary,
} from "./privacy.mjs";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = dirname(MODULE_DIR);

export async function applyPostRunAudit(options = {}) {
  const resultsDir = options.resultsDir ?? join(ROOT_DIR, "results");
  const summaryPath = join(resultsDir, "live-summary.json");
  const privacyPath = join(resultsDir, "live-privacy-audit.json");
  const ledgerPath = join(resultsDir, "live-run-ledger.json");
  const [summary, ledger] = await Promise.all([
    readJson(summaryPath),
    readJson(ledgerPath),
  ]);

  if (summary.status !== "complete" || !Array.isArray(summary.observations)) {
    throw new Error("A complete live summary is required for post-run audit.");
  }

  const modelIdentityAllMatched = summary.observations.every(
    (row) => row.returned_model_matches === true,
  );
  const expectedFinishReasonsAllMatched = summary.observations.every(
    (row) =>
      row.finish_reason ===
      (row.task_id === "tool-selection" ? "tool_calls" : "stop"),
  );
  const toolRows = summary.observations.filter(
    (row) => row.task_id === "tool-selection",
  );
  const toolCallCardinalityRetained =
    toolRows.length > 0 &&
    toolRows.every((row) => Number.isInteger(row.tool_call_count));

  const evidenceGapCodes = [];
  if (!modelIdentityAllMatched) {
    evidenceGapCodes.push("returned_model_mismatch");
  }
  if (!expectedFinishReasonsAllMatched) {
    evidenceGapCodes.push("unexpected_finish_reason");
  }
  if (!toolCallCardinalityRetained) {
    evidenceGapCodes.push("tool_call_cardinality_not_retained");
  }

  const originalFrozenDecision =
    summary.release_gate.original_frozen_decision ??
    summary.release_gate.decision;
  const publicationDecision =
    evidenceGapCodes.length === 0
      ? originalFrozenDecision
      : "human_review_required";
  const performedAtUtc =
    summary.post_run_audit?.performed_at_utc ??
    options.performedAtUtc ??
    new Date().toISOString();

  summary.post_run_audit = {
    status:
      evidenceGapCodes.length === 0
        ? "complete"
        : "completed_with_evidence_gap",
    performed_at_utc: performedAtUtc,
    model_identity_all_matched: modelIdentityAllMatched,
    expected_finish_reasons_all_matched:
      expectedFinishReasonsAllMatched,
    tool_call_cardinality_retained: toolCallCardinalityRetained,
    raw_provider_payload_reinspection_performed: false,
    evidence_gap_codes: evidenceGapCodes,
    publication_decision: publicationDecision,
  };
  summary.release_gate = {
    ...summary.release_gate,
    original_frozen_decision: originalFrozenDecision,
    decision: publicationDecision,
    post_run_audit_applied: true,
  };

  ledger.original_release_decision =
    ledger.original_release_decision ?? ledger.release_decision;
  ledger.release_decision = publicationDecision;
  ledger.post_run_audit_status = summary.post_run_audit.status;

  const privacy = publicPrivacySummary([auditPublicArtifact(summary)]);
  if (!privacy.passed) {
    throw new Error("The post-run summary failed the privacy audit.");
  }

  await Promise.all([
    atomicWriteJson(summaryPath, summary),
    atomicWriteJson(privacyPath, privacy),
    atomicWriteJson(ledgerPath, ledger),
  ]);
  return {
    status: summary.post_run_audit.status,
    publication_decision: publicationDecision,
    evidence_gap_codes: evidenceGapCodes,
    privacy_passed: privacy.passed,
  };
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  process.stdout.write(
    `${JSON.stringify(await applyPostRunAudit())}\n`,
  );
}
