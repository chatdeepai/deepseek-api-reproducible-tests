import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  compileArgumentsForLocalExecution,
  validateArguments
} from "../src/argument-validator.mjs";
import {
  acceptInMemoryCredential,
  assertLiveSourceHasNoCredentialLoader
} from "../src/env-guard.mjs";
import {
  getLiveSafetyState,
  liveSuiteContract,
  runBoundedLiveSuite
} from "../src/live-runner.mjs";
import {
  followupContract,
  getFollowupSafetyState,
  runSingleAndMultiToolFollowup
} from "../src/live-followup.mjs";
import {
  createLocalToolRegistry,
  runScriptedOrchestration
} from "../src/orchestrator.mjs";
import { buildToolReplay } from "../src/replay.mjs";
import { sanitizeForPublic } from "../src/redact.mjs";
import { scanFiles, scanText } from "../src/secret-scan.mjs";
import {
  validateStrictSchema,
  validateStrictToolDefinition
} from "../src/strict-schema.mjs";
import { summarizeTurns } from "../src/summarize.mjs";
import {
  buildToolChoiceMatrix,
  normalizeToolChoice,
  toolChoiceContract,
  validateObservedCalls
} from "../src/tool-choice.mjs";
import {
  createSyntheticRegistryDefinitions,
  endlessToolTurns,
  inventorySchema,
  nonThinkingSingleCallTurns,
  strictToolDefinition,
  thinkingMultiToolTurns,
  withDuplicateCallId,
  withMissingReasoning,
  withUnknownTool
} from "../fixtures/scenarios.mjs";

const suiteDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function clone(value) {
  return structuredClone(value);
}

function errorCodes(report) {
  return report.errors.map((error) => error.code);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function toolCallBody({
  calls = [],
  thinking = false,
  final = false,
  content = null
} = {}) {
  return {
    choices: [
      {
        finish_reason: final ? "stop" : "tool_calls",
        message: {
          role: "assistant",
          content: final ? content ?? "Synthetic final answer." : null,
          ...(thinking
            ? { reasoning_content: "Synthetic private reasoning fixture." }
            : {}),
          tool_calls: final ? null : calls
        }
      }
    ],
    usage: {
      prompt_tokens: 20,
      completion_tokens: 8,
      total_tokens: 28,
      prompt_cache_hit_tokens: 4,
      prompt_cache_miss_tokens: 16
    }
  };
}

function inventoryCall(id = "synthetic-live-call-inventory") {
  return {
    id,
    type: "function",
    function: {
      name: "lookup_inventory",
      arguments: "{\"sku\":\"SKU-101\",\"warehouse\":\"west\",\"quantity\":2}"
    }
  };
}

function shippingCall(id = "synthetic-live-call-shipping") {
  return {
    id,
    type: "function",
    function: {
      name: "lookup_shipping",
      arguments: "{\"postal_code\":\"94105\",\"service\":\"express\"}"
    }
  };
}

function strictCall() {
  return {
    id: "synthetic-live-call-strict",
    type: "function",
    function: {
      name: "prepare_quote",
      arguments: JSON.stringify({
        customer_email: "synthetic@example.test",
        request_id: "550e8400-e29b-41d4-a716-446655440000",
        priority: "normal",
        discount_percent: 5,
        lines: [{ sku: "SKU-101", quantity: 1 }],
        destination: "94105"
      })
    }
  };
}

function sseToolResponse({ thinking }) {
  const events = [
    {
      choices: [
        {
          delta: {
            role: "assistant",
            ...(thinking
              ? { reasoning_content: "Synthetic stream reasoning." }
              : {}),
            tool_calls: [
              {
                index: 0,
                id: "synthetic-stream-call",
                type: "function",
                function: {
                  name: "lookup_",
                  arguments: "{\"sku\":\"SKU"
                }
              }
            ]
          },
          finish_reason: null
        }
      ],
      usage: null
    },
    {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                function: {
                  name: "inventory",
                  arguments:
                    "-101\",\"warehouse\":\"west\",\"quantity\":1}"
                }
              }
            ]
          },
          finish_reason: "tool_calls"
        }
      ],
      usage: null
    },
    {
      choices: [],
      usage: {
        prompt_tokens: 22,
        completion_tokens: 9,
        total_tokens: 31
      }
    }
  ];
  const text = [
    ...events.map((event) => `data: ${JSON.stringify(event)}`),
    "data: [DONE]"
  ].join("\n\n");
  return new Response(text, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" }
  });
}

