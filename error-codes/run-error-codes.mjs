import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CHAT_COMPLETIONS_URL =
  "https://api.deepseek.com/chat/completions";
const ALLOWED_ORIGIN = "https://api.deepseek.com";
const MODEL = "deepseek-v4-flash";
const REQUEST_TIMEOUT_MS = 90_000;
const PROVIDER_REQUEST_BUDGET = 14;
const ABSOLUTE_REQUEST_CEILING = 18;
const MAX_SUCCESS_OUTPUT_TOKENS = 4;
const BASE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_DIRECTORY = join(BASE_DIRECTORY, "results");

const PROVIDER_TEST_PLAN = Object.freeze([
  {
    id: "successful_control",
    method: "POST",
    auth_mode: "temporary_valid_key",
    body_variant: "valid_minimal_chat",
    purpose:
      "Confirm that the temporary key, current model, and fixed endpoint can complete one minimal request.",
  },
  {
    id: "invalid_credential",
    method: "POST",
    auth_mode: "generated_invalid_credential",
    body_variant: "valid_minimal_chat",
    purpose:
      "Observe authentication handling for a deliberately invalid generated credential.",
  },
  {
    id: "missing_credential",
    method: "POST",
    auth_mode: "omitted",
    body_variant: "valid_minimal_chat",
    purpose:
      "Observe authentication handling when the Authorization header is omitted.",
  },
  {
    id: "malformed_json",
    method: "POST",
    auth_mode: "temporary_valid_key",
    body_variant: "truncated_json",
    purpose:
      "Observe provider handling of a small malformed JSON document.",
  },
  {
    id: "wrong_content_type",
    method: "POST",
    auth_mode: "temporary_valid_key",
    body_variant: "plain_text_not_json",
    purpose:
      "Observe provider handling of a small non-JSON body.",
  },
  {
    id: "missing_messages",
    method: "POST",
    auth_mode: "temporary_valid_key",
    body_variant: "json_without_messages",
    purpose:
      "Observe validation when a required request field is absent.",
  },
  {
    id: "empty_messages",
    method: "POST",
    auth_mode: "temporary_valid_key",
    body_variant: "empty_messages_array",
    purpose:
      "Observe validation of an empty message list.",
  },
  {
    id: "wrong_messages_type",
    method: "POST",
    auth_mode: "temporary_valid_key",
    body_variant: "messages_string",
    purpose:
      "Observe validation when messages has the wrong JSON type.",
  },
  {
    id: "unknown_model",
    method: "POST",
    auth_mode: "temporary_valid_key",
    body_variant: "unknown_model_id",
    purpose:
      "Observe current routing or validation behavior for a synthetic unknown model ID.",
  },
  {
    id: "invalid_thinking_enum",
    method: "POST",
    auth_mode: "temporary_valid_key",
    body_variant: "unsupported_thinking_value",
    purpose:
      "Observe validation of a thinking toggle value outside the documented enum.",
  },
  {
    id: "negative_max_tokens",
    method: "POST",
    auth_mode: "temporary_valid_key",
    body_variant: "negative_max_tokens",
    purpose:
      "Observe validation of a negative output-token limit.",
  },
  {
    id: "invalid_user_id",
    method: "POST",
    auth_mode: "temporary_valid_key",
    body_variant: "user_id_outside_documented_charset",
    purpose:
      "Observe validation of a synthetic user_id containing disallowed characters.",
  },
  {
    id: "temperature_above_documented_range",
    method: "POST",
    auth_mode: "temporary_valid_key",
    body_variant: "temperature_above_two",
    purpose:
      "Observe validation of a temperature above the documented maximum.",
  },
  {
    id: "unsupported_get_method",
    method: "GET",
    auth_mode: "temporary_valid_key",
    body_variant: "none",
    purpose:
      "Observe method handling on the fixed Chat Completions endpoint without sending a body.",
  },
]);

