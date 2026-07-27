import assert from "node:assert/strict";
import test from "node:test";

import { StreamMetrics } from "../source/stream-metrics.mjs";
import { ToolTrace } from "../source/tool-trace.mjs";

test("stream metrics retain counts and timings without chunks", () => {
  const metrics = new StreamMetrics();
  metrics.record({ type: "network_chunk", at_ms: 100, network_bytes: 200 });
  metrics.record({ type: "json_event", at_ms: 120 });
  metrics.record({ type: "content_delta", at_ms: 200, delta_chars: 5 });
  metrics.record({ type: "reasoning_delta", at_ms: 240, delta_chars: 8 });
  metrics.record({ type: "usage", at_ms: 400 });
  metrics.record({ type: "finish", at_ms: 450, finish_reason: "stop" });
  const summary = metrics.close(500);

  assert.equal(summary.network_chunk_count, 1);
  assert.equal(summary.json_event_count, 1);
  assert.equal(summary.time_to_first_content_ms, 200);
  assert.equal(summary.terminal_usage_present, true);
  assert.equal(summary.finish_reason, "stop");
  assert.equal(summary.raw_chunks_retained, false);
});

test("stream metrics reject raw delta fields and nonmonotonic events", () => {
  const metrics = new StreamMetrics();
  assert.throws(
    () =>
      metrics.record({
        type: "content_delta",
        at_ms: 10,
        delta_chars: 5,
        content: "not accepted",
      }),
    /Raw stream fields/,
  );
  metrics.record({ type: "json_event", at_ms: 20 });
  assert.throws(
    () => metrics.record({ type: "json_event", at_ms: 19 }),
    /monotonic/,
  );
});

test("stream metrics require a terminal finish event", () => {
  const metrics = new StreamMetrics();
  metrics.record({ type: "json_event", at_ms: 10 });
  assert.throws(() => metrics.close(20), /terminal finish/);
});

test("tool trace records the safety sequence without identifiers or payloads", () => {
  const privateIdentifier = "corr_private_tool_trace";
  const trace = new ToolTrace({
    internalCorrelationId: privateIdentifier,
    toolName: "lookup_synthetic_record",
  });
  trace.record({ phase: "tool_requested", outcome: "pass", at_ms: 10 });
  trace.record({ phase: "tool_validated", outcome: "pass", at_ms: 20 });
  trace.record({ phase: "tool_authorized", outcome: "pass", at_ms: 30 });
  trace.record({ phase: "tool_executed", outcome: "pass", at_ms: 40 });
  trace.record({ phase: "tool_replayed", outcome: "pass", at_ms: 50 });
  const summary = trace.summary();
  assert.equal(summary.trace_complete, true);
  assert.equal(summary.tool_arguments_stored, false);
  assert.equal(summary.tool_result_stored, false);
  assert.equal(summary.provider_tool_call_id_stored, false);
  assert.equal(JSON.stringify(summary).includes(privateIdentifier), false);
});

test("tool trace rejects skipped phases and raw tool fields", () => {
  const trace = new ToolTrace({
    internalCorrelationId: "corr_private_tool_order",
    toolName: "lookup_synthetic_record",
  });
  assert.throws(
    () =>
      trace.record({
        phase: "tool_validated",
        outcome: "pass",
        at_ms: 10,
      }),
    /safety sequence/,
  );
  assert.throws(
    () =>
      trace.record({
        phase: "tool_requested",
        outcome: "pass",
        at_ms: 10,
        arguments: "not accepted",
      }),
    /Raw tool fields/,
  );
});