test("runtime source has no credential or network path", async () => {
  const runtimeFiles = [
    "src/tool-choice.mjs",
    "src/strict-schema.mjs",
    "src/argument-validator.mjs",
    "src/replay.mjs",
    "src/summarize.mjs",
    "src/redact.mjs",
    "src/orchestrator.mjs",
    "fixtures/scenarios.mjs"
  ];
  const combined = (
    await Promise.all(
      runtimeFiles.map((file) => readFile(resolve(suiteDirectory, file), "utf8"))
    )
  ).join("\n");

  for (const forbidden of [
    /\bfetch\s*\(/,
    /node:(?:http|https|net|tls|dgram|dns)/,
    /\bWebSocket\b/,
    /\bEventSource\b/,
    /\baxios\b/,
    /\bundici\b/,
    /\bprocess\s*\.\s*env\b/,
    /\bDEEPSEEK_API_KEY\b/
  ]) {
    assert.equal(forbidden.test(combined), false, `Forbidden source pattern: ${forbidden}`);
  }
});

test("live source accepts only an in-memory credential and has no loader or logger", async () => {
  const credential = "memory-only-tool-calls-credential-0001";
  assert.equal(
    acceptInMemoryCredential(credential, { provenance: "memory" }),
    credential
  );
  for (const provenance of ["environment", "file", "command-line", "stdin"]) {
    assert.throws(
      () => acceptInMemoryCredential(credential, { provenance }),
      /in-memory/
    );
  }
  assert.throws(
    () => acceptInMemoryCredential("short", { provenance: "memory" }),
    /length/
  );

  const source = await readFile(
    resolve(suiteDirectory, "src/live-runner.mjs"),
    "utf8"
  );
  assert.equal(assertLiveSourceHasNoCredentialLoader(source), true);
});

test("live suite contract is exactly 30 requests within every hard bound", () => {
  assert.equal(liveSuiteContract.plannedRequestCount, 30);
  assert.equal(liveSuiteContract.hardProcessNetworkBudget, 30);
  assert.equal(liveSuiteContract.plan.length, 30);
  assert.equal(liveSuiteContract.maximumConcurrency, 1);
  assert.equal(liveSuiteContract.genericRetries, 0);
  assert.equal(liveSuiteContract.maximumTokensPerRequest, 96);
  assert.equal(liveSuiteContract.maximumTheoreticalOutputTokens, 1792);
  assert.ok(
    liveSuiteContract.plan.every(
      (entry) =>
        entry.plannedRequests === 1 &&
        entry.maxTokens >= 1 &&
        entry.maxTokens <= 96
    )
  );
  assert.deepEqual(
    new Set(liveSuiteContract.allowedUrls),
    new Set([
      "https://api.deepseek.com/chat/completions",
      "https://api.deepseek.com/beta/chat/completions"
    ])
  );

  const matrix = liveSuiteContract.plan.filter(
    (entry) => entry.group === "tool_choice_matrix"
  );
  assert.equal(matrix.length, 16);
  for (const model of ["deepseek-v4-flash", "deepseek-v4-pro"]) {
    const modelRows = matrix.filter((entry) => entry.model === model);
    assert.equal(modelRows.length, 8);
    assert.deepEqual(
      modelRows
        .filter((entry) => entry.thinking === "disabled")
        .map((entry) => entry.toolChoice),
      [
        "omitted-no-tools",
        "omitted-tools",
        "none",
        "auto",
        "required",
        "named"
      ]
    );
    assert.deepEqual(
      modelRows
        .filter((entry) => entry.thinking === "enabled")
        .map((entry) => entry.toolChoice),
      ["required", "named"]
    );
  }
  assert.equal(
    liveSuiteContract.plan.filter((entry) => entry.group === "strict_beta")
      .length,
    5
  );
});

test("mocked 30-request live suite is serial, bounded, and fully sanitized", async () => {
  const credential = "memory-only-tool-calls-credential-0001";
  let active = 0;
  let peak = 0;
  let requestNumber = 0;
  const requestedUrls = [];

  const fetchImpl = async (url, options) => {
    active += 1;
    peak = Math.max(peak, active);
    requestNumber += 1;
    const current = requestNumber;
    requestedUrls.push(String(url));

    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "error");
    assert.equal(
      options.headers.get("Authorization"),
      `Bearer ${credential}`
    );
    const body = JSON.parse(options.body);
    assert.ok(body.max_tokens >= 1 && body.max_tokens <= 96);
    assert.ok(["deepseek-v4-flash", "deepseek-v4-pro"].includes(body.model));
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1));

    let response;
    if (current <= 16) {
      const noChoice = !Object.hasOwn(body, "tool_choice");
      const noTools = !Array.isArray(body.tools);
      const shouldReturnFinal =
        body.tool_choice === "none" || (noChoice && noTools);
      response = jsonResponse(
        shouldReturnFinal
          ? toolCallBody({
              final: true,
              thinking: body.thinking.type === "enabled"
            })
          : toolCallBody({
              calls: [inventoryCall(`synthetic-matrix-call-${current}`)],
              thinking: body.thinking.type === "enabled"
            })
      );
    } else if (current === 17) {
      response = jsonResponse(
        toolCallBody({ calls: [inventoryCall("synthetic-single-live-call")] })
      );
    } else if (current === 18) {
      response = jsonResponse(toolCallBody({ final: true }));
    } else if (current === 19) {
      response = jsonResponse(
        toolCallBody({
          calls: [
            inventoryCall("synthetic-multiple-live-call-1"),
            shippingCall("synthetic-multiple-live-call-2")
          ]
        })
      );
    } else if (current === 20) {
      response = jsonResponse(toolCallBody({ final: true }));
    } else if (current === 21) {
      assert.equal(String(url), "https://api.deepseek.com/beta/chat/completions");
      response = jsonResponse(toolCallBody({ calls: [strictCall()] }));
    } else if (current >= 22 && current <= 25) {
      if (current === 23) {
        assert.equal(
          String(url),
          "https://api.deepseek.com/chat/completions"
        );
      } else {
        assert.equal(
          String(url),
          "https://api.deepseek.com/beta/chat/completions"
        );
      }
      response = jsonResponse(
        { error: { message: "Synthetic error body must not be published." } },
        400
      );
    } else if (current === 26) {
      assert.equal(body.thinking.type, "enabled");
      assert.equal(body.tool_choice, "auto");
      response = jsonResponse(
        toolCallBody({
          calls: [inventoryCall("synthetic-thinking-live-call")],
          thinking: true
        })
      );
    } else if (current === 27) {
      const replayedAssistant = body.messages.find(
        (message) => message.role === "assistant"
      );
      assert.equal(
        replayedAssistant.reasoning_content,
        "Synthetic private reasoning fixture."
      );
      response = jsonResponse(toolCallBody({ final: true, thinking: true }));
    } else if (current === 28) {
      const strippedAssistant = body.messages.find(
        (message) => message.role === "assistant"
      );
      assert.equal(Object.hasOwn(strippedAssistant, "reasoning_content"), false);
      response = jsonResponse(
        { error: { message: "Synthetic replay error must not be published." } },
        400
      );
    } else if (current === 29) {
      response = sseToolResponse({ thinking: false });
    } else if (current === 30) {
      assert.equal(body.thinking.type, "enabled");
      assert.equal(body.tool_choice, "auto");
      response = sseToolResponse({ thinking: true });
    } else {
      throw new Error("Mock received a request beyond the static plan.");
    }

    active -= 1;
    return response;
  };

  const result = await runBoundedLiveSuite({
    apiKey: credential,
    fetchImpl,
    timeoutMs: 5_000
  });
  const serialized = JSON.stringify(result);

  assert.equal(requestNumber, 30);
  assert.equal(result.plannedRequestCount, 30);
  assert.equal(result.executedRequestCount, 30);
  assert.equal(result.skippedRequestCount, 0);
  assert.equal(result.caseCount, 30);
  assert.equal(result.allCaseExpectationsMet, true);
  assert.equal(result.maximumTokensPerRequest, 96);
  assert.equal(result.maximumTheoreticalOutputTokens, 1792);
  assert.equal(result.genericRetries, 0);
  assert.equal(result.observedPeakConcurrency, 1);
  assert.equal(peak, 1);
  assert.ok(
    requestedUrls.every((url) =>
      liveSuiteContract.allowedUrls.includes(url)
    )
  );

  for (const forbidden of [
    credential,
    "Synthetic private reasoning fixture.",
    "Synthetic error body must not be published.",
    "Synthetic replay error must not be published.",
    "synthetic-single-live-call",
    "synthetic-multiple-live-call",
    "\"warehouse\"",
    "Authorization"
  ]) {
    assert.equal(serialized.includes(forbidden), false, `Leaked: ${forbidden}`);
  }

  const safety = getLiveSafetyState();
  assert.equal(safety.processNetworkAttempts, 30);
  assert.equal(safety.hardProcessNetworkBudget, 30);
  assert.equal(safety.observedPeakConcurrency, 1);
});

