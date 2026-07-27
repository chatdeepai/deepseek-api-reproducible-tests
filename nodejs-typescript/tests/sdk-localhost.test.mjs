import assert from "node:assert/strict";
import test from "node:test";
import OpenAI from "openai";

import {
  OFFLINE_PLACEHOLDER,
  buildClient,
} from "../dist/src/client.js";
import { loadPlan } from "../dist/src/plan.js";
import { executePlanSerially } from "../dist/src/scenarios.js";
import { assertSafeEvidence } from "../dist/src/security.js";
import { startMockServer } from "./mock-server.mjs";

function requestBody(model) {
  return {
    model,
    messages: [{ role: "user", content: "Synthetic offline request." }],
    max_tokens: 16,
    thinking: { type: "disabled" },
  };
}

test("the real SDK serializes and parses the complete nine-request matrix", async () => {
  const mock = await startMockServer();
  try {
    const { plan } = await loadPlan();
    const client = buildClient({
      apiKey: OFFLINE_PLACEHOLDER,
      baseURL: mock.baseURL,
      timeoutMs: 2000,
    });
    const reserved = [];
    const results = await executePlanSerially(client, plan, (caseItem) => {
      reserved.push(caseItem.id);
    });

    assert.equal(results.length, 9);
    assert.equal(mock.requests.length, 9);
    assert.equal(reserved.length, 9);
    assert.equal(mock.maxActiveRequests, 1);
    assert.ok(mock.requests.every((item) => item.path === "/chat/completions"));
    assert.deepEqual(mock.requests[0].body.thinking, { type: "disabled" });
    assert.equal(mock.requests[1].body.stream, true);
    assert.deepEqual(mock.requests[1].body.stream_options, {
      include_usage: true,
    });
    assert.deepEqual(mock.requests[2].body.response_format, {
      type: "json_object",
    });
    assert.equal(
      mock.requests[3].body.tools[0].function.name,
      "lookup_synthetic_record",
    );
    assert.equal(mock.requests[3].body.tool_choice.function.name, "lookup_synthetic_record");
    assert.equal(mock.requests[4].body.messages.at(-1).role, "tool");
    assert.equal(
      mock.requests[4].body.messages.at(-1).tool_call_id,
      mock.requests[4].body.messages[1].tool_calls[0].id,
    );
    assert.deepEqual(mock.requests[5].body.thinking, { type: "enabled" });
    assert.equal(mock.requests[5].body.reasoning_effort, "high");
    assert.equal(mock.requests[6].body.model, "deepseek-chat");
    assert.equal(mock.requests[7].body.model, "deepseek-reasoner");
    assert.equal(mock.requests[8].body.model, "deepseek-does-not-exist");

    assert.equal(results[0].status, 200);
    assert.equal(results[1].usage_chunk_seen, true);
    assert.equal(results[2].schema_valid, true);
    assert.equal(results[3].tool_call_valid, true);
    assert.equal(results[4].replay_call_alias, "T1");
    assert.equal(results[5].reasoning_field_present, true);
    assert.equal(results[8].status, 400);
    assert.equal(results[8].exception_class, "BadRequestError");
    assert.equal(results[8].expected_error_observed, true);
    assert.doesNotThrow(() => assertSafeEvidence({ results }));
  } finally {
    await mock.close();
  }
});
test("maxRetries zero permits one attempt for a controlled 500", async () => {
  const mock = await startMockServer();
  try {
    const client = buildClient({
      apiKey: OFFLINE_PLACEHOLDER,
      baseURL: mock.baseURL,
      timeoutMs: 2000,
    });
    await assert.rejects(
      client.chat.completions.create(requestBody("synthetic-always-500")),
      (error) => error?.status === 500 && error?.constructor?.name === "InternalServerError",
    );
    assert.equal(mock.requests.length, 1);
  } finally {
    await mock.close();
  }
});

test("SDK retry classification retries 429 but not 400 when one retry is enabled", async () => {
  const rateLimitMock = await startMockServer();
  try {
    const retryingClient = new OpenAI({
      apiKey: OFFLINE_PLACEHOLDER,
      baseURL: rateLimitMock.baseURL,
      timeout: 2000,
      maxRetries: 1,
      logLevel: "off",
    });
    await assert.rejects(
      retryingClient.chat.completions.create(requestBody("synthetic-429")),
      (error) => error?.status === 429,
    );
    assert.equal(rateLimitMock.requests.length, 2);
  } finally {
    await rateLimitMock.close();
  }

  const badRequestMock = await startMockServer();
  try {
    const retryingClient = new OpenAI({
      apiKey: OFFLINE_PLACEHOLDER,
      baseURL: badRequestMock.baseURL,
      timeout: 2000,
      maxRetries: 1,
      logLevel: "off",
    });
    await assert.rejects(
      retryingClient.chat.completions.create(requestBody("synthetic-400")),
      (error) => error?.status === 400,
    );
    assert.equal(badRequestMock.requests.length, 1);
  } finally {
    await badRequestMock.close();
  }
});

test("timeout with maxRetries zero produces one localhost attempt", async () => {
  const mock = await startMockServer();
  try {
    const client = buildClient({
      apiKey: OFFLINE_PLACEHOLDER,
      baseURL: mock.baseURL,
      timeoutMs: 40,
    });
    await assert.rejects(
      client.chat.completions.create(requestBody("synthetic-slow")),
      (error) =>
        ["APIConnectionTimeoutError", "APIConnectionError"].includes(
          error?.constructor?.name,
        ),
    );
    assert.equal(mock.requests.length, 1);
  } finally {
    await mock.close();
  }
});

test("AbortController cancels one slow localhost request without retry", async () => {
  const mock = await startMockServer();
  try {
    const client = buildClient({
      apiKey: OFFLINE_PLACEHOLDER,
      baseURL: mock.baseURL,
      timeoutMs: 2000,
    });
    const controller = new AbortController();
    const pending = client.chat.completions.create(
      requestBody("synthetic-slow"),
      { signal: controller.signal },
    );
    while (mock.requests.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    controller.abort();
    await assert.rejects(pending, (error) =>
      ["APIUserAbortError", "AbortError", "Error"].includes(
        error?.constructor?.name,
      ),
    );
    assert.equal(mock.requests.length, 1);
  } finally {
    await mock.close();
  }
});
