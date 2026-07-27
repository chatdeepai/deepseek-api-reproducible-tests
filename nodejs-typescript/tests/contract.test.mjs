import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  RequestLedger,
  assertFreshResults,
} from "../dist/src/budget.js";
import {
  installedVersions,
  runLive,
} from "../dist/src/live-runner.js";
import {
  EXPECTED_PROVIDER_REQUEST_CAP,
  loadPlan,
  validatePlan,
} from "../dist/src/plan.js";
import {
  assertAllowlistedResult,
  assertSafeEvidence,
  inspectText,
} from "../dist/src/security.js";

test("dependency pins match the installed current toolchain", () => {
  assert.deepEqual(installedVersions(), {
    openai: "6.49.0",
    typescript: "7.0.2",
    node_types: "24.13.3",
  });
});

test("the frozen provider plan is exactly nine serial zero-retry requests", async () => {
  const { plan, sha256 } = await loadPlan();
  assert.equal(plan.provider_request_cap, EXPECTED_PROVIDER_REQUEST_CAP);
  assert.equal(plan.planned_provider_requests, 9);
  assert.equal(plan.cases.length, 9);
  assert.equal(plan.concurrency, 1);
  assert.equal(plan.automatic_retries, 0);
  assert.match(sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    plan.cases.map((item) => item.scenario),
    [
      "ordinary_chat",
      "streaming",
      "json_output",
      "tool_initial",
      "tool_continuation",
      "thinking",
      "alias_probe",
      "alias_probe",
      "invalid_model",
    ],
  );
});

test("mutating the cap, order, or dependency pin is rejected", async () => {
  const { plan } = await loadPlan();
  const wrongCap = structuredClone(plan);
  wrongCap.provider_request_cap = 10;
  assert.throws(() => validatePlan(wrongCap), /cap/);

  const wrongOrder = structuredClone(plan);
  [wrongOrder.cases[0], wrongOrder.cases[1]] = [
    wrongOrder.cases[1],
    wrongOrder.cases[0],
  ];
  assert.throws(() => validatePlan(wrongOrder), /case/);

  const wrongPin = structuredClone(plan);
  wrongPin.versions.openai = "0.0.0";
  assert.throws(() => validatePlan(wrongPin), /pin/);
});

test("live execution fails closed before creating run state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "deepseek-node-guard-"));
  try {
    await assert.rejects(
      runLive({
        allowProviderRequests: false,
        apiKey: undefined,
        resultsDirectory: directory,
      }),
      /disabled/,
    );
    await assert.doesNotReject(assertFreshResults(directory));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the ledger rejects duplicates, a tenth reservation, and a rerun", async () => {
  const directory = await mkdtemp(join(tmpdir(), "deepseek-node-ledger-"));
  const path = join(directory, "run-ledger.json");
  const ledger = new RequestLedger(path, {
    cap: 9,
    planSha256: "a".repeat(64),
  });
  try {
    await ledger.initialize();
    await ledger.reserve("case-1");
    await assert.rejects(ledger.reserve("case-1"), /cannot reserve twice/);
    for (let index = 2; index <= 9; index += 1) {
      await ledger.reserve(`case-${index}`);
    }
    await assert.rejects(ledger.reserve("case-10"), /cap reached/);
    await assert.rejects(ledger.initialize());
    await assert.rejects(assertFreshResults(directory), /Prior run state/);
    const completed = await ledger.complete();
    assert.equal(completed.issued, 9);
    assert.equal(completed.status, "completed");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("privacy controls reject raw fields, credentials, and non-ASCII evidence", () => {
  assert.throws(
    () => assertAllowlistedResult({ results: [{ content: "forbidden" }] }),
    /Forbidden evidence field/,
  );
  const syntheticCredential = `sk-${"A".repeat(24)}`;
  assert.equal(inspectText(syntheticCredential).secret_findings, 1);
  assert.throws(
    () => assertSafeEvidence({ safe_value: "non-ascii-\u00e9" }),
    /privacy scan/,
  );
  assert.doesNotThrow(() =>
    assertSafeEvidence({
      results: [{ content_nonempty: true, reasoning_field_present: true }],
    }),
  );
});