test("one-time follow-up contract is exactly four standard-route Flash requests", async () => {
  assert.equal(followupContract.plannedRequestCount, 4);
  assert.equal(followupContract.hardNetworkBudget, 4);
  assert.equal(followupContract.maximumConcurrency, 1);
  assert.equal(followupContract.genericRetries, 0);
  assert.equal(followupContract.maximumTokensPerRequest, 96);
  assert.equal(followupContract.maximumTheoreticalOutputTokens, 384);
  assert.equal(followupContract.model, "deepseek-v4-flash");
  assert.equal(followupContract.thinking, "disabled");
  assert.equal(
    followupContract.allowedUrl,
    "https://api.deepseek.com/chat/completions"
  );
  assert.equal(followupContract.oneTimeDiagnostic, true);
  assert.deepEqual(
    followupContract.plan.map((entry) => [
      entry.scenario,
      entry.phase,
      entry.expectedToolCallCount
    ]),
    [
      ["single_tool", "initial", 1],
      ["single_tool", "continuation", 0],
      ["multiple_tools", "initial", 2],
      ["multiple_tools", "continuation", 0]
    ]
  );

  const source = await readFile(
    resolve(suiteDirectory, "src/live-followup.mjs"),
    "utf8"
  );
  assert.equal(assertLiveSourceHasNoCredentialLoader(source), true);
});

