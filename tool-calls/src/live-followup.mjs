import { compileArgumentsForLocalExecution } from "./argument-validator.mjs";
import { acceptInMemoryCredential } from "./env-guard.mjs";
import { sanitizeForPublic } from "./redact.mjs";

const STANDARD_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-v4-flash";
const MAX_REQUESTS = 4;
const MAX_TOKENS = 96;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 60_000;

let serialTail = Promise.resolve();
let networkInFlight = 0;
let observedPeakConcurrency = 0;
let processAttempts = 0;
let followupStarted = false;

const emptyObjectSchema = Object.freeze({
  type: "object",
  properties: Object.freeze({}),
  required: Object.freeze([]),
  additionalProperties: false
});

const alphaTool = Object.freeze({
  type: "function",
  function: Object.freeze({
    name: "read_alpha",
    description: "Return the fixed synthetic alpha status.",
    parameters: emptyObjectSchema
  })
});

const betaTool = Object.freeze({
  type: "function",
  function: Object.freeze({
    name: "read_beta",
    description: "Return the fixed synthetic beta status.",
    parameters: emptyObjectSchema
  })
});

const publicPlan = Object.freeze([
  Object.freeze({
    caseId: "followup-single-initial",
    scenario: "single_tool",
    phase: "initial",
    expectedToolCallCount: 1
  }),
  Object.freeze({
    caseId: "followup-single-continuation",
    scenario: "single_tool",
    phase: "continuation",
    expectedToolCallCount: 0
  }),
  Object.freeze({
    caseId: "followup-multiple-initial",
    scenario: "multiple_tools",
    phase: "initial",
    expectedToolCallCount: 2
  }),
  Object.freeze({
    caseId: "followup-multiple-continuation",
    scenario: "multiple_tools",
    phase: "continuation",
    expectedToolCallCount: 0
  })
]);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeNumber(value) {
  return Number.isFinite(value) && value >= 0 ? Number(value) : null;
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

function enqueueNetwork(task) {
  const execute = async () => {
    if (processAttempts >= MAX_REQUESTS) {
      throw new Error("The diagnostic follow-up network budget is exhausted.");
    }
    processAttempts += 1;
    networkInFlight += 1;
    observedPeakConcurrency = Math.max(observedPeakConcurrency, networkInFlight);
    if (networkInFlight > 1) {
      networkInFlight -= 1;
      throw new Error("The diagnostic follow-up concurrency guard was exceeded.");
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

function requestBody({ messages, tools, toolChoice }) {
  const body = {
    model: MODEL,
    messages,
    tools,
    tool_choice: toolChoice,
    thinking: { type: "disabled" },
    max_tokens: MAX_TOKENS,
    temperature: 0,
    stream: false
  };
  if (body.max_tokens > MAX_TOKENS) {
    throw new Error("Diagnostic request exceeds its output-token cap.");
  }
  return body;
}

function analyzeInitial(body, expectedTools) {
  const choice = Array.isArray(body?.choices) ? body.choices[0] : null;
  const message = choice?.message;
  const calls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  const ids = new Set();
  const observedNames = new Set();
  let shapeValid = isRecord(message);
  let argumentsParsed = true;
  let argumentsValid = true;

  for (const call of calls) {
    if (
      typeof call?.id !== "string" ||
      call.id.length === 0 ||
      call.type !== "function" ||
      typeof call.function?.name !== "string" ||
      typeof call.function?.arguments !== "string"
    ) {
      shapeValid = false;
      continue;
    }
    ids.add(call.id);
    observedNames.add(call.function.name);
    const expected = expectedTools.get(call.function.name);
    if (!expected) {
      argumentsValid = false;
      continue;
    }
    const compiled = compileArgumentsForLocalExecution(
      call.function.arguments,
      expected.function.parameters
    );
    argumentsParsed &&= compiled.report.parsed;
    argumentsValid &&= compiled.report.valid;
  }

  const exactToolSet =
    observedNames.size === expectedTools.size &&
    [...expectedTools.keys()].every((name) => observedNames.has(name));
  const uniqueIds = ids.size === calls.length;

  return {
    public: {
      finishReason:
        typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
      toolCallCount: calls.length,
      uniqueToolCallIdCount: ids.size,
      callShapeValid: shapeValid,
      toolNamesValid: exactToolSet,
      argumentsParsed,
      argumentsValid,
      promptTokens: safeNumber(body?.usage?.prompt_tokens),
      completionTokens: safeNumber(body?.usage?.completion_tokens),
      totalTokens: safeNumber(body?.usage?.total_tokens)
    },
    continuationEligible:
      shapeValid &&
      calls.length === expectedTools.size &&
      uniqueIds &&
      exactToolSet &&
      argumentsParsed &&
      argumentsValid,
    internal:
      shapeValid
        ? {
            assistantMessage: structuredClone(message),
            calls: structuredClone(calls)
          }
        : null
  };
}

function analyzeContinuation(body) {
  const choice = Array.isArray(body?.choices) ? body.choices[0] : null;
  const message = choice?.message;
  const content = typeof message?.content === "string" ? message.content : "";
  const calls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  return {
    finishReason:
      typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
    contentNonEmpty: content.trim().length > 0,
    toolCallCount: calls.length,
    promptTokens: safeNumber(body?.usage?.prompt_tokens),
    completionTokens: safeNumber(body?.usage?.completion_tokens),
    totalTokens: safeNumber(body?.usage?.total_tokens)
  };
}

async function performRequest({
  meta,
  body,
  credential,
  fetchImpl,
  timeoutMs,
  expectedTools
}) {
  return enqueueNetwork(async () => {
    const started = performance.now();
    const headers = new Headers({
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${credential}`
    });
    try {
      const response = await fetchImpl(STANDARD_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs)
      });
      const elapsedMs = Math.round(performance.now() - started);
      const base = {
        caseId: meta.caseId,
        scenario: meta.scenario,
        phase: meta.phase,
        model: MODEL,
        thinking: "disabled",
        maxTokens: MAX_TOKENS,
        requestIssued: true,
        status: response.status,
        statusClass: statusClass(response.status),
        elapsedMs
      };
      if (!response.ok) {
        if (response.body) await response.body.cancel();
        return {
          publicResult: sanitizeForPublic({
            ...base,
            expectationMet: false
          }),
          internal: null,
          continuationEligible: false
        };
      }

      let parsed = null;
      try {
        parsed = await response.json();
      } catch {
        parsed = null;
      }

      if (meta.phase === "initial") {
        const analysis = analyzeInitial(parsed, expectedTools);
        parsed = null;
        const publicResult = {
          ...base,
          ...analysis.public,
          expectedToolCallCount: meta.expectedToolCallCount,
          continuationEligible: analysis.continuationEligible,
          expectationMet: analysis.continuationEligible
        };
        return {
          publicResult: sanitizeForPublic(publicResult),
          internal: analysis.internal,
          continuationEligible: analysis.continuationEligible
        };
      }

      const analysis = analyzeContinuation(parsed);
      parsed = null;
      return {
        publicResult: sanitizeForPublic({
          ...base,
          ...analysis,
          expectedToolCallCount: 0,
          expectationMet:
            analysis.contentNonEmpty && analysis.toolCallCount === 0
        }),
        internal: null,
        continuationEligible: false
      };
    } catch {
      return {
        publicResult: sanitizeForPublic({
          caseId: meta.caseId,
          scenario: meta.scenario,
          phase: meta.phase,
          model: MODEL,
          thinking: "disabled",
          maxTokens: MAX_TOKENS,
          requestIssued: true,
          status: null,
          statusClass: "transport_error",
          elapsedMs: Math.round(performance.now() - started),
          expectationMet: false
        }),
        internal: null,
        continuationEligible: false
      };
    }
  });
}

function localToolMessages(internal, tools) {
  if (!internal || !Array.isArray(internal.calls)) return null;
  const messages = [];
  for (const call of internal.calls) {
    const tool = tools.get(call.function.name);
    if (!tool) return null;
    const compiled = compileArgumentsForLocalExecution(
      call.function.arguments,
      tool.function.parameters
    );
    if (!compiled.report.valid) return null;
    const result =
      call.function.name === "read_alpha"
        ? { status: "ALPHA_OK" }
        : { status: "BETA_OK" };
    messages.push({
      role: "tool",
      tool_call_id: call.id,
      content: JSON.stringify(result)
    });
  }
  return messages;
}

function skipped(meta, code) {
  return sanitizeForPublic({
    caseId: meta.caseId,
    scenario: meta.scenario,
    phase: meta.phase,
    model: MODEL,
    thinking: "disabled",
    maxTokens: MAX_TOKENS,
    requestIssued: false,
    status: null,
    statusClass: "skipped",
    skipCode: code,
    expectationMet: false
  });
}

export async function runSingleAndMultiToolFollowup({
  apiKey,
  fetchImpl = globalThis.fetch,
  timeoutMs = 45_000
}) {
  if (followupStarted || processAttempts > 0) {
    throw new Error("The one-time diagnostic follow-up has already started.");
  }
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

  followupStarted = true;
  let credential = acceptInMemoryCredential(apiKey, { provenance: "memory" });
  const cases = [];
  const alphaTools = new Map([["read_alpha", alphaTool]]);
  const bothTools = new Map([
    ["read_alpha", alphaTool],
    ["read_beta", betaTool]
  ]);

  try {
    const singleInitialMeta = publicPlan[0];
    const singleUser = {
      role: "user",
      content: "Call the synthetic read_alpha tool once."
    };
    const singleInitial = await performRequest({
      meta: singleInitialMeta,
      body: requestBody({
        messages: [singleUser],
        tools: [alphaTool],
        toolChoice: {
          type: "function",
          function: { name: "read_alpha" }
        }
      }),
      credential,
      fetchImpl,
      timeoutMs,
      expectedTools: alphaTools
    });
    cases.push(singleInitial.publicResult);

    const singleContinuationMeta = publicPlan[1];
    const singleToolMessages = singleInitial.continuationEligible
      ? localToolMessages(singleInitial.internal, alphaTools)
      : null;
    if (singleToolMessages) {
      const singleContinuation = await performRequest({
        meta: singleContinuationMeta,
        body: requestBody({
          messages: [
            singleUser,
            singleInitial.internal.assistantMessage,
            ...singleToolMessages
          ],
          tools: [alphaTool],
          toolChoice: "none"
        }),
        credential,
        fetchImpl,
        timeoutMs,
        expectedTools: alphaTools
      });
      cases.push(singleContinuation.publicResult);
    } else {
      cases.push(
        skipped(singleContinuationMeta, "single_initial_validation_failed")
      );
    }

    const multiInitialMeta = publicPlan[2];
    const multiUser = {
      role: "user",
      content: "Call the synthetic read_alpha and read_beta tools once each."
    };
    const multiInitial = await performRequest({
      meta: multiInitialMeta,
      body: requestBody({
        messages: [multiUser],
        tools: [alphaTool, betaTool],
        toolChoice: "required"
      }),
      credential,
      fetchImpl,
      timeoutMs,
      expectedTools: bothTools
    });
    cases.push(multiInitial.publicResult);

    const multiContinuationMeta = publicPlan[3];
    const multiToolMessages = multiInitial.continuationEligible
      ? localToolMessages(multiInitial.internal, bothTools)
      : null;
    if (multiToolMessages) {
      const multiContinuation = await performRequest({
        meta: multiContinuationMeta,
        body: requestBody({
          messages: [
            multiUser,
            multiInitial.internal.assistantMessage,
            ...multiToolMessages
          ],
          tools: [alphaTool, betaTool],
          toolChoice: "none"
        }),
        credential,
        fetchImpl,
        timeoutMs,
        expectedTools: bothTools
      });
      cases.push(multiContinuation.publicResult);
    } else {
      cases.push(
        skipped(multiContinuationMeta, "multiple_initial_validation_failed")
      );
    }
  } finally {
    credential = null;
  }

  return sanitizeForPublic({
    suite: "tool_calls_one_time_diagnostic_followup",
    purpose: "complete_single_and_multiple_round_trips_after_truncation",
    plannedRequestCount: 4,
    executedRequestCount: processAttempts,
    skippedRequestCount: 4 - processAttempts,
    hardNetworkBudget: 4,
    maximumConcurrency: 1,
    observedPeakConcurrency,
    genericRetries: 0,
    maximumTokensPerRequest: 96,
    maximumTheoreticalOutputTokens: 384,
    caseCount: cases.length,
    allCaseExpectationsMet:
      cases.length === 4 && cases.every((entry) => entry.expectationMet),
    cases
  });
}

export function getFollowupSafetyState() {
  return Object.freeze({
    allowedUrl: STANDARD_URL,
    model: MODEL,
    thinking: "disabled",
    hardNetworkBudget: MAX_REQUESTS,
    processAttempts,
    maximumConcurrency: 1,
    observedPeakConcurrency,
    genericRetries: 0,
    maximumTokensPerRequest: MAX_TOKENS,
    plannedRequestCount: publicPlan.length,
    started: followupStarted
  });
}

export const followupContract = Object.freeze({
  allowedUrl: STANDARD_URL,
  model: MODEL,
  thinking: "disabled",
  hardNetworkBudget: MAX_REQUESTS,
  plannedRequestCount: publicPlan.length,
  maximumConcurrency: 1,
  genericRetries: 0,
  maximumTokensPerRequest: MAX_TOKENS,
  maximumTheoreticalOutputTokens: MAX_REQUESTS * MAX_TOKENS,
  oneTimeDiagnostic: true,
  plan: publicPlan
});
