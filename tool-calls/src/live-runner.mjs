import { acceptInMemoryCredential } from "./env-guard.mjs";
import { compileArgumentsForLocalExecution } from "./argument-validator.mjs";
import { sanitizeForPublic } from "./redact.mjs";
import {
  createSyntheticRegistryDefinitions,
  strictToolDefinition
} from "../fixtures/scenarios.mjs";

const STANDARD_URL = "https://api.deepseek.com/chat/completions";
const BETA_URL = "https://api.deepseek.com/beta/chat/completions";
const ALLOWED_URLS = new Set([STANDARD_URL, BETA_URL]);
const MODELS = Object.freeze(["deepseek-v4-flash", "deepseek-v4-pro"]);
const THINKING_MODES = Object.freeze(["disabled", "enabled"]);
const CHOICE_LABELS = Object.freeze(["none", "auto", "required", "named"]);
const MAX_NETWORK_REQUESTS_PER_PROCESS = 30;
const PLANNED_REQUESTS = 30;
const MAX_TOKENS_PER_REQUEST = 96;
const MAX_TIMEOUT_MS = 60_000;
const MIN_TIMEOUT_MS = 1_000;

let serialTail = Promise.resolve();
let networkInFlight = 0;
let observedPeakConcurrency = 0;
let processNetworkAttempts = 0;

const inventoryTool = Object.freeze({
  type: "function",
  function: Object.freeze({
    name: "lookup_inventory",
    description: "Read synthetic inventory availability for a synthetic SKU.",
    parameters: Object.freeze({
      type: "object",
      properties: Object.freeze({
        sku: Object.freeze({ type: "string", pattern: "^SKU-[0-9]{3}$" }),
        warehouse: Object.freeze({
          type: "string",
          enum: Object.freeze(["west", "east"])
        }),
        quantity: Object.freeze({
          type: "integer",
          minimum: 1,
          maximum: 20
        })
      }),
      required: Object.freeze(["sku", "warehouse", "quantity"]),
      additionalProperties: false
    })
  })
});

const shippingTool = Object.freeze({
  type: "function",
  function: Object.freeze({
    name: "lookup_shipping",
    description: "Read a synthetic shipping estimate for a synthetic postal code.",
    parameters: Object.freeze({
      type: "object",
      properties: Object.freeze({
        postal_code: Object.freeze({
          type: "string",
          pattern: "^[0-9]{5}$"
        }),
        service: Object.freeze({
          type: "string",
          enum: Object.freeze(["ground", "express"])
        })
      }),
      required: Object.freeze(["postal_code", "service"]),
      additionalProperties: false
    })
  })
});