test("mocked four-request follow-up completes both round trips without raw data", async () => {
  const credential = "memory-only-followup-credential-0001";
  let active = 0;
  let peak = 0;
  let requestCount = 0;

  const fetchImpl = async (url, options) => {
    active += 1;
    peak = Math.max(peak, active);
    requestCount += 1;
    const current = requestCount;
    assert.equal(
      String(url),
      "https://api.deepseek.com/chat/completions"
    );
    assert.equal(options.method, "POST");
    assert.equal(
      options.headers.get("Authorization"),
      `Bearer ${credential}`
    );
    const body = JSON.parse(options.body);
    assert.equal(body.model, "deepseek-v4-flash");
    assert.equal(body.thinking.type, "disabled");
    assert.equal(body.max_tokens, 96);
    assert.equal(body.stream, false);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1));

    let response;
    if (current === 1) {
      response = jsonResponse(
        toolCallBody({
          calls: [
            {
              id: "synthetic-followup-single-id",
              type: "function",
              function: { name: "read_alpha", arguments: "{}" }
            }
          ]
        })
      );
    } else if (current === 2) {
      assert.equal(body.tool_choice, "none");
      assert.equal(
        body.messages.some(
          (message) =>
            message.role === "tool" &&
            message.tool_call_id === "synthetic-followup-single-id"
        ),
        true
      );
      response = jsonResponse(toolCallBody({ final: true }));
    } else if (current === 3) {
      response = jsonResponse(
        toolCallBody({
          calls: [
            {
              id: "synthetic-followup-multiple-id-1",
              type: "function",
              function: { name: "read_alpha", arguments: "{}" }
            },
            {
              id: "synthetic-followup-multiple-id-2",
              type: "function",
              function: { name: "read_beta", arguments: "{}" }
            }
          ]
        })
      );
    } else if (current === 4) {
      assert.equal(body.tool_choice, "none");
      assert.equal(
        body.messages.filter((message) => message.role === "tool").length,
        2
      );
      response = jsonResponse(toolCallBody({ final: true }));
    } else {
      throw new Error("Mock exceeded the four-request diagnostic plan.");
    }

    active -= 1;
    return response;
  };

  const result = await runSingleAndMultiToolFollowup({
    apiKey: credential,
    fetchImpl,
    timeoutMs: 5_000
  });
  const serialized = JSON.stringify(result);

  assert.equal(requestCount, 4);
  assert.equal(result.plannedRequestCount, 4);
  assert.equal(result.executedRequestCount, 4);
  assert.equal(result.skippedRequestCount, 0);
  assert.equal(result.caseCount, 4);
  assert.equal(result.allCaseExpectationsMet, true);
  assert.equal(result.genericRetries, 0);
  assert.equal(result.observedPeakConcurrency, 1);
  assert.equal(peak, 1);

  for (const forbidden of [
    credential,
    "synthetic-followup-single-id",
    "synthetic-followup-multiple-id",
    "ALPHA_OK",
    "BETA_OK",
    "Call the synthetic read_alpha",
    "Authorization"
  ]) {
    assert.equal(serialized.includes(forbidden), false, `Leaked: ${forbidden}`);
  }

  const safety = getFollowupSafetyState();
  assert.equal(safety.processAttempts, 4);
  assert.equal(safety.hardNetworkBudget, 4);
  assert.equal(safety.observedPeakConcurrency, 1);
  assert.equal(safety.started, true);
});