const SIMULATED_RETRY_CASES = Object.freeze([
  {
    condition: "http_400",
    source: "simulated_client_policy",
    retryable_without_change: false,
    policy:
      "Correct the request format before making another provider call.",
  },
  {
    condition: "http_401",
    source: "simulated_client_policy",
    retryable_without_change: false,
    policy:
      "Repair or rotate credentials before making another provider call.",
  },
  {
    condition: "http_402",
    source: "simulated_client_policy",
    retryable_without_change: false,
    policy:
      "Resolve account funding outside the request loop; do not poll by generating completions.",
  },
  {
    condition: "http_422",
    source: "simulated_client_policy",
    retryable_without_change: false,
    policy:
      "Correct the invalid parameters before making another provider call.",
  },
  {
    condition: "http_429",
    source: "simulated_client_policy",
    retryable_without_change: true,
    policy:
      "Queue work and use capped exponential backoff with an application-level duplicate-work guard.",
  },
  {
    condition: "http_500",
    source: "simulated_client_policy",
    retryable_without_change: true,
    policy:
      "Retry a bounded number of times after a brief backoff and retain a duplicate-work guard.",
  },
  {
    condition: "http_503",
    source: "simulated_client_policy",
    retryable_without_change: true,
    policy:
      "Retry a bounded number of times after a brief backoff; open a circuit when failures persist.",
  },
  {
    condition: "network_timeout",
    source: "simulated_client_policy",
    retryable_without_change: true,
    policy:
      "Treat the original outcome as unknown and retry only with an application-level duplicate-work guard.",
  },
]);

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function makeRunId() {
  return randomBytes(8).toString("hex");
}

function makeInvalidCredential() {
  return `sk-invalid-${randomBytes(12).toString("hex")}`;
}

function minimalMessages() {
  return [
    {
      role: "user",
      content: "Return exactly OK.",
    },
  ];
}

function validMinimalBody() {
  return {
    model: MODEL,
    messages: minimalMessages(),
    thinking: { type: "disabled" },
    stream: false,
    max_tokens: MAX_SUCCESS_OUTPUT_TOKENS,
  };
}

function buildRequest(testCase) {
  const base = validMinimalBody();
  switch (testCase.body_variant) {
    case "valid_minimal_chat":
      return {
        body: JSON.stringify(base),
        contentType: "application/json",
      };
    case "truncated_json":
      return {
        body: '{"model":"deepseek-v4-flash","messages":[',
        contentType: "application/json",
      };
    case "plain_text_not_json":
      return {
        body: "synthetic plain text body",
        contentType: "text/plain",
      };
    case "json_without_messages":
      return {
        body: JSON.stringify({
          model: MODEL,
          thinking: { type: "disabled" },
          max_tokens: MAX_SUCCESS_OUTPUT_TOKENS,
        }),
        contentType: "application/json",
      };
    case "empty_messages_array":
      return {
        body: JSON.stringify({
          ...base,
          messages: [],
        }),
        contentType: "application/json",
      };
    case "messages_string":
      return {
        body: JSON.stringify({
          ...base,
          messages: "synthetic-invalid-type",
        }),
        contentType: "application/json",
      };
    case "unknown_model_id":
      return {
        body: JSON.stringify({
          ...base,
          model: "deepseek-error-harness-invalid-model",
        }),
        contentType: "application/json",
      };
    case "unsupported_thinking_value":
      return {
        body: JSON.stringify({
          ...base,
          thinking: { type: "synthetic-invalid-value" },
        }),
        contentType: "application/json",
      };
    case "negative_max_tokens":
      return {
        body: JSON.stringify({
          ...base,
          max_tokens: -1,
        }),
        contentType: "application/json",
      };
    case "user_id_outside_documented_charset":
      return {
        body: JSON.stringify({
          ...base,
          user_id: "synthetic invalid user id",
        }),
        contentType: "application/json",
      };
    case "temperature_above_two":
      return {
        body: JSON.stringify({
          ...base,
          temperature: 2.1,
        }),
        contentType: "application/json",
      };
    case "none":
      return {
        body: undefined,
        contentType: null,
      };
    default:
      throw new Error(
        `Unknown body variant: ${testCase.body_variant}`,
      );
  }
}

function safePublicToken(value) {
  if (typeof value !== "string") return null;
  if (value.length < 1 || value.length > 64) return null;
  if (!/^[A-Za-z0-9_.:-]+$/.test(value)) return null;
  return value;
}

function scrubIdentifiers(value, secrets) {
  if (value === null || value === undefined) return null;
  let text = String(value);
  for (const secret of secrets) {
    if (secret) text = text.split(secret).join("[REDACTED_SECRET]");
  }
  return text
    .replace(/Bearer\s+[^\s"',}]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_SECRET]")
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      "[REDACTED_IDENTIFIER]",
    )
    .replace(
      /\b(?:req|request|trace|chatcmpl|cmpl)[-_]?[A-Za-z0-9_-]{8,}\b/gi,
      "[REDACTED_IDENTIFIER]",
    )
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[REDACTED_IDENTIFIER]")
    .slice(0, 2_000);
}

