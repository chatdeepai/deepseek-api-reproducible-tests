import { readFileSync, renameSync, writeFileSync } from "node:fs";

import { STRUCTURED_SCHEMA, buildChatModel } from "./adapter.mjs";

function requireOptIn() {
  if (process.env.ALLOW_PROVIDER_REQUESTS !== "1") {
    throw new Error("Provider requests are disabled.");
  }
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY must be supplied through the environment.");
  }
  for (const name of [
    "LANGCHAIN_PLAN_PATH",
    "LANGCHAIN_LEDGER_PATH",
    "LANGCHAIN_JS_RESULT_PATH",
  ]) {
    if (!process.env[name]) {
      throw new Error(`Missing required coordinator variable: ${name}.`);
    }
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

function reserve(caseId, cap) {
  const path = process.env.LANGCHAIN_LEDGER_PATH;
  const ledger = readJson(path);
  if (ledger.cap !== cap || ledger.issued >= cap || ledger.case_ids.includes(caseId)) {
    throw new Error("Provider request budget rejected the reservation.");
  }
  ledger.issued += 1;
  ledger.case_ids.push(caseId);
  writeJson(path, ledger);
}

function safeClass(error) {
  const value = error?.constructor?.name ?? error?.name ?? "Error";
  return /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(value) ? value : "Error";
}

function safeStatus(error) {
  const value = error?.status ?? error?.statusCode;
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
}

function safeCode(error) {
  const value = error?.code;
  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(value)
    ? value
    : null;
}

function baseResult(testCase, started, status) {
  return {
    case_id: testCase.id,
    runtime: "javascript",
    execution: "async",
    scenario: testCase.scenario,
    requested_model: testCase.model,
    thinking: testCase.thinking,
    request_issued: true,
    status,
    elapsed_ms: Math.round(performance.now() - started),
  };
}

function modelFor(testCase, plan) {
  return buildChatModel({
    model: testCase.model,
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: plan.javascript_api_base,
    maxTokens: testCase.max_tokens,
    thinking: testCase.thinking,
    timeout: plan.default_timeout_seconds * 1000,
    maxRetries: 0,
  });
}

async function runCase(testCase, plan) {
  const started = performance.now();
  reserve(testCase.id, plan.provider_request_cap);
  const model = modelFor(testCase, plan);
  try {
    if (testCase.scenario === "stream") {
      let chunkCount = 0;
      let contentSeen = false;
      let reasoningSeen = false;
      let terminal = null;
      for await (const chunk of await model.stream("Return one concise synthetic answer.")) {
        chunkCount += 1;
        contentSeen ||= Boolean(chunk.content);
        reasoningSeen ||= Boolean(chunk.additional_kwargs?.reasoning_content);
        terminal = chunk.response_metadata?.finish_reason ?? terminal;
      }
      return {
        ...baseResult(testCase, started, 200),
        outcome: "success",
        chunk_count: chunkCount,
        content_delta_seen: contentSeen,
        reasoning_delta_seen: reasoningSeen,
        terminal_finish_reason: terminal,
      };
    }
    if (testCase.scenario === "structured_output") {
      const runnable = model.withStructuredOutput(STRUCTURED_SCHEMA, {
        name: "StructuredAnswer",
        method: "functionCalling",
      });
      const parsed = await runnable.invoke("Return the synthetic structured object.");
      const valid =
        parsed !== null &&
        typeof parsed === "object" &&
        typeof parsed.label === "string" &&
        Number.isInteger(parsed.score);
      return {
        ...baseResult(testCase, started, 200),
        outcome: "success",
        schema_valid: valid,
        validated_field_count: 2,
        structured_method: "function_calling",
      };
    }
    const message = await model.invoke("Return one concise synthetic answer.");
    const result = {
      ...baseResult(testCase, started, 200),
      outcome: "success",
      message_class: message.constructor?.name ?? "AIMessage",
      content_nonempty: typeof message.content === "string" && message.content.length > 0,
      reasoning_field_present: Object.hasOwn(
        message.additional_kwargs ?? {},
        "reasoning_content",
      ),
      reasoning_nonempty: Boolean(message.additional_kwargs?.reasoning_content),
      finish_reason: message.response_metadata?.finish_reason ?? null,
    };
    if (testCase.scenario === "alias_probe") {
      result.outcome = "alias_accepted";
    } else if (testCase.scenario === "invalid_model") {
      result.outcome = "unexpected_model_accepted";
      result.expected_error_observed = false;
    }
    return result;
  } catch (error) {
    const result = {
      ...baseResult(testCase, started, safeStatus(error)),
      outcome:
        testCase.scenario === "alias_probe"
          ? "alias_rejected"
          : testCase.scenario === "invalid_model"
            ? "expected_provider_error"
            : "provider_error",
      exception_class: safeClass(error),
      error_code: safeCode(error),
    };
    if (testCase.scenario === "invalid_model") {
      result.expected_error_observed = true;
    }
    return result;
  }
}

requireOptIn();
const plan = readJson(process.env.LANGCHAIN_PLAN_PATH);
const cases = plan.cases.filter((testCase) => testCase.runtime === "javascript");
if (cases.length !== 5 || plan.provider_request_cap !== 16) {
  throw new Error("Frozen JavaScript plan mismatch.");
}
const results = [];
for (const testCase of cases) {
  results.push(await runCase(testCase, plan));
}
writeJson(process.env.LANGCHAIN_JS_RESULT_PATH, {
  schema_version: 1,
  status: "completed",
  node_version: process.versions.node,
  results,
});