test("tool_choice defaults, explicit values, named form, and 128-tool limit validate", () => {
  assert.equal(normalizeToolChoice(undefined, { toolNames: [] }).kind, "none");
  assert.equal(
    normalizeToolChoice(undefined, { toolNames: ["lookup_inventory"] }).kind,
    "auto"
  );
  assert.equal(
    normalizeToolChoice("none", { toolNames: ["lookup_inventory"] }).kind,
    "none"
  );
  assert.equal(
    normalizeToolChoice("required", { toolNames: ["lookup_inventory"] }).kind,
    "required"
  );

  const named = normalizeToolChoice(
    { type: "function", function: { name: "lookup_inventory" } },
    { toolNames: ["lookup_inventory"] }
  );
  assert.equal(named.kind, "named");
  assert.equal(named.namedTool, "lookup_inventory");
  assert.throws(
    () =>
      normalizeToolChoice(
        { type: "function", function: { name: "not_registered" } },
        { toolNames: ["lookup_inventory"] }
      ),
    /allowlisted/
  );

  const maximum = Array.from({ length: 128 }, (_, index) => `tool_${index}`);
  assert.equal(
    normalizeToolChoice("auto", { toolNames: maximum }).kind,
    "auto"
  );
  assert.throws(
    () => normalizeToolChoice("auto", { toolNames: [...maximum, "tool_128"] }),
    /128/
  );
  assert.equal(toolChoiceContract.maximumTools, 128);
});