function textMetadata(value) {
  if (typeof value !== "string") {
    return {
      present: false,
      characters: null,
      utf8_bytes: null,
      sha256: null,
    };
  }
  return {
    present: value.length > 0,
    characters: Array.from(value).length,
    utf8_bytes: Buffer.byteLength(value, "utf8"),
    sha256: sha256(value),
  };
}

function parsePayload(rawText) {
  try {
    return {
      parsed: true,
      value: JSON.parse(rawText),
    };
  } catch {
    return {
      parsed: false,
      value: null,
    };
  }
}

function integerOrNull(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function extractProviderMetadata({
  rawText,
  payload,
  parsed,
  secrets,
}) {
  const error = payload?.error ?? null;
  const message = payload?.choices?.[0]?.message ?? null;
  const content =
    typeof message?.content === "string" ? message.content : null;
  const reasoning =
    typeof message?.reasoning_content === "string"
      ? message.reasoning_content
      : null;
  const scrubbedError = scrubIdentifiers(error?.message, secrets);
  const errorMessage = textMetadata(scrubbedError);
  const contentValue = textMetadata(content);
  const reasoningValue = textMetadata(reasoning);
  const usage = payload?.usage ?? {};

  return {
    response_json_parseable: parsed,
    response_body_utf8_bytes: Buffer.byteLength(rawText, "utf8"),
    response_content_present: contentValue.present,
    response_content_characters: contentValue.characters,
    response_content_sha256: contentValue.sha256,
    reasoning_content_present: reasoningValue.present,
    reasoning_content_characters: reasoningValue.characters,
    reasoning_content_sha256: reasoningValue.sha256,
    finish_reason:
      typeof payload?.choices?.[0]?.finish_reason === "string"
        ? payload.choices[0].finish_reason
        : null,
    returned_model:
      typeof payload?.model === "string" ? payload.model : null,
    prompt_tokens: integerOrNull(usage?.prompt_tokens),
    completion_tokens: integerOrNull(usage?.completion_tokens),
    total_tokens: integerOrNull(usage?.total_tokens),
    error_type: safePublicToken(
      scrubIdentifiers(error?.type, secrets),
    ),
    error_code:
      safePublicToken(
        scrubIdentifiers(
          typeof error?.code === "number"
            ? String(error.code)
            : error?.code,
          secrets,
        ),
      ),
    error_param_present:
      error?.param !== undefined && error?.param !== null,
    error_param_sha256:
      error?.param !== undefined && error?.param !== null
        ? sha256(
            scrubIdentifiers(String(error.param), secrets) ||
              "[REDACTED]",
          )
        : null,
    error_message_present: errorMessage.present,
    error_message_characters: errorMessage.characters,
    error_message_sha256: errorMessage.sha256,
  };
}

function buildFetchOptions({
  testCase,
  request,
  apiKey,
  invalidCredential,
  signal,
}) {
  const headers = {};
  if (request.contentType) {
    headers["Content-Type"] = request.contentType;
  }
  if (testCase.auth_mode === "temporary_valid_key") {
    headers.Authorization = `Bearer ${apiKey}`;
  } else if (
    testCase.auth_mode === "generated_invalid_credential"
  ) {
    headers.Authorization = `Bearer ${invalidCredential}`;
  }

  const options = {
    method: testCase.method,
    redirect: "error",
    headers,
    signal,
  };
  if (request.body !== undefined) options.body = request.body;
  return options;
}

class ProviderRunner {
  constructor({ apiKey, invalidCredential, runId }) {
    this.apiKey = apiKey;
    this.invalidCredential = invalidCredential;
    this.runId = runId;
    this.requestCount = 0;
    this.records = [];
  }

  async observe(testCase) {
    if (this.requestCount >= PROVIDER_REQUEST_BUDGET) {
      throw new Error(
        `Provider request budget exhausted before ${testCase.id}. No request was sent.`,
      );
    }
    const request = buildRequest(testCase);
    this.requestCount += 1;
    const requestNumber = this.requestCount;
    const startedAt = new Date();
    const started = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error("Request timeout")),
      REQUEST_TIMEOUT_MS,
    );
    const secrets = [this.apiKey, this.invalidCredential];
    const requestBodyBytes =
      request.body === undefined
        ? 0
        : Buffer.byteLength(request.body, "utf8");
    const requestBodyHash =
      request.body === undefined ? null : sha256(request.body);

    try {
      const response = await fetch(
        CHAT_COMPLETIONS_URL,
        buildFetchOptions({
          testCase,
          request,
          apiKey: this.apiKey,
          invalidCredential: this.invalidCredential,
          signal: controller.signal,
        }),
      );
      const rawText = await response.text();
      const parsedPayload = parsePayload(rawText);
      const completedAt = new Date();
      const record = {
        schema_version: "1.0",
        source: "live_provider_observation",
        run_id: this.runId,
        request_number: requestNumber,
        test_id: testCase.id,
        purpose: testCase.purpose,
        timestamp_utc: startedAt.toISOString(),
        completed_at_utc: completedAt.toISOString(),
        latency_ms: Math.round(performance.now() - started),
        method: testCase.method,
        endpoint: CHAT_COMPLETIONS_URL,
        auth_mode: testCase.auth_mode,
        body_variant: testCase.body_variant,
        request_body_utf8_bytes: requestBodyBytes,
        request_body_sha256: requestBodyHash,
        http_status: response.status,
        http_ok: response.ok,
        transport_error: false,
        transport_error_type: null,
        transport_error_message_characters: null,
        transport_error_message_sha256: null,
        ...extractProviderMetadata({
          rawText,
          payload: parsedPayload.value,
          parsed: parsedPayload.parsed,
          secrets,
        }),
      };
      this.records.push(record);
      return record;
    } catch (error) {
      const completedAt = new Date();
      const scrubbed = scrubIdentifiers(
        error?.message || "Network request failed",
        secrets,
      );
      const errorValue = textMetadata(scrubbed);
      const record = {
        schema_version: "1.0",
        source: "live_provider_observation",
        run_id: this.runId,
        request_number: requestNumber,
        test_id: testCase.id,
        purpose: testCase.purpose,
        timestamp_utc: startedAt.toISOString(),
        completed_at_utc: completedAt.toISOString(),
        latency_ms: Math.round(performance.now() - started),
        method: testCase.method,
        endpoint: CHAT_COMPLETIONS_URL,
        auth_mode: testCase.auth_mode,
        body_variant: testCase.body_variant,
        request_body_utf8_bytes: requestBodyBytes,
        request_body_sha256: requestBodyHash,
        http_status: 0,
        http_ok: false,
        transport_error: true,
        transport_error_type:
          error?.name === "AbortError"
            ? "request_timeout"
            : "network_error",
        transport_error_message_characters: errorValue.characters,
        transport_error_message_sha256: errorValue.sha256,
        response_json_parseable: null,
        response_body_utf8_bytes: null,
        response_content_present: null,
        response_content_characters: null,
        response_content_sha256: null,
        reasoning_content_present: null,
        reasoning_content_characters: null,
        reasoning_content_sha256: null,
        finish_reason: null,
        returned_model: null,
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
        error_type: null,
        error_code: null,
        error_param_present: null,
        error_param_sha256: null,
        error_message_present: null,
        error_message_characters: null,
        error_message_sha256: null,
      };
      this.records.push(record);
      return record;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function simulatedBackoffSchedule(condition) {
  const retryable = SIMULATED_RETRY_CASES.find(
    (entry) => entry.condition === condition,
  )?.retryable_without_change;
  if (!retryable) return [];
  return [
    {
      retry_number: 1,
      wait_before_retry_ms: 500,
    },
    {
      retry_number: 2,
      wait_before_retry_ms: 1_000,
    },
  ];
}

function buildSimulatedRetryPolicy(generatedAt) {
  return SIMULATED_RETRY_CASES.map((entry) => ({
    schema_version: "1.0",
    source: entry.source,
    generated_at_utc: generatedAt,
    condition: entry.condition,
    provider_request_sent: false,
    observed_provider_status: null,
    retryable_without_change: entry.retryable_without_change,
    maximum_simulated_retries:
      entry.retryable_without_change ? 2 : 0,
    simulated_backoff_schedule: simulatedBackoffSchedule(
      entry.condition,
    ),
    automatic_live_retry_performed: false,
    duplicate_work_guard_required:
      entry.retryable_without_change,
    policy: entry.policy,
  }));
}

function validatePlan() {
  const failures = [];
  if (
    PROVIDER_TEST_PLAN.length !== PROVIDER_REQUEST_BUDGET
  ) {
    failures.push(
      `The provider plan has ${PROVIDER_TEST_PLAN.length} cases but the budget is ${PROVIDER_REQUEST_BUDGET}.`,
    );
  }
  if (PROVIDER_REQUEST_BUDGET > ABSOLUTE_REQUEST_CEILING) {
    failures.push(
      `Provider budget ${PROVIDER_REQUEST_BUDGET} exceeds the ceiling ${ABSOLUTE_REQUEST_CEILING}.`,
    );
  }
  if (
    new URL(CHAT_COMPLETIONS_URL).origin !== ALLOWED_ORIGIN
  ) {
    failures.push("The provider endpoint is outside the fixed origin.");
  }
  if (
    PROVIDER_TEST_PLAN.some(
      (testCase) =>
        !["POST", "GET"].includes(testCase.method) ||
        ![
          "temporary_valid_key",
          "generated_invalid_credential",
          "omitted",
        ].includes(testCase.auth_mode),
    )
  ) {
    failures.push(
      "A provider case uses a method or authentication mode outside the allow-list.",
    );
  }
  if (
    PROVIDER_TEST_PLAN.some(
      (testCase) =>
        /balance|concurrency|flood|overload|exhaust/i.test(
          `${testCase.id} ${testCase.purpose}`,
        ),
    )
  ) {
    failures.push(
      "The live plan contains a prohibited balance or load-induction test.",
    );
  }
  if (
    !PROVIDER_TEST_PLAN.some(
      (testCase) => testCase.id === "successful_control",
    )
  ) {
    failures.push("The plan is missing a successful control.");
  }
  if (
    new Set(PROVIDER_TEST_PLAN.map((testCase) => testCase.id))
      .size !== PROVIDER_TEST_PLAN.length
  ) {
    failures.push("Provider test IDs must be unique.");
  }
  if (
    SIMULATED_RETRY_CASES.some(
      (entry) => entry.source !== "simulated_client_policy",
    )
  ) {
    failures.push(
      "A retry-policy row is not labeled as simulated.",
    );
  }
  if (MAX_SUCCESS_OUTPUT_TOKENS > 8) {
    failures.push(
      "The successful control output cap exceeds the safety limit.",
    );
  }

  return {
    valid: failures.length === 0,
    failures,
    provider_request_budget: PROVIDER_REQUEST_BUDGET,
    absolute_request_ceiling: ABSOLUTE_REQUEST_CEILING,
    provider_cases: PROVIDER_TEST_PLAN.length,
    simulated_policy_cases: SIMULATED_RETRY_CASES.length,
    fixed_endpoint: CHAT_COMPLETIONS_URL,
    automatic_live_retries: 0,
    execution_order: "sequential",
  };
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const stringValue =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(stringValue)
    ? `"${stringValue.replace(/"/g, '""')}"`
    : stringValue;
}

function objectsToCsv(rows) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => csvEscape(row[header])).join(","),
    ),
  ].join("\n");
}

