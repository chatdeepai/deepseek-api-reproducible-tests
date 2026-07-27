import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  OFFLINE_PLACEHOLDER,
  STRUCTURED_SCHEMA,
  TOOL_SCHEMA,
  buildChatModel,
} from "../js/adapter.mjs";
import { startMockServer } from "./mock-server.mjs";

test("pinned JavaScript packages match the frozen plan", async () => {
  const deepseek = JSON.parse(
    await readFile(new URL("../node_modules/@langchain/deepseek/package.json", import.meta.url)),
  );
  const core = JSON.parse(
    await readFile(new URL("../node_modules/@langchain/core/package.json", import.meta.url)),
  );
  const zod = JSON.parse(
    await readFile(new URL("../node_modules/zod/package.json", import.meta.url)),
  );
  assert.equal(deepseek.version, "1.1.5");
  assert.equal(core.version, "1.2.3");
  assert.equal(zod.version, "4.4.3");
});

test("invoke, stream, model, base URL, and thinking pass through", async () => {
  const mock = await startMockServer();
  try {
    const model = buildChatModel({
      model: "deepseek-v4-flash",
      apiKey: OFFLINE_PLACEHOLDER,
      baseURL: mock.baseURL,
      thinking: "disabled",
    });
    const message = await model.invoke("Synthetic offline question.");
    assert.equal(message.content, "Synthetic answer.");

    const chunks = [];
    for await (const chunk of await model.stream("Synthetic offline question.")) {
      chunks.push(chunk);
    }
    assert.ok(chunks.some((chunk) => chunk.content));
    assert.equal(mock.requests.length, 2);
    assert.equal(mock.requests[0].path, "/chat/completions");
    assert.equal(mock.requests[0].body.model, "deepseek-v4-flash");
    assert.deepEqual(mock.requests[0].body.thinking, { type: "disabled" });
    assert.equal(mock.requests[1].body.stream, true);
  } finally {
    await mock.close();
  }
});

test("structured output and tool binding serialize deterministic schemas", async () => {
  const mock = await startMockServer();
  try {
    const model = buildChatModel({
      model: "deepseek-v4-flash",
      apiKey: OFFLINE_PLACEHOLDER,
      baseURL: mock.baseURL,
    });
    const structured = model.withStructuredOutput(STRUCTURED_SCHEMA, {
      name: "StructuredAnswer",
      method: "functionCalling",
    });
    const parsed = await structured.invoke("Return the synthetic structured object.");
    assert.deepEqual(parsed, { label: "synthetic", score: 1 });

    const bound = model.bindTools([TOOL_SCHEMA], {
      tool_choice: { type: "function", function: { name: "SyntheticLookup" } },
    });
    const toolMessage = await bound.invoke("Use the synthetic lookup tool.");
    assert.equal(toolMessage.tool_calls.length, 1);
    assert.equal(toolMessage.tool_calls[0].name, "SyntheticLookup");
    assert.deepEqual(toolMessage.tool_calls[0].args, { key: "retention" });
    assert.equal(mock.requests.length, 2);
    assert.ok(Array.isArray(mock.requests[0].body.tools));
    assert.equal(mock.requests[1].body.tools[0].function.name, "SyntheticLookup");
  } finally {
    await mock.close();
  }
});

test("typed error, zero retry, and abort signal boundaries", async () => {
  const mock = await startMockServer();
  try {
    const failing = buildChatModel({
      model: "synthetic-always-500",
      apiKey: OFFLINE_PLACEHOLDER,
      baseURL: mock.baseURL,
      maxRetries: 0,
    });
    await assert.rejects(
      failing.invoke("Synthetic offline question."),
      (error) => error?.status === 500,
    );
    assert.equal(mock.requests.length, 1);

    const slow = buildChatModel({
      model: "synthetic-slow",
      apiKey: OFFLINE_PLACEHOLDER,
      baseURL: mock.baseURL,
      maxRetries: 0,
    });
    const controller = new AbortController();
    const pending = slow.invoke("Synthetic offline question.", {
      signal: controller.signal,
    });
    while (mock.requests.length < 2) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    controller.abort();
    await assert.rejects(pending, (error) =>
      ["AbortError", "Error"].includes(error?.name),
    );
    assert.equal(mock.requests.length, 2);
  } finally {
    await mock.close();
  }
});
