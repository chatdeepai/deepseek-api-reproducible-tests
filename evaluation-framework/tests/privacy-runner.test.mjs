import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { buildOfflineArtifacts } from "../source/offline-runner.mjs";
import {
  auditPublicArtifact,
  publicPrivacySummary,
} from "../source/privacy.mjs";
import { getLiveGuardDecision } from "../source/live-guard.mjs";
import { ROOT_DIR, loadFixtures } from "./helpers.mjs";

const fixtures = await loadFixtures();
const artifacts = buildOfflineArtifacts(fixtures);

test("public synthetic fixture inputs pass the privacy profile", () => {
  const audit = auditPublicArtifact(fixtures.dataset, {
    profile: "synthetic_fixture",
  });
  assert.equal(audit.passed, true);
  assert.equal(audit.synthetic_fixture_inputs_allowed, true);
});

test("raw provider output fields fail the privacy audit", () => {
  const audit = auditPublicArtifact({
    raw_provider_output: "provider text",
  });
  assert.equal(audit.passed, false);
  assert.equal(audit.issue_code_counts.provider_payload_field, 1);
});

test("false retention declarations are safe evidence", () => {
  const audit = auditPublicArtifact({
    response_text_retained: false,
    reasoning_retained: false,
    tool_arguments_retained: false,
  });
  assert.equal(audit.passed, true);
});

test("credential-shaped strings fail without storing the test value", () => {
  const secretLike = ["sk", "syntheticcredential123456"].join("-");
  const audit = auditPublicArtifact({ safe_label: secretLike });
  assert.equal(audit.passed, false);
  assert.equal(audit.issue_code_counts.credential_pattern, 1);
});

test("local filesystem path strings fail the privacy audit", () => {
  const localPath = ["C:", "Users", "Example", "secret.txt"].join("\\");
  const audit = auditPublicArtifact({ safe_label: localPath });
  assert.equal(audit.passed, false);
  assert.equal(audit.issue_code_counts.local_path_value, 1);
});

test("public privacy summary omits issue locations", () => {
  const summary = publicPrivacySummary([
    auditPublicArtifact({ raw_error: "failure" }),
  ]);
  assert.equal(summary.passed, false);
  assert.equal(Object.hasOwn(summary, "issues"), false);
  assert.equal(summary.issue_count, 1);
});

test("offline artifacts contain twelve cases and no live calls", () => {
  const summary = artifacts.offlineSummary;
  assert.equal(summary.case_results.length, 12);
  assert.equal(summary.live_status, "not_run");
  assert.equal(summary.live_network_requests, 0);
  assert.equal(summary.evidence_boundary.synthetic_fixture_inputs_public, true);
});

test("offline artifacts pass recursive privacy auditing", () => {
  assert.equal(artifacts.privacyAudit.passed, true);
  assert.equal(artifacts.privacyAudit.issue_count, 0);
  assert.equal(artifacts.privacyAudit.artifact_count, 3);
});

test("published summary does not contain synthetic response bodies", () => {
  const serialized = JSON.stringify(artifacts.offlineSummary);
  for (const response of fixtures.responses.responses) {
    if (typeof response.text === "string") {
      assert.equal(serialized.includes(response.text), false);
    }
    if (response.tool_call) {
      assert.equal(serialized.includes(response.tool_call.arguments), false);
    }
  }
});

test("live guard is fail-closed with fixed execution limits", () => {
  assert.deepEqual(getLiveGuardDecision(), {
    allowed: false,
    status: "not_run",
    reason: "paid_live_execution_not_authorized",
    planned_provider_requests: 12,
    provider_request_cap: 12,
    concurrency: 1,
    automatic_retries: 0,
    network_adapter_present: false,
    provider_requests_made: 0,
  });
});

test("live command exits nonzero without a network adapter", () => {
  const result = spawnSync(
    process.execPath,
    [join(ROOT_DIR, "source", "live-guard.mjs")],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /paid_live_execution_not_authorized/);
  assert.equal(result.stdout, "");
});

test("live guard source contains no fetch or HTTP client import", async () => {
  const source = await readFile(
    join(ROOT_DIR, "source", "live-guard.mjs"),
    "utf8",
  );
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("node:http"), false);
  assert.equal(source.includes("node:https"), false);
});

test("all publishable generated artifacts are ASCII", () => {
  const serialized = JSON.stringify(artifacts);
  assert.equal(/[^\x00-\x7F]/u.test(serialized), false);
});