function summarizeProviderRows(rows) {
  const statusCounts = {};
  for (const row of rows) {
    const key =
      row.transport_error === true
        ? row.transport_error_type
        : `http_${row.http_status}`;
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
  }
  return {
    calls: rows.length,
    status_counts: statusCounts,
    successful_http_calls: rows.filter((row) => row.http_ok).length,
    transport_errors: rows.filter((row) => row.transport_error).length,
    total_prompt_tokens: rows
      .map((row) => row.prompt_tokens)
      .filter(Number.isInteger)
      .reduce((sum, value) => sum + value, 0),
    total_completion_tokens: rows
      .map((row) => row.completion_tokens)
      .filter(Number.isInteger)
      .reduce((sum, value) => sum + value, 0),
  };
}

async function saveProviderResults({
  runner,
  startedAt,
  completedAt,
  outputDirectory,
}) {
  await mkdir(outputDirectory, { recursive: true });
  const timestamp = startedAt.replace(/[:.]/g, "-");
  const baseName = `provider-observations-${timestamp}-${runner.runId}`;
  const jsonPath = join(outputDirectory, `${baseName}.json`);
  const csvPath = join(outputDirectory, `${baseName}.csv`);
  const latestJsonPath = join(
    outputDirectory,
    "latest-provider-observations.json",
  );
  const latestCsvPath = join(
    outputDirectory,
    "latest-provider-observations.csv",
  );
  const payload = {
    schema_version: "1.0",
    artifact: "DeepSeek API Error-Code Provider Observations",
    source: "live_provider_observation",
    run_id: runner.runId,
    started_at_utc: startedAt,
    completed_at_utc: completedAt,
    fixed_endpoint: CHAT_COMPLETIONS_URL,
    requested_model_for_valid_control: MODEL,
    provider_request_budget: PROVIDER_REQUEST_BUDGET,
    provider_requests_sent: runner.requestCount,
    automatic_retries: 0,
    execution_order: "sequential",
    per_request_timeout_ms: REQUEST_TIMEOUT_MS,
    redaction: {
      api_key_persisted: false,
      invalid_credential_persisted: false,
      request_headers_persisted: false,
      response_headers_persisted: false,
      prompts_persisted_in_results: false,
      request_bodies_persisted_in_results: false,
      response_bodies_persisted: false,
      balances_requested_or_persisted: false,
      response_request_ids_persisted: false,
      private_identifiers_persisted: false,
      raw_error_messages_persisted: false,
      hashes_and_lengths_used_for_text: true,
    },
    plan: PROVIDER_TEST_PLAN,
    interpretation_limits: [
      "No HTTP status is hard-coded as the expected live result for any provider probe.",
      "The provider may change validation order or status mapping after the run date.",
      "Only one minimal successful completion is planned; invalid requests should be rejected before inference but that is not assumed.",
      "The harness does not attempt to induce insufficient balance, concurrency limits, rate limits, server errors, overload, or account enforcement.",
      "HTTP 402, 429, 500, and 503 policy examples are generated only in the separate simulated-client artifact.",
      "There are no automatic retries. Each provider row represents one request attempt.",
    ],
    summary: summarizeProviderRows(runner.records),
    observations: runner.records,
  };
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  const csv = `${objectsToCsv(runner.records)}\n`;

  await Promise.all([
    writeFile(jsonPath, json, "utf8"),
    writeFile(csvPath, csv, "utf8"),
    writeFile(latestJsonPath, json, "utf8"),
    writeFile(latestCsvPath, csv, "utf8"),
  ]);
  return {
    jsonPath,
    csvPath,
    latestJsonPath,
    latestCsvPath,
  };
}