test("thinking and non-thinking tool_choice matrix contains all eight policies", () => {
  const matrix = buildToolChoiceMatrix({
    toolNames: ["lookup_inventory", "lookup_shipping"],
    namedTool: "lookup_inventory"
  });
  assert.equal(matrix.length, 8);
  assert.deepEqual(
    new Set(matrix.map((entry) => entry.thinking)),
    new Set(["enabled", "disabled"])
  );
  assert.deepEqual(
    new Set(matrix.map((entry) => entry.requested)),
    new Set(["none", "auto", "required", "named:lookup_inventory"])
  );
  assert.equal(
    validateObservedCalls(
      normalizeToolChoice("none", { toolNames: ["lookup_inventory"] }),
      [{ function: { name: "lookup_inventory" } }]
    ).code,
    "tool_choice_none_violation"
  );
  assert.equal(
    validateObservedCalls(
      normalizeToolChoice("required", { toolNames: ["lookup_inventory"] }),
      []
    ).code,
    "tool_choice_required_violation"
  );
});

test("valid strict Beta tool covers supported schema features", () => {
  const report = validateStrictToolDefinition(strictToolDefinition);
  assert.equal(report.valid, true);
  assert.equal(report.errorCount, 0);

  const schemaReport = validateStrictSchema(
    strictToolDefinition.function.parameters
  );
  assert.equal(schemaReport.valid, true);
});

test("strict preflight rejects documented invalid controls", () => {
  const missingAdditional = clone(strictToolDefinition);
  delete missingAdditional.function.parameters.additionalProperties;
  assert.ok(
    errorCodes(validateStrictToolDefinition(missingAdditional)).includes(
      "additionalProperties_must_be_false"
    )
  );

  const missingRequired = clone(strictToolDefinition);
  missingRequired.function.parameters.required =
    missingRequired.function.parameters.required.filter(
      (name) => name !== "priority"
    );
  assert.ok(
    errorCodes(validateStrictToolDefinition(missingRequired)).includes(
      "all_object_properties_must_be_required"
    )
  );

  for (const keyword of ["minLength", "maxLength"]) {
    const invalid = clone(strictToolDefinition);
    invalid.function.parameters.properties.customer_email[keyword] = 2;
    assert.ok(
      errorCodes(validateStrictToolDefinition(invalid)).includes(
        `unsupported_${keyword}`
      )
    );
  }

  for (const keyword of ["minItems", "maxItems"]) {
    const invalid = clone(strictToolDefinition);
    invalid.function.parameters.properties.lines[keyword] = 1;
    assert.ok(
      errorCodes(validateStrictToolDefinition(invalid)).includes(
        `unsupported_${keyword}`
      )
    );
  }

  const unresolved = clone(strictToolDefinition);
  unresolved.function.parameters.properties.lines.items.$ref =
    "#/$def/does_not_exist";
  assert.ok(
    errorCodes(validateStrictToolDefinition(unresolved)).includes(
      "unresolved_local_ref"
    )
  );

  const noStrict = clone(strictToolDefinition);
  noStrict.function.strict = false;
  assert.ok(
    errorCodes(validateStrictToolDefinition(noStrict)).includes(
      "strict_true_required"
    )
  );

  assert.ok(
    errorCodes(
      validateStrictToolDefinition(strictToolDefinition, {
        baseUrl: "https://api.deepseek.com"
      })
    ).includes("strict_mode_requires_beta_base_url")
  );
});

test("argument validator accepts a complete valid strict object", () => {
  const argumentText = JSON.stringify({
    customer_email: "synthetic@example.test",
    request_id: "550e8400-e29b-41d4-a716-446655440000",
    priority: "urgent",
    discount_percent: 10.5,
    lines: [{ sku: "SKU-101", quantity: 2 }],
    destination: "94105"
  });
  const compiled = compileArgumentsForLocalExecution(
    argumentText,
    strictToolDefinition.function.parameters
  );
  assert.equal(compiled.report.valid, true);
  assert.equal(compiled.value.priority, "urgent");
});

