import assert from "node:assert/strict";
import test from "node:test";

import { RequestLifecycle } from "../source/lifecycle.mjs";
import {
  redactDiagnosticText,
  sanitizeLogRecord,
} from "../source/redaction.mjs";

test("request lifecycle records ordered safe events without publishing correlation IDs", () => {
  const privateIdentifier = "corr_private_lifecycle_value";
  const lifecycle = new RequestLifecycle({
    internalCorrelationId: privateIdentifier,
    routeAlias: "chat_completion",
    model: "deepseek-v4-flash",
  });
  lifecycle.startAttempt(0);
  lifecycle.receiveHeaders({ status: 200, atMs: 40 });
  lifecycle.complete({ atMs: 75, finishReason: "stop" });

  const summary = lifecycle.summary();
  assert.deepEqual(
    summary.lifecycle_events.map((item) => item.event),
    ["created", "attempt_started", "headers_received", "completed"],
  );
  assert.equal(summary.correlation_linked, true);
  assert.equal(summary.internal_correlation_id_stored, false);
  assert.equal(JSON.stringify(summary).includes(privateIdentifier), false);
});

test("request lifecycle enforces state order and terminal completion", () => {
  const lifecycle = new RequestLifecycle({
    internalCorrelationId: "corr_private_state_value",
    routeAlias: "chat_completion",
    model: "deepseek-v4-flash",
  });
  assert.throws(
    () => lifecycle.receiveHeaders({ status: 200, atMs: 1 }),
    /active attempt/,
  );
  assert.throws(() => lifecycle.summary(), /nonterminal/);
  lifecycle.startAttempt(0);
  lifecycle.cancel(10);
  assert.throws(() => lifecycle.startAttempt(11), /current state/);
  assert.equal(lifecycle.summary().outcome, "cancelled");
});

test("retry lifecycle exposes normalized attempt accounting", () => {
  const lifecycle = new RequestLifecycle({
    internalCorrelationId: "corr_private_retry_value",
    routeAlias: "chat_completion",
    model: "deepseek-v4-flash",
  });
  lifecycle.startAttempt(0);
  lifecycle.receiveHeaders({ status: 503, atMs: 20 });
  lifecycle.scheduleRetry({
    atMs: 25,
    delayMs: 250,
    errorClass: "provider_overloaded",
  });
  lifecycle.startAttempt(275);
  lifecycle.receiveHeaders({ status: 200, atMs: 310 });
  lifecycle.complete({ atMs: 350, finishReason: "stop" });
  const summary = lifecycle.summary();
  assert.equal(summary.attempt_count, 2);
  assert.equal(summary.retry_count, 1);
  assert.equal(summary.status, 200);
});

test("allowlisted log sanitization discards payloads, headers, and raw IDs", () => {
  const record = sanitizeLogRecord({
    event: "completed",
    route_alias: "chat_completion",
    model: "deepseek-v4-flash",
    status: 200,
    attempt: 1,
    duration_ms: 80,
    outcome: "success",
    finish_reason: "stop",
    correlation_id: "corr_private_log_value",
    prompt: "discarded",
    output: "discarded",
    headers: { authorization: "discarded" },
  });
  assert.equal(record.correlation_linked, true);
  assert.equal("prompt" in record, false);
  assert.equal("output" in record, false);
  assert.equal("headers" in record, false);
  assert.equal("correlation_id" in record, false);
});

test("local diagnostic redaction removes credential, contact, identifier, and path patterns", () => {
  const credential = ["sk", "offline", "A".repeat(16)].join("-");
  const identifier = [
    "12345678",
    "1234",
    "4123",
    "8123",
    "123456789abc",
  ].join("-");
  const raw = [
    credential,
    "Bearer offline-token-value",
    "offline@example.invalid",
    identifier,
    "corr_private_diagnostic",
    "C:\\offline\\private\\file.txt",
  ].join(" ");
  const redacted = redactDiagnosticText(raw);
  for (const fragment of [
    credential,
    "offline-token-value",
    "offline@example.invalid",
    identifier,
    "corr_private_diagnostic",
    "C:\\offline",
  ]) {
    assert.equal(redacted.includes(fragment), false);
  }
});