async function saveSimulatedPolicy({
  generatedAt,
  outputDirectory,
  runLabel,
}) {
  await mkdir(outputDirectory, { recursive: true });
  const rows = buildSimulatedRetryPolicy(generatedAt);
  const timestamp = generatedAt.replace(/[:.]/g, "-");
  const baseName = `simulated-retry-policy-${timestamp}-${runLabel}`;
  const jsonPath = join(outputDirectory, `${baseName}.json`);
  const csvPath = join(outputDirectory, `${baseName}.csv`);
  const latestJsonPath = join(
    outputDirectory,
    "latest-simulated-retry-policy.json",
  );
  const latestCsvPath = join(
    outputDirectory,
    "latest-simulated-retry-policy.csv",
  );
  const payload = {
    schema_version: "1.0",
    artifact: "Simulated API Client Retry Policy",
    source: "simulated_client_policy",
    generated_at_utc: generatedAt,
    provider_requests_sent: 0,
    automatic_live_retries: 0,
    disclaimer:
      "These rows are deterministic client-policy simulations, not observed DeepSeek provider responses.",
    rows,
  };
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  const csv = `${objectsToCsv(rows)}\n`;

  await Promise.all([
    writeFile(jsonPath, json, "utf8"),
    writeFile(csvPath, csv, "utf8"),
    writeFile(latestJsonPath, json, "utf8"),
    writeFile(latestCsvPath, csv, "utf8"),
  ]);
  return {
    jsonPath,
    csvPath,
    latestJsonPath,
    latestCsvPath,
  };
}