const publicPlan = [];
for (const model of MODELS) {
  for (const choice of [
    "omitted-no-tools",
    "omitted-tools",
    "none",
    "auto",
    "required",
    "named"
  ]) {
    publicPlan.push(
      Object.freeze({
        caseId: `choice-${model.replace("deepseek-v4-", "")}-disabled-${choice}`,
        group: "tool_choice_matrix",
        route: "standard",
        model,
        thinking: "disabled",
        toolChoice: choice,
        stream: false,
        maxTokens: 48,
        plannedRequests: 1
      })
    );
  }
  for (const choice of ["required", "named"]) {
    publicPlan.push(
      Object.freeze({
        caseId: `choice-${model.replace("deepseek-v4-", "")}-enabled-${choice}`,
        group: "tool_choice_matrix",
        route: "standard",
        model,
        thinking: "enabled",
        toolChoice: choice,
        stream: false,
        maxTokens: 48,
        plannedRequests: 1
      })
    );
  }
}
publicPlan.push(
  Object.freeze({
    caseId: "single-call-initial",
    group: "single_tool_loop",
    route: "standard",
    model: "deepseek-v4-flash",
    thinking: "disabled",
    toolChoice: "named",
    stream: false,
    maxTokens: 64,
    plannedRequests: 1
  }),
  Object.freeze({
    caseId: "single-call-final",
    group: "single_tool_loop",
    route: "standard",
    model: "deepseek-v4-flash",
    thinking: "disabled",
    toolChoice: "none",
    stream: false,
    maxTokens: 64,
    plannedRequests: 1
  }),
  Object.freeze({
    caseId: "multiple-call-initial",
    group: "multiple_tool_loop",
    route: "standard",
    model: "deepseek-v4-pro",
    thinking: "disabled",
    toolChoice: "required",
    stream: false,
    maxTokens: 96,
    plannedRequests: 1
  }),
  Object.freeze({
    caseId: "multiple-call-final",
    group: "multiple_tool_loop",
    route: "standard",
    model: "deepseek-v4-pro",
    thinking: "disabled",
    toolChoice: "none",
    stream: false,
    maxTokens: 64,
    plannedRequests: 1
  }),
  Object.freeze({
    caseId: "strict-beta-valid",
    group: "strict_beta",
    route: "beta",
    model: "deepseek-v4-flash",
    thinking: "disabled",
    toolChoice: "named",
    stream: false,
    maxTokens: 64,
    plannedRequests: 1
  }),
  Object.freeze({
    caseId: "strict-beta-invalid-control",
    group: "strict_beta",
    route: "beta",
    model: "deepseek-v4-flash",
    thinking: "disabled",
    toolChoice: "named",
    stream: false,
    maxTokens: 64,
    plannedRequests: 1,
    expectedControl: "client_error"
  }),
  Object.freeze({
    caseId: "strict-standard-route-control",
    group: "strict_beta",
    route: "standard",
    model: "deepseek-v4-flash",
    thinking: "disabled",
    toolChoice: "named",
    stream: false,
    maxTokens: 64,
    plannedRequests: 1,
    expectedControl: "client_error"
  }),
  Object.freeze({
    caseId: "strict-beta-missing-required-control",
    group: "strict_beta",
    route: "beta",
    model: "deepseek-v4-flash",
    thinking: "disabled",
    toolChoice: "named",
    stream: false,
    maxTokens: 64,
    plannedRequests: 1,
    expectedControl: "client_error"
  }),
  Object.freeze({
    caseId: "strict-beta-minLength-control",
    group: "strict_beta",
    route: "beta",
    model: "deepseek-v4-flash",
    thinking: "disabled",
    toolChoice: "named",
    stream: false,
    maxTokens: 64,
    plannedRequests: 1,
    expectedControl: "client_error"
  }),
  Object.freeze({
    caseId: "thinking-replay-initial",
    group: "thinking_replay",
    route: "standard",
    model: "deepseek-v4-pro",
    thinking: "enabled",
    toolChoice: "auto",
    stream: false,
    maxTokens: 96,
    plannedRequests: 1
  }),
  Object.freeze({
    caseId: "thinking-replay-full",
    group: "thinking_replay",
    route: "standard",
    model: "deepseek-v4-pro",
    thinking: "enabled",
    toolChoice: "none",
    stream: false,
    maxTokens: 64,
    plannedRequests: 1
  }),
  Object.freeze({
    caseId: "thinking-replay-missing-control",
    group: "thinking_replay",
    route: "standard",
    model: "deepseek-v4-pro",
    thinking: "enabled",
    toolChoice: "none",
    stream: false,
    maxTokens: 64,
    plannedRequests: 1,
    expectedControl: "http_400"
  }),
  Object.freeze({
    caseId: "stream-flash-disabled",
    group: "streaming_assembly",
    route: "standard",
    model: "deepseek-v4-flash",
    thinking: "disabled",
    toolChoice: "named",
    stream: true,
    maxTokens: 96,
    plannedRequests: 1
  }),
  Object.freeze({
    caseId: "stream-pro-enabled",
    group: "streaming_assembly",
    route: "standard",
    model: "deepseek-v4-pro",
    thinking: "enabled",
    toolChoice: "auto",
    stream: true,
    maxTokens: 96,
    plannedRequests: 1
  })
);

if (
  publicPlan.length !== PLANNED_REQUESTS ||
  publicPlan.some((entry) => entry.maxTokens > MAX_TOKENS_PER_REQUEST)
) {
  throw new Error("Live plan violates its static request or token budget.");
}