test("argument validator rejects parse, required, extra, enum, range, and format errors", () => {
  const malformed = validateArguments("{not json", inventorySchema);
  assert.equal(malformed.parsed, false);
  assert.equal(malformed.errors[0].code, "arguments_json_parse_failed");

  const missing = validateArguments(
    "{\"sku\":\"SKU-101\",\"warehouse\":\"west\"}",
    inventorySchema
  );
  assert.ok(errorCodes(missing).includes("required_property_missing"));

  const extra = validateArguments(
    "{\"sku\":\"SKU-101\",\"warehouse\":\"west\",\"quantity\":2,\"admin\":true}",
    inventorySchema
  );
  assert.ok(errorCodes(extra).includes("unexpected_property"));

  const invalidEnum = validateArguments(
    "{\"sku\":\"SKU-101\",\"warehouse\":\"north\",\"quantity\":2}",
    inventorySchema
  );
  assert.ok(errorCodes(invalidEnum).includes("enum_mismatch"));

  const invalidRange = validateArguments(
    "{\"sku\":\"SKU-101\",\"warehouse\":\"west\",\"quantity\":99}",
    inventorySchema
  );
  assert.ok(errorCodes(invalidRange).includes("above_maximum"));

  const invalidPattern = validateArguments(
    "{\"sku\":\"unsafe\",\"warehouse\":\"west\",\"quantity\":2}",
    inventorySchema
  );
  assert.ok(errorCodes(invalidPattern).includes("pattern_mismatch"));

  const formatSchema = {
    type: "object",
    properties: { email: { type: "string", format: "email" } },
    required: ["email"],
    additionalProperties: false
  };
  const invalidFormat = validateArguments("{\"email\":\"not-an-email\"}", formatSchema);
  assert.ok(errorCodes(invalidFormat).includes("format_mismatch"));
  assert.equal(JSON.stringify(invalidFormat).includes("not-an-email"), false);
});

test("replay preserves complete thinking content and exact call IDs internally", () => {
  const assistantMessage = thinkingMultiToolTurns[0].message;
  const toolMessages = assistantMessage.tool_calls.map((call) => ({
    role: "tool",
    tool_call_id: call.id,
    content: "{\"synthetic\":true}"
  }));
  const replay = buildToolReplay({
    assistantMessage,
    toolMessages,
    thinking: true
  });
  assert.equal(replay.valid, true);
  assert.equal(replay.audit.reasoningContentPreserved, true);
  assert.equal(replay.audit.toolIdsMatched, true);
  assert.equal(
    replay.internalMessages[0].reasoning_content,
    assistantMessage.reasoning_content
  );

  const mismatch = buildToolReplay({
    assistantMessage,
    toolMessages: [
      { role: "tool", tool_call_id: "wrong", content: "{}" }
    ],
    thinking: true
  });
  assert.equal(mismatch.code, "tool_call_id_mismatch");
});

test("non-thinking single-call orchestration completes safely", async () => {
  const registry = createLocalToolRegistry(createSyntheticRegistryDefinitions());
  const result = await runScriptedOrchestration({
    turns: nonThinkingSingleCallTurns,
    registry,
    thinking: false,
    maxIterations: 4
  });
  assert.equal(result.completed, true);
  assert.equal(result.stopCode, "final_answer");
  assert.equal(result.toolExecutions.length, 1);
  assert.equal(result.toolExecutions[0].toolName, "lookup_inventory");
  assert.equal(result.replayAudits[0].reasoningContentPreserved, true);
  assert.equal(Object.hasOwn(result, "messages"), false);
});

test("thinking multi-tool and multi-turn orchestration preserves replay", async () => {
  const registry = createLocalToolRegistry(createSyntheticRegistryDefinitions());
  const result = await runScriptedOrchestration({
    turns: thinkingMultiToolTurns,
    registry,
    thinking: true,
    maxIterations: 6
  });
  assert.equal(result.completed, true);
  assert.equal(result.iterationsProcessed, 3);
  assert.equal(result.toolExecutions.length, 3);
  assert.deepEqual(
    result.toolExecutions.map((entry) => entry.toolName),
    ["lookup_inventory", "lookup_shipping", "compute_total"]
  );
  assert.equal(result.replayAudits.length, 2);
  assert.ok(
    result.replayAudits.every(
      (audit) => audit.reasoningContentPreserved && audit.toolIdsMatched
    )
  );
  assert.equal(JSON.stringify(result).includes("Synthetic planning trace"), false);
  assert.equal(JSON.stringify(result).includes("synthetic-call-multi"), false);
});