function planPayload() {
  return {
    harness: "DeepSeek API Error-Code Live-Test Harness",
    network_requests_will_be_sent: false,
    validation: validatePlan(),
    provider_plan: PROVIDER_TEST_PLAN,
    simulated_retry_policy: {
      source: "simulated_client_policy",
      provider_requests_sent: 0,
      cases: SIMULATED_RETRY_CASES,
    },
    persisted_secrets_or_raw_payloads: false,
  };
}

function printUsage() {
  console.log(
    [
      "No API request was sent.",
      "",
      "Offline checks:",
      "  node --check run-error-codes.mjs",
      "  node run-error-codes.mjs --validate-plan",
      "  node run-error-codes.mjs --plan",
      "  node run-error-codes.mjs --simulate",
      "",
      "Explicit provider execution:",
      "  set DEEPSEEK_API_KEY in the current process environment",
      "  node run-error-codes.mjs --execute",
      "",
      `Provider request budget: ${PROVIDER_REQUEST_BUDGET}`,
      `Hard request ceiling: ${ABSOLUTE_REQUEST_CEILING}`,
      "Automatic live retries: 0",
    ].join("\n"),
  );
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const knownModes = new Set([
    "--validate-plan",
    "--plan",
    "--simulate",
    "--execute",
  ]);
  const unknownArgs = [...args].filter(
    (arg) => !knownModes.has(arg),
  );
  if (unknownArgs.length > 0) {
    throw new Error(`Unknown argument: ${unknownArgs.join(", ")}`);
  }
  const selectedModes = [...knownModes].filter((mode) =>
    args.has(mode),
  );
  if (selectedModes.length > 1) {
    throw new Error(
      "Choose only one mode: --validate-plan, --plan, --simulate, or --execute.",
    );
  }

  if (args.has("--validate-plan")) {
    const validation = validatePlan();
    console.log(JSON.stringify(validation, null, 2));
    if (!validation.valid) process.exitCode = 1;
    return;
  }
  if (args.has("--plan")) {
    console.log(JSON.stringify(planPayload(), null, 2));
    return;
  }
  if (args.has("--simulate")) {
    const validation = validatePlan();
    if (!validation.valid) {
      throw new Error(
        `Plan validation failed: ${validation.failures.join(" ")}`,
      );
    }
    const generatedAt = new Date().toISOString();
    const outputDirectory =
      process.env.DEEPSEEK_ERROR_OUTPUT_DIR ||
      DEFAULT_OUTPUT_DIRECTORY;
    const files = await saveSimulatedPolicy({
      generatedAt,
      outputDirectory,
      runLabel: "offline",
    });
    console.log(
      JSON.stringify(
        {
          completed: true,
          source: "simulated_client_policy",
          provider_requests_sent: 0,
          files,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (!args.has("--execute")) {
    printUsage();
    return;
  }

  const validation = validatePlan();
  if (!validation.valid) {
    throw new Error(
      `Plan validation failed: ${validation.failures.join(" ")}`,
    );
  }
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error(
      "DEEPSEEK_API_KEY is not set. No provider request was sent.",
    );
  }

  const outputDirectory =
    process.env.DEEPSEEK_ERROR_OUTPUT_DIR ||
    DEFAULT_OUTPUT_DIRECTORY;
  const runId = makeRunId();
  const invalidCredential = makeInvalidCredential();
  const startedAt = new Date().toISOString();
  const runner = new ProviderRunner({
    apiKey,
    invalidCredential,
    runId,
  });

  for (const testCase of PROVIDER_TEST_PLAN) {
    await runner.observe(testCase);
  }
  if (runner.requestCount !== PROVIDER_REQUEST_BUDGET) {
    throw new Error(
      `Internal request-count error: sent ${runner.requestCount}, expected ${PROVIDER_REQUEST_BUDGET}.`,
    );
  }

  const completedAt = new Date().toISOString();
  const providerFiles = await saveProviderResults({
    runner,
    startedAt,
    completedAt,
    outputDirectory,
  });
  const simulationFiles = await saveSimulatedPolicy({
    generatedAt: completedAt,
    outputDirectory,
    runLabel: runId,
  });
  console.log(
    JSON.stringify(
      {
        completed: true,
        provider_requests_sent: runner.requestCount,
        provider_request_budget: PROVIDER_REQUEST_BUDGET,
        automatic_live_retries: 0,
        provider_files: providerFiles,
        simulated_policy_files: simulationFiles,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  const apiKey = process.env.DEEPSEEK_API_KEY || "";
  const scrubbed = scrubIdentifiers(
    error?.message || error || "Harness failed.",
    [apiKey],
  );
  console.error(scrubbed || "Harness failed.");
  process.exitCode = 1;
});