function enqueueNetwork(task) {
  const execute = async () => {
    if (processNetworkAttempts >= MAX_NETWORK_REQUESTS_PER_PROCESS) {
      throw new Error("The process-wide live network budget is exhausted.");
    }
    processNetworkAttempts += 1;
    networkInFlight += 1;
    observedPeakConcurrency = Math.max(observedPeakConcurrency, networkInFlight);
    if (networkInFlight > 1) {
      networkInFlight -= 1;
      throw new Error("The live concurrency guard was exceeded.");
    }
    try {
      return await task();
    } finally {
      networkInFlight -= 1;
    }
  };
  const result = serialTail.then(execute, execute);
  serialTail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function urlForRoute(route) {
  const url = route === "beta" ? BETA_URL : STANDARD_URL;
  if (!ALLOWED_URLS.has(url)) {
    throw new Error("Request URL is outside the fixed allowlist.");
  }
  return url;
}

function statusClass(status) {
  if (status >= 200 && status <= 299) return "success";
  if (status === 400) return "bad_request";
  if (status === 401 || status === 403) return "auth_rejected";
  if (status === 402) return "insufficient_balance";
  if (status === 429) return "rate_limited";
  if (status >= 500 && status <= 599) return "provider_error";
  return "unexpected_status";
}

function safeNumber(value) {
  return Number.isFinite(value) && value >= 0 ? Number(value) : null;
}

function choicePayload(label) {
  if (label === "omitted-no-tools" || label === "omitted-tools") {
    return undefined;
  }
  if (label === "named") {
    return {
      type: "function",
      function: { name: "lookup_inventory" }
    };
  }
  return label;
}

function thinkingPayload(mode) {
  return { type: mode };
}

function matrixPrompt(choice) {
  if (choice === "none" || choice === "omitted-no-tools") {
    return "Reply with the synthetic word READY. Do not call a tool.";
  }
  return "Use the provided read-only tool to check 2 units of synthetic SKU-101 in the west warehouse.";
}

function usageFields(usage) {
  return {
    promptTokens: safeNumber(usage?.prompt_tokens),
    completionTokens: safeNumber(usage?.completion_tokens),
    totalTokens: safeNumber(usage?.total_tokens),
    promptCacheHitTokens: safeNumber(usage?.prompt_cache_hit_tokens),
    promptCacheMissTokens: safeNumber(usage?.prompt_cache_miss_tokens)
  };
}

function analyzeAssistantMessage(body, { expectedToolNames }) {
  const choice = Array.isArray(body?.choices) ? body.choices[0] : null;
  const message = choice?.message;
  const rawCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  const ids = new Set();
  let callShapeValid = true;
  let toolNameMatch = true;
  let argumentsParsed = true;
  let argumentsValid = true;

  for (const call of rawCalls) {
    if (
      typeof call?.id !== "string" ||
      call.type !== "function" ||
      typeof call.function?.name !== "string" ||
      typeof call.function?.arguments !== "string"
    ) {
      callShapeValid = false;
      continue;
    }
    ids.add(call.id);
    const expectedTool = expectedToolNames.get(call.function.name);
    if (!expectedTool) {
      toolNameMatch = false;
      argumentsValid = false;
      continue;
    }
    const compiled = compileArgumentsForLocalExecution(
      call.function.arguments,
      expectedTool.function.parameters
    );
    argumentsParsed &&= compiled.report.parsed;
    argumentsValid &&= compiled.report.valid;
  }

  const internal =
    isRecord(message) && callShapeValid
      ? {
          assistantMessage: structuredClone(message),
          rawCalls: structuredClone(rawCalls)
        }
      : null;
  const content = typeof message?.content === "string" ? message.content : "";

  return {
    public: {
      responseObjectValid: Boolean(choice && isRecord(message)),
      finishReason:
        typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
      contentNonEmpty: content.trim().length > 0,
      toolCallCount: rawCalls.length,
      uniqueToolCallIdCount: ids.size,
      toolCallShapeValid: callShapeValid,
      toolNameMatch,
      argumentsParsed,
      argumentsValid,
      reasoningPresent:
        typeof message?.reasoning_content === "string" &&
        message.reasoning_content.length > 0,
      ...usageFields(body?.usage)
    },
    internal
  };
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectedForCase(meta, observation) {
  if (meta.expectedControl === "client_error") {
    return observation.status >= 400 && observation.status <= 499;
  }
  if (meta.expectedControl === "http_400") {
    return observation.status === 400;
  }
  if (observation.status < 200 || observation.status > 299) return false;
  if (meta.group === "tool_choice_matrix") {
    if (meta.toolChoice === "none" || meta.toolChoice === "omitted-no-tools") {
      return observation.toolCallCount === 0;
    }
    if (meta.toolChoice === "required" || meta.toolChoice === "named") {
      return observation.toolCallCount >= 1 && observation.argumentsValid;
    }
    return true;
  }
  if (
    meta.caseId.endsWith("-initial") ||
    meta.caseId === "strict-beta-valid"
  ) {
    return observation.toolCallCount >= 1 && observation.argumentsValid;
  }
  if (meta.group === "streaming_assembly") {
    return (
      observation.doneSeen &&
      observation.toolCallCount >= 1 &&
      observation.argumentsValid
    );
  }
  return observation.contentNonEmpty;
}

function skippedCase(meta, code) {
  return sanitizeForPublic({
    caseId: meta.caseId,
    group: meta.group,
    model: meta.model,
    thinking: meta.thinking,
    toolChoice: meta.toolChoice,
    route: meta.route,
    stream: meta.stream,
    maxTokens: meta.maxTokens,
    requestIssued: false,
    status: null,
    statusClass: "skipped",
    expectationMet: false,
    skipCode: code
  });
}

async function executeLocalCalls(internal, registry) {
  if (!internal || !Array.isArray(internal.rawCalls)) {
    return { valid: false, code: "assistant_tool_calls_unavailable", toolMessages: [] };
  }
  const seen = new Set();
  const toolMessages = [];
  for (const call of internal.rawCalls) {
    if (seen.has(call.id)) {
      return { valid: false, code: "duplicate_tool_call_id", toolMessages: [] };
    }
    seen.add(call.id);
    const definition = registry.get(call.function.name);
    if (!definition) {
      return { valid: false, code: "unknown_tool", toolMessages: [] };
    }
    const compiled = compileArgumentsForLocalExecution(
      call.function.arguments,
      definition.parameters
    );
    if (!compiled.report.valid) {
      return { valid: false, code: "invalid_tool_arguments", toolMessages: [] };
    }
    let result;
    try {
      result = await definition.execute(structuredClone(compiled.value));
    } catch {
      return { valid: false, code: "tool_execution_failed", toolMessages: [] };
    }
    toolMessages.push({
      role: "tool",
      tool_call_id: call.id,
      content: JSON.stringify(result)
    });
  }
  return { valid: true, code: null, toolMessages };
}

function createRegistry() {
  return new Map(
    createSyntheticRegistryDefinitions().map((definition) => [
      definition.name,
      definition
    ])
  );
}

function makeBody(meta, { messages, tools, toolChoice } = {}) {
  const body = {
    model: meta.model,
    messages,
    tools,
    thinking: thinkingPayload(meta.thinking),
    max_tokens: meta.maxTokens,
    temperature: 0,
    stream: meta.stream
  };
  const selectedToolChoice =
    toolChoice === undefined ? choicePayload(meta.toolChoice) : toolChoice;
  if (selectedToolChoice !== undefined) {
    body.tool_choice = selectedToolChoice;
  }
  if (meta.thinking === "enabled") {
    body.reasoning_effort = "high";
  }
  if (meta.stream) {
    body.stream_options = { include_usage: true };
  }
  if (
    !Number.isInteger(body.max_tokens) ||
    body.max_tokens < 1 ||
    body.max_tokens > MAX_TOKENS_PER_REQUEST
  ) {
    throw new Error("Request max_tokens exceeds the hard live limit.");
  }
  return body;
}

async function performJsonRequest({
  meta,
  body,
  credential,
  fetchImpl,
  timeoutMs,
  expectedTools
}) {
  const url = urlForRoute(meta.route);
  return enqueueNetwork(async () => {
    const started = performance.now();
    const headers = new Headers({
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${credential}`
    });
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs)
      });
      const elapsedMs = Math.round(performance.now() - started);
      const base = {
        caseId: meta.caseId,
        group: meta.group,
        model: meta.model,
        thinking: meta.thinking,
        toolChoice: meta.toolChoice,
        route: meta.route,
        stream: false,
        maxTokens: meta.maxTokens,
        requestIssued: true,
        status: response.status,
        statusClass: statusClass(response.status),
        elapsedMs,
        expectedControl: meta.expectedControl ?? null
      };

      if (!response.ok) {
        if (response.body) await response.body.cancel();
        const publicResult = {
          ...base,
          expectationMet: expectedForCase(meta, {
            status: response.status,
            contentNonEmpty: false,
            toolCallCount: 0
          })
        };
        return { publicResult: sanitizeForPublic(publicResult), internal: null };
      }

      let parsed = null;
      try {
        parsed = await response.json();
      } catch {
        parsed = null;
      }
      const analysis = analyzeAssistantMessage(parsed, {
        expectedToolNames: expectedTools
      });
      parsed = null;
      const observation = {
        ...base,
        ...analysis.public
      };
      observation.expectationMet = expectedForCase(meta, observation);
      return {
        publicResult: sanitizeForPublic(observation),
        internal: analysis.internal
      };
    } catch {
      const elapsedMs = Math.round(performance.now() - started);
      return {
        publicResult: sanitizeForPublic({
          caseId: meta.caseId,
          group: meta.group,
          model: meta.model,
          thinking: meta.thinking,
          toolChoice: meta.toolChoice,
          route: meta.route,
          stream: false,
          maxTokens: meta.maxTokens,
          requestIssued: true,
          status: null,
          statusClass: "transport_error",
          elapsedMs,
          expectationMet: false
        }),
        internal: null
      };
    }
  });
}

function assembleSse(text, expectedTools) {
  const calls = new Map();
  let eventCount = 0;
  let parsedEventCount = 0;
  let doneSeen = false;
  let reasoningCharacterCount = 0;
  let usage = null;
  let finishReason = null;

  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    eventCount += 1;
    const data = line.slice(5).trim();
    if (data === "[DONE]") {
      doneSeen = true;
      continue;
    }
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      continue;
    }
    parsedEventCount += 1;
    if (event?.usage) usage = event.usage;
    const choice = Array.isArray(event?.choices) ? event.choices[0] : null;
    if (typeof choice?.finish_reason === "string") {
      finishReason = choice.finish_reason;
    }
    const delta = choice?.delta;
    if (typeof delta?.reasoning_content === "string") {
      reasoningCharacterCount += delta.reasoning_content.length;
    }
    for (const fragment of Array.isArray(delta?.tool_calls) ? delta.tool_calls : []) {
      const index = Number.isInteger(fragment.index) ? fragment.index : 0;
      const current = calls.get(index) ?? {
        id: "",
        type: "",
        name: "",
        arguments: ""
      };
      if (typeof fragment.id === "string") current.id += fragment.id;
      if (typeof fragment.type === "string") current.type += fragment.type;
      if (typeof fragment.function?.name === "string") {
        current.name += fragment.function.name;
      }
      if (typeof fragment.function?.arguments === "string") {
        current.arguments += fragment.function.arguments;
      }
      calls.set(index, current);
    }
  }

  let toolNameMatch = true;
  let argumentsParsed = true;
  let argumentsValid = true;
  const ids = new Set();
  for (const call of calls.values()) {
    if (call.id) ids.add(call.id);
    const expectedTool = expectedTools.get(call.name);
    if (!expectedTool) {
      toolNameMatch = false;
      argumentsValid = false;
      continue;
    }
    const compiled = compileArgumentsForLocalExecution(
      call.arguments,
      expectedTool.function.parameters
    );
    argumentsParsed &&= compiled.report.parsed;
    argumentsValid &&= compiled.report.valid;
  }

  return {
    eventCount,
    parsedEventCount,
    doneSeen,
    reasoningCharacterCount,
    finishReason,
    toolCallCount: calls.size,
    uniqueToolCallIdCount: ids.size,
    toolNameMatch,
    argumentsParsed,
    argumentsValid,
    ...usageFields(usage)
  };
}

async function performStreamRequest({
  meta,
  body,
  credential,
  fetchImpl,
  timeoutMs,
  expectedTools
}) {
  const url = urlForRoute(meta.route);
  return enqueueNetwork(async () => {
    const started = performance.now();
    const headers = new Headers({
      Accept: "text/event-stream",
      "Content-Type": "application/json",
      Authorization: `Bearer ${credential}`
    });
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs)
      });
      const elapsedMs = Math.round(performance.now() - started);
      if (!response.ok) {
        if (response.body) await response.body.cancel();
        return sanitizeForPublic({
          caseId: meta.caseId,
          group: meta.group,
          model: meta.model,
          thinking: meta.thinking,
          toolChoice: meta.toolChoice,
          route: meta.route,
          stream: true,
          maxTokens: meta.maxTokens,
          requestIssued: true,
          status: response.status,
          statusClass: statusClass(response.status),
          elapsedMs,
          expectationMet: false
        });
      }

      let rawText = await response.text();
      const assembled = assembleSse(rawText, expectedTools);
      rawText = null;
      const observation = {
        caseId: meta.caseId,
        group: meta.group,
        model: meta.model,
        thinking: meta.thinking,
        toolChoice: meta.toolChoice,
        route: meta.route,
        stream: true,
        maxTokens: meta.maxTokens,
        requestIssued: true,
        status: response.status,
        statusClass: statusClass(response.status),
        elapsedMs,
        ...assembled
      };
      observation.expectationMet = expectedForCase(meta, observation);
      return sanitizeForPublic(observation);
    } catch {
      return sanitizeForPublic({
        caseId: meta.caseId,
        group: meta.group,
        model: meta.model,
        thinking: meta.thinking,
        toolChoice: meta.toolChoice,
        route: meta.route,
        stream: true,
        maxTokens: meta.maxTokens,
        requestIssued: true,
        status: null,
        statusClass: "transport_error",
        elapsedMs: Math.round(performance.now() - started),
        expectationMet: false
      });
    }
  });
}

function toolsMap(tools) {
  return new Map(tools.map((tool) => [tool.function.name, tool]));
}

function findMeta(caseId) {
  const meta = publicPlan.find((entry) => entry.caseId === caseId);
  if (!meta) throw new Error(`Unknown static live case: ${caseId}`);
  return meta;
}

export async function runBoundedLiveSuite({
  apiKey,
  fetchImpl = globalThis.fetch,
  timeoutMs = 45_000
}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch-compatible function is required.");
  }
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < MIN_TIMEOUT_MS ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new Error(`timeoutMs must be between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}.`);
  }
  if (
    processNetworkAttempts + PLANNED_REQUESTS >
    MAX_NETWORK_REQUESTS_PER_PROCESS
  ) {
    throw new Error("Insufficient process-wide network budget for the complete live plan.");
  }

  let credential = acceptInMemoryCredential(apiKey, { provenance: "memory" });
  const processAttemptsBefore = processNetworkAttempts;
  const cases = [];
  const registry = createRegistry();
  const standardTools = [inventoryTool, shippingTool];
  const standardToolMap = toolsMap(standardTools);
  const inventoryOnly = [inventoryTool];
  const inventoryOnlyMap = toolsMap(inventoryOnly);

  try {
    for (const meta of publicPlan.filter((entry) => entry.group === "tool_choice_matrix")) {
      const matrixTools =
        meta.toolChoice === "omitted-no-tools" ? undefined : inventoryOnly;
      const body = makeBody(meta, {
        messages: [{ role: "user", content: matrixPrompt(meta.toolChoice) }],
        tools: matrixTools
      });
      const outcome = await performJsonRequest({
        meta,
        body,
        credential,
        fetchImpl,
        timeoutMs,
        expectedTools: inventoryOnlyMap
      });
      cases.push(outcome.publicResult);
    }

    const singleInitialMeta = findMeta("single-call-initial");
    const singleUser = {
      role: "user",
      content: "Check 2 units of synthetic SKU-101 in the west warehouse."
    };
    const singleInitial = await performJsonRequest({
      meta: singleInitialMeta,
      body: makeBody(singleInitialMeta, {
        messages: [singleUser],
        tools: inventoryOnly
      }),
      credential,
      fetchImpl,
      timeoutMs,
      expectedTools: inventoryOnlyMap
    });
    cases.push(singleInitial.publicResult);
    const singleExecution = await executeLocalCalls(singleInitial.internal, registry);
    const singleFinalMeta = findMeta("single-call-final");
    if (singleExecution.valid) {
      const outcome = await performJsonRequest({
        meta: singleFinalMeta,
        body: makeBody(singleFinalMeta, {
          messages: [
            singleUser,
            singleInitial.internal.assistantMessage,
            ...singleExecution.toolMessages
          ],
          tools: inventoryOnly,
          toolChoice: "none"
        }),
        credential,
        fetchImpl,
        timeoutMs,
        expectedTools: inventoryOnlyMap
      });
      cases.push(outcome.publicResult);
    } else {
      cases.push(skippedCase(singleFinalMeta, singleExecution.code));
    }

    const multipleInitialMeta = findMeta("multiple-call-initial");
    const multipleUser = {
      role: "user",
      content:
        "Check synthetic SKU-202 in the east warehouse and get an express estimate for synthetic postal code 94105."
    };
    const multipleInitial = await performJsonRequest({
      meta: multipleInitialMeta,
      body: makeBody(multipleInitialMeta, {
        messages: [multipleUser],
        tools: standardTools,
        toolChoice: "required"
      }),
      credential,
      fetchImpl,
      timeoutMs,
      expectedTools: standardToolMap
    });
    cases.push(multipleInitial.publicResult);
    const multipleExecution = await executeLocalCalls(multipleInitial.internal, registry);
    const multipleFinalMeta = findMeta("multiple-call-final");
    if (multipleExecution.valid) {
      const outcome = await performJsonRequest({
        meta: multipleFinalMeta,
        body: makeBody(multipleFinalMeta, {
          messages: [
            multipleUser,
            multipleInitial.internal.assistantMessage,
            ...multipleExecution.toolMessages
          ],
          tools: standardTools,
          toolChoice: "none"
        }),
        credential,
        fetchImpl,
        timeoutMs,
        expectedTools: standardToolMap
      });
      cases.push(outcome.publicResult);
    } else {
      cases.push(skippedCase(multipleFinalMeta, multipleExecution.code));
    }

    const strictValidMeta = findMeta("strict-beta-valid");
    const strictValidTools = [structuredClone(strictToolDefinition)];
    const strictValid = await performJsonRequest({
      meta: strictValidMeta,
      body: makeBody(strictValidMeta, {
        messages: [
          {
            role: "user",
            content:
              "Prepare a synthetic quote with one synthetic line and no external action."
          }
        ],
        tools: strictValidTools,
        toolChoice: {
          type: "function",
          function: { name: "prepare_quote" }
        }
      }),
      credential,
      fetchImpl,
      timeoutMs,
      expectedTools: toolsMap(strictValidTools)
    });
    cases.push(strictValid.publicResult);

    const strictInvalidMeta = findMeta("strict-beta-invalid-control");
    const invalidStrictTool = structuredClone(strictToolDefinition);
    delete invalidStrictTool.function.parameters.additionalProperties;
    const strictInvalid = await performJsonRequest({
      meta: strictInvalidMeta,
      body: makeBody(strictInvalidMeta, {
        messages: [
          {
            role: "user",
            content: "Validate a deliberately invalid synthetic strict schema."
          }
        ],
        tools: [invalidStrictTool],
        toolChoice: {
          type: "function",
          function: { name: "prepare_quote" }
        }
      }),
      credential,
      fetchImpl,
      timeoutMs,
      expectedTools: toolsMap([invalidStrictTool])
    });
    cases.push(strictInvalid.publicResult);

    const strictStandardMeta = findMeta("strict-standard-route-control");
    const strictStandard = await performJsonRequest({
      meta: strictStandardMeta,
      body: makeBody(strictStandardMeta, {
        messages: [
          {
            role: "user",
            content: "Check strict mode on the deliberately non-Beta route."
          }
        ],
        tools: strictValidTools,
        toolChoice: {
          type: "function",
          function: { name: "prepare_quote" }
        }
      }),
      credential,
      fetchImpl,
      timeoutMs,
      expectedTools: toolsMap(strictValidTools)
    });
    cases.push(strictStandard.publicResult);

    const missingRequiredMeta = findMeta(
      "strict-beta-missing-required-control"
    );
    const missingRequiredTool = structuredClone(strictToolDefinition);
    missingRequiredTool.function.parameters.required =
      missingRequiredTool.function.parameters.required.filter(
        (name) => name !== "priority"
      );
    const missingRequired = await performJsonRequest({
      meta: missingRequiredMeta,
      body: makeBody(missingRequiredMeta, {
        messages: [
          {
            role: "user",
            content: "Validate a strict schema with one property omitted from required."
          }
        ],
        tools: [missingRequiredTool],
        toolChoice: {
          type: "function",
          function: { name: "prepare_quote" }
        }
      }),
      credential,
      fetchImpl,
      timeoutMs,
      expectedTools: toolsMap([missingRequiredTool])
    });
    cases.push(missingRequired.publicResult);

    const minLengthMeta = findMeta("strict-beta-minLength-control");
    const minLengthTool = structuredClone(strictToolDefinition);
    minLengthTool.function.parameters.properties.customer_email.minLength = 3;
    const minLength = await performJsonRequest({
      meta: minLengthMeta,
      body: makeBody(minLengthMeta, {
        messages: [
          {
            role: "user",
            content: "Validate a strict schema with the unsupported minLength keyword."
          }
        ],
        tools: [minLengthTool],
        toolChoice: {
          type: "function",
          function: { name: "prepare_quote" }
        }
      }),
      credential,
      fetchImpl,
      timeoutMs,
      expectedTools: toolsMap([minLengthTool])
    });
    cases.push(minLength.publicResult);

    const thinkingInitialMeta = findMeta("thinking-replay-initial");
    const thinkingUser = {
      role: "user",
      content: "Check 3 units of synthetic SKU-303 in the west warehouse."
    };
    const thinkingInitial = await performJsonRequest({
      meta: thinkingInitialMeta,
      body: makeBody(thinkingInitialMeta, {
        messages: [thinkingUser],
        tools: inventoryOnly
      }),
      credential,
      fetchImpl,
      timeoutMs,
      expectedTools: inventoryOnlyMap
    });
    cases.push(thinkingInitial.publicResult);
    const thinkingExecution = await executeLocalCalls(thinkingInitial.internal, registry);
    const fullMeta = findMeta("thinking-replay-full");
    const missingMeta = findMeta("thinking-replay-missing-control");
    if (
      thinkingExecution.valid &&
      typeof thinkingInitial.internal?.assistantMessage?.reasoning_content === "string"
    ) {
      const fullMessages = [
        thinkingUser,
        thinkingInitial.internal.assistantMessage,
        ...thinkingExecution.toolMessages
      ];
      const full = await performJsonRequest({
        meta: fullMeta,
        body: makeBody(fullMeta, {
          messages: fullMessages,
          tools: inventoryOnly,
          toolChoice: "none"
        }),
        credential,
        fetchImpl,
        timeoutMs,
        expectedTools: inventoryOnlyMap
      });
      cases.push(full.publicResult);

      const strippedAssistant = structuredClone(
        thinkingInitial.internal.assistantMessage
      );
      delete strippedAssistant.reasoning_content;
      const missing = await performJsonRequest({
        meta: missingMeta,
        body: makeBody(missingMeta, {
          messages: [
            thinkingUser,
            strippedAssistant,
            ...thinkingExecution.toolMessages
          ],
          tools: inventoryOnly,
          toolChoice: "none"
        }),
        credential,
        fetchImpl,
        timeoutMs,
        expectedTools: inventoryOnlyMap
      });
      cases.push(missing.publicResult);
    } else {
      cases.push(
        skippedCase(fullMeta, "thinking_tool_turn_unavailable"),
        skippedCase(missingMeta, "thinking_tool_turn_unavailable")
      );
    }

    for (const streamCaseId of [
      "stream-flash-disabled",
      "stream-pro-enabled"
    ]) {
      const meta = findMeta(streamCaseId);
      const body = makeBody(meta, {
        messages: [
          {
            role: "user",
            content:
              "Use the read-only tool to check 1 unit of synthetic SKU-101 in the west warehouse."
          }
        ],
        tools: inventoryOnly
      });
      cases.push(
        await performStreamRequest({
          meta,
          body,
          credential,
          fetchImpl,
          timeoutMs,
          expectedTools: inventoryOnlyMap
        })
      );
    }
  } finally {
    credential = null;
  }

  const executedRequestCount = processNetworkAttempts - processAttemptsBefore;
  return sanitizeForPublic({
    suite: "deepseek_tool_calls_bounded_live",
    plannedRequestCount: PLANNED_REQUESTS,
    executedRequestCount,
    skippedRequestCount: PLANNED_REQUESTS - executedRequestCount,
    hardProcessNetworkBudget: MAX_NETWORK_REQUESTS_PER_PROCESS,
    maximumConcurrency: 1,
    observedPeakConcurrency,
    genericRetries: 0,
    maximumTokensPerRequest: MAX_TOKENS_PER_REQUEST,
    maximumTheoreticalOutputTokens:
      publicPlan.reduce((sum, entry) => sum + entry.maxTokens, 0),
    allCaseExpectationsMet:
      cases.length === publicPlan.length &&
      cases.every((entry) => entry.expectationMet),
    caseCount: cases.length,
    cases
  });
}

export function getLiveSafetyState() {
  return Object.freeze({
    allowedUrls: Object.freeze([...ALLOWED_URLS]),
    hardProcessNetworkBudget: MAX_NETWORK_REQUESTS_PER_PROCESS,
    processNetworkAttempts,
    maximumConcurrency: 1,
    observedPeakConcurrency,
    genericRetries: 0,
    maximumTokensPerRequest: MAX_TOKENS_PER_REQUEST,
    plannedRequestCount: PLANNED_REQUESTS
  });
}

export const liveSuiteContract = Object.freeze({
  allowedUrls: Object.freeze([...ALLOWED_URLS]),
  models: MODELS,
  thinkingModes: THINKING_MODES,
  toolChoiceLabels: CHOICE_LABELS,
  hardProcessNetworkBudget: MAX_NETWORK_REQUESTS_PER_PROCESS,
  plannedRequestCount: PLANNED_REQUESTS,
  maximumConcurrency: 1,
  genericRetries: 0,
  maximumTokensPerRequest: MAX_TOKENS_PER_REQUEST,
  maximumTheoreticalOutputTokens:
    publicPlan.reduce((sum, entry) => sum + entry.maxTokens, 0),
  plan: Object.freeze([...publicPlan])
});