test("missing thinking reasoning_content stops before tool execution", async () => {
  const registry = createLocalToolRegistry(createSyntheticRegistryDefinitions());
  const result = await runScriptedOrchestration({
    turns: withMissingReasoning(),
    registry,
    thinking: true
  });
  assert.equal(result.completed, false);
  assert.equal(result.stopCode, "reasoning_content_required");
  assert.equal(result.toolExecutions.length, 0);
});

test("unknown tool and duplicate call IDs are rejected", async () => {
  const registry = createLocalToolRegistry(createSyntheticRegistryDefinitions());
  const unknown = await runScriptedOrchestration({
    turns: withUnknownTool(),
    registry,
    thinking: false
  });
  assert.equal(unknown.stopCode, "unknown_tool");
  assert.equal(unknown.toolExecutions.length, 0);

  const duplicate = await runScriptedOrchestration({
    turns: withDuplicateCallId(),
    registry,
    thinking: true
  });
  assert.equal(duplicate.stopCode, "duplicate_tool_call_id");
  assert.equal(duplicate.toolExecutions.length, 2);
});

test("maximum-iteration guard stops a scripted endless loop", async () => {
  const registry = createLocalToolRegistry(createSyntheticRegistryDefinitions());
  const result = await runScriptedOrchestration({
    turns: endlessToolTurns(5),
    registry,
    thinking: false,
    maxIterations: 2
  });
  assert.equal(result.completed, false);
  assert.equal(result.stopCode, "max_iterations");
  assert.equal(result.toolExecutions.length, 2);
  assert.equal(result.iterationsProcessed, 2);
});

test("token and timing summary is deterministic", () => {
  const summary = summarizeTurns(thinkingMultiToolTurns);
  assert.deepEqual(summary.usage, {
    promptTokens: 430,
    completionTokens: 74,
    totalTokens: 504,
    promptCacheHitTokens: 130,
    promptCacheMissTokens: 300
  });
  assert.deepEqual(summary.timingMs, {
    sampleCount: 3,
    min: 100,
    median: 200,
    p95: 300,
    max: 300,
    mean: 200
  });
});

test("redaction and static secret scanning protect public evidence", async () => {
  const keyLike = "sk-" + "Q".repeat(32);
  const source = {
    apiKey: keyLike,
    authorization: `Bearer ${keyLike}`,
    reasoning_content: "private trace",
    arguments: "{\"password\":\"private\"}",
    tool_result: { content: "private tool output" },
    safe: { passed: true }
  };
  const sanitized = sanitizeForPublic(source);
  const serialized = JSON.stringify(sanitized);
  assert.equal(serialized.includes(keyLike), false);
  assert.equal(serialized.includes("private trace"), false);
  assert.equal(serialized.includes("private tool output"), false);
  assert.equal(sanitized.safe.passed, true);

  const findings = scanText(`leak="${keyLike}"\nAuthorization: Bearer ${keyLike}`);
  assert.ok(findings.length >= 2);
  assert.equal(JSON.stringify(findings).includes(keyLike), false);
  assert.deepEqual(
    scanText('api_key=os.environ["DEEPSEEK_API_KEY"]'),
    []
  );

  const publicFiles = [
    "README.md",
    "TEST_PLAN.md",
    "SECURITY.md",
    "official-sources.md",
    "src/env-guard.mjs",
    "src/live-runner.mjs",
    "src/live-followup.mjs",
    "src/tool-choice.mjs",
    "src/strict-schema.mjs",
    "src/argument-validator.mjs",
    "src/replay.mjs",
    "src/summarize.mjs",
    "src/redact.mjs",
    "src/orchestrator.mjs",
    "fixtures/scenarios.mjs"
  ].map((file) => resolve(suiteDirectory, file));
  assert.deepEqual(await scanFiles(publicFiles), []);
});
