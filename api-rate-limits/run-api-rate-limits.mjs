import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API_ORIGIN = "https://api.deepseek.com";
const MODELS_URL = `${API_ORIGIN}/models`;
const CHAT_COMPLETIONS_URL = `${API_ORIGIN}/chat/completions`;
const ALLOWED_MODELS = new Set([
  "deepseek-v4-flash",
  "deepseek-v4-pro",
]);
const COMPLETION_REQUEST_BUDGET = 12;
const INVENTORY_REQUEST_BUDGET = 1;
const MAX_LIVE_CONCURRENCY = 4;
const AUTOMATIC_LIVE_RETRIES = 0;
const MAX_OUTPUT_TOKENS = 8;
const REQUEST_TIMEOUT_MS = 90_000;
const TERMINATING_PROVIDER_STATUSES = new Set([429, 500, 503]);
const BASE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIRECTORY = join(BASE_DIRECTORY, "results");

const LIVE_COMPLETION_PLAN = Object.freeze([
  {
    id: "flash_control",
    group: "controls",
    execution: "sequential",
    model: "deepseek-v4-flash",
    stream: false,
    parser_observation: false,
  },
  {
    id: "pro_control",
    group: "controls",
    execution: "sequential",
    model: "deepseek-v4-pro",
    stream: false,
    parser_observation: false,
  },
  ...Array.from({ length: 4 }, (_, index) => ({
    id: `flash_sequential_${String(index + 1).padStart(2, "0")}`,
    group: "sequential_flash",
    execution: "sequential",
    model: "deepseek-v4-flash",
    stream: false,
    parser_observation: false,
  })),
  ...Array.from({ length: 4 }, (_, index) => ({
    id: `flash_concurrent_${String(index + 1).padStart(2, "0")}`,
    group: "concurrent_flash",
    execution: "concurrent_cap_4",
    model: "deepseek-v4-flash",
    stream: false,
    parser_observation: false,
  })),
  {
    id: "flash_nonstream_parser_observation",
    group: "parser_observations",
    execution: "sequential",
    model: "deepseek-v4-flash",
    stream: false,
    parser_observation: true,
  },
  {
    id: "flash_stream_parser_observation",
    group: "parser_observations",
    execution: "sequential",
    model: "deepseek-v4-flash",
    stream: true,
    parser_observation: true,
  },
]);

const SYNTHETIC_JOB_DURATIONS_MS = Object.freeze([
  90, 40, 160, 70, 120, 50,
  210, 80, 100, 60, 180, 30,
  140, 75, 110, 45, 240, 65,
  130, 55, 170, 85, 95, 35,
]);

const QUEUE_WORKER_CAPS = Object.freeze([1, 2, 4, 8]);
const RETRYABLE_OUTCOMES = new Set([
  "http_429",
  "http_500",
  "http_503",
  "network_timeout",
]);
const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 4_000;
const RETRY_MAX_ATTEMPTS = 3;
const DETERMINISTIC_JITTER_FRACTIONS = Object.freeze([
  0.5, 0.75, 0.625, 0.875,
]);

const RETRY_SCENARIOS = Object.freeze([
  {
    id: "rate_limit_then_success",
    outcomes: [
      { kind: "http_429", retry_after_ms: 1_200 },
      { kind: "http_429" },
      { kind: "http_200" },
    ],
  },
  {
    id: "server_overloaded_then_success",
    outcomes: [
      { kind: "http_503" },
      { kind: "http_200" },
    ],
  },
  {
    id: "server_error_then_success",
    outcomes: [
      { kind: "http_500" },
      { kind: "http_200" },
    ],
  },
  {
    id: "invalid_request_no_retry",
    outcomes: [
      { kind: "http_400" },
      { kind: "http_200" },
    ],
  },
  {
    id: "timeout_unknown_then_success",
    outcomes: [
      { kind: "network_timeout" },
      { kind: "http_200" },
    ],
  },
  {
    id: "cancelled_during_backoff",
    outcomes: [
      { kind: "http_503" },
      { kind: "cancelled" },
    ],
  },
]);

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function round(value, places = 3) {
  const multiplier = 10 ** places;
  return Math.round(value * multiplier) / multiplier;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Invariant failed: ${message}`);
  }
}

function isSuccessStatus(status) {
  return Number.isInteger(status) && status >= 200 && status < 300;
}

function isTerminatingStatus(status) {
  return TERMINATING_PROVIDER_STATUSES.has(status);
}

function fixedRequestBody(model, stream) {
  return {
    model,
    messages: [
      {
        role: "user",
        content: "Return exactly: OK",
      },
    ],
    thinking: { type: "disabled" },
    stream,
    max_tokens: MAX_OUTPUT_TOKENS,
  };
}

function validateLivePlan() {
  assert(
    new URL(MODELS_URL).origin === API_ORIGIN,
    "the inventory endpoint must use the fixed official origin",
  );
  assert(
    new URL(CHAT_COMPLETIONS_URL).origin === API_ORIGIN,
    "the completion endpoint must use the fixed official origin",
  );
  assert(
    new URL(MODELS_URL).pathname === "/models",
    "the only inventory endpoint must be /models",
  );
  assert(
    new URL(CHAT_COMPLETIONS_URL).pathname === "/chat/completions",
    "the only completion endpoint must be /chat/completions",
  );
  assert(
    INVENTORY_REQUEST_BUDGET === 1,
    "the inventory budget must be exactly one request",
  );
  assert(
    LIVE_COMPLETION_PLAN.length === COMPLETION_REQUEST_BUDGET,
    "the live plan must contain exactly 12 completions",
  );
  assert(
    COMPLETION_REQUEST_BUDGET <= 12,
    "the completion budget must not exceed 12",
  );
  assert(
    MAX_LIVE_CONCURRENCY <= 4,
    "live concurrency must not exceed four",
  );
  assert(
    AUTOMATIC_LIVE_RETRIES === 0,
    "automatic live retries must remain disabled",
  );
  assert(
    MAX_OUTPUT_TOKENS <= 8,
    "the output cap must not exceed eight tokens",
  );
  assert(
    [429, 500, 503].every((status) =>
      TERMINATING_PROVIDER_STATUSES.has(status)),
    "429, 500, and 503 must terminate later live work",
  );

  const identifiers = new Set();
  let streamCount = 0;
  let proCount = 0;
  const groupCounts = new Map();

  for (const scenario of LIVE_COMPLETION_PLAN) {
    assert(!identifiers.has(scenario.id), `duplicate scenario id ${scenario.id}`);
    identifiers.add(scenario.id);
    assert(
      ALLOWED_MODELS.has(scenario.model),
      `unsupported model in plan: ${scenario.model}`,
    );
    assert(
      typeof scenario.stream === "boolean",
      `${scenario.id} must specify a stream boolean`,
    );
    assert(
      ["sequential", "concurrent_cap_4"].includes(scenario.execution),
      `${scenario.id} uses an unsupported execution mode`,
    );
    assert(
      !/(flood|ceiling|induce|force_429|balance)/i.test(scenario.id),
      `${scenario.id} suggests a prohibited live test`,
    );
    if (scenario.stream) streamCount += 1;
    if (scenario.model === "deepseek-v4-pro") proCount += 1;
    groupCounts.set(
      scenario.group,
      (groupCounts.get(scenario.group) ?? 0) + 1,
    );
  }

  assert(streamCount === 1, "the plan must contain one streaming observation");
  assert(proCount === 1, "the plan must contain one minimal Pro control");
  assert(
    groupCounts.get("concurrent_flash") === MAX_LIVE_CONCURRENCY,
    "the concurrent batch must contain exactly four calls",
  );
  assert(
    [...groupCounts.values()].every((count) =>
      count <= COMPLETION_REQUEST_BUDGET),
    "no group may exceed the total completion budget",
  );

  return {
    valid: true,
    inventory_requests: INVENTORY_REQUEST_BUDGET,
    completion_requests: LIVE_COMPLETION_PLAN.length,
    total_http_requests: INVENTORY_REQUEST_BUDGET +
      LIVE_COMPLETION_PLAN.length,
    maximum_live_concurrency: MAX_LIVE_CONCURRENCY,
    automatic_live_retries: AUTOMATIC_LIVE_RETRIES,
    terminating_provider_statuses: [
      ...TERMINATING_PROVIDER_STATUSES,
    ],
    maximum_output_tokens: MAX_OUTPUT_TOKENS,
  };
}

function publicLivePlan() {
  return {
    evidence_type: "bounded_live_observation_plan",
    warning:
      "This plan does not test or validate the provider's documented concurrency ceilings.",
    endpoints: {
      inventory: MODELS_URL,
      chat_completions: CHAT_COMPLETIONS_URL,
    },
    limits: validateLivePlan(),
    fixed_prompt: "Return exactly: OK",
    thinking_mode: "disabled",
    execution_order: [
      "models_inventory",
      "controls",
      "sequential_flash",
      "concurrent_flash",
      "parser_observations",
    ],
    completion_plan: LIVE_COMPLETION_PLAN,
  };
}

function percentileNearestRank(values, percentile) {
  assert(values.length > 0, "percentile input must not be empty");
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(
    1,
    Math.ceil((percentile / 100) * sorted.length),
  );
  return sorted[rank - 1];
}

function observedPeakConcurrency(schedule) {
  const events = [];
  for (const job of schedule) {
    events.push({ time_ms: job.start_ms, delta: 1 });
    events.push({ time_ms: job.end_ms, delta: -1 });
  }
  events.sort((left, right) =>
    left.time_ms - right.time_ms || left.delta - right.delta);

  let active = 0;
  let peak = 0;
  for (const event of events) {
    active += event.delta;
    peak = Math.max(peak, active);
    assert(active >= 0, "active job count must never become negative");
  }
  assert(active === 0, "all synthetic jobs must complete");
  return peak;
}

function simulateQueue(workerCap) {
  assert(Number.isInteger(workerCap) && workerCap > 0, "invalid worker cap");
  const workerAvailability = Array(workerCap).fill(0);
  const schedule = [];

  SYNTHETIC_JOB_DURATIONS_MS.forEach((durationMs, index) => {
    let workerIndex = 0;
    for (let candidate = 1; candidate < workerAvailability.length; candidate += 1) {
      if (workerAvailability[candidate] < workerAvailability[workerIndex]) {
        workerIndex = candidate;
      }
    }

    const startMs = workerAvailability[workerIndex];
    const endMs = startMs + durationMs;
    workerAvailability[workerIndex] = endMs;
    schedule.push({
      job_id: `job_${String(index + 1).padStart(2, "0")}`,
      worker_id: `worker_${String(workerIndex + 1).padStart(2, "0")}`,
      arrival_ms: 0,
      duration_ms: durationMs,
      queue_wait_ms: startMs,
      start_ms: startMs,
      end_ms: endMs,
    });
  });

  const makespanMs = Math.max(...schedule.map((job) => job.end_ms));
  const totalServiceMs = schedule.reduce(
    (sum, job) => sum + job.duration_ms,
    0,
  );
  const peak = observedPeakConcurrency(schedule);
  const queueWaits = schedule.map((job) => job.queue_wait_ms);
  const completionOrder = [...schedule]
    .sort((left, right) =>
      left.end_ms - right.end_ms ||
      left.job_id.localeCompare(right.job_id))
    .map((job) => job.job_id);

  assert(schedule.length === 24, "each queue run must contain 24 jobs");
  assert(peak <= workerCap, "observed concurrency exceeded the worker cap");
  assert(
    new Set(schedule.map((job) => job.job_id)).size === 24,
    "every synthetic job must appear exactly once",
  );

  return {
    evidence_type: "offline_deterministic_queue_simulation",
    configured_worker_cap: workerCap,
    observed_peak_active_jobs: peak,
    cap_respected: peak <= workerCap,
    synthetic_job_count: schedule.length,
    total_service_ms: totalServiceMs,
    makespan_ms: makespanMs,
    queue_wait_p50_ms: percentileNearestRank(queueWaits, 50),
    queue_wait_p95_ms: percentileNearestRank(queueWaits, 95),
    mean_active_workers: round(totalServiceMs / makespanMs),
    completion_order: completionOrder,
    schedule,
  };
}

function deterministicRetryDelay({
  retryNumber,
  scenarioIndex,
  retryAfterMs,
}) {
  const exponentialCap = Math.min(
    RETRY_MAX_DELAY_MS,
    RETRY_BASE_DELAY_MS * (2 ** (retryNumber - 1)),
  );
  const fraction = DETERMINISTIC_JITTER_FRACTIONS[
    (scenarioIndex + retryNumber - 1) %
      DETERMINISTIC_JITTER_FRACTIONS.length
  ];
  const jitteredDelay = Math.floor(exponentialCap * fraction);
  return {
    exponential_cap_ms: exponentialCap,
    deterministic_jitter_fraction: fraction,
    jittered_delay_ms: jitteredDelay,
    simulated_retry_after_ms:
      Number.isFinite(retryAfterMs) ? retryAfterMs : null,
    selected_delay_ms: Math.max(retryAfterMs ?? 0, jitteredDelay),
  };
}

function simulateRetryScenario(scenario, scenarioIndex) {
  let virtualTimeMs = 0;
  const attempts = [];
  let terminalReason = "fixture_exhausted";

  for (
    let attemptIndex = 0;
    attemptIndex < scenario.outcomes.length &&
      attemptIndex < RETRY_MAX_ATTEMPTS;
    attemptIndex += 1
  ) {
    const outcome = scenario.outcomes[attemptIndex];
    const attemptNumber = attemptIndex + 1;
    const row = {
      attempt: attemptNumber,
      started_at_virtual_ms: virtualTimeMs,
      outcome: outcome.kind,
      retry_scheduled: false,
      delay: null,
    };
    attempts.push(row);

    if (outcome.kind === "http_200") {
      terminalReason = "success";
      break;
    }
    if (outcome.kind === "cancelled") {
      terminalReason = "cancelled";
      break;
    }
    if (!RETRYABLE_OUTCOMES.has(outcome.kind)) {
      terminalReason = "non_retryable_outcome";
      break;
    }
    if (attemptNumber >= RETRY_MAX_ATTEMPTS) {
      terminalReason = "retry_budget_exhausted";
      break;
    }

    const delay = deterministicRetryDelay({
      retryNumber: attemptNumber,
      scenarioIndex,
      retryAfterMs: outcome.retry_after_ms,
    });
    row.retry_scheduled = true;
    row.delay = delay;
    virtualTimeMs += delay.selected_delay_ms;
  }

  if (
    terminalReason === "fixture_exhausted" &&
    attempts.length >= RETRY_MAX_ATTEMPTS
  ) {
    terminalReason = "retry_budget_exhausted";
  }

  return {
    evidence_type: "offline_deterministic_retry_policy_simulation",
    scenario_id: scenario.id,
    policy: {
      maximum_attempts: RETRY_MAX_ATTEMPTS,
      base_delay_ms: RETRY_BASE_DELAY_MS,
      maximum_delay_ms: RETRY_MAX_DELAY_MS,
      automatic_live_retries: AUTOMATIC_LIVE_RETRIES,
      note:
        "The simulated policy does not execute provider calls or wait in real time.",
    },
    terminal_reason: terminalReason,
    attempts,
    total_virtual_backoff_ms: virtualTimeMs,
  };
}

function parseNonStreamingJsonWithLeadingWhitespace(text) {
  const lines = String(text).split(/\r?\n/);
  let leadingBlankLineCount = 0;
  for (const line of lines) {
    if (line.trim() !== "") break;
    leadingBlankLineCount += 1;
  }
  const parsed = JSON.parse(text);
  return {
    parsed,
    leading_blank_line_count: leadingBlankLineCount,
    input_byte_count: Buffer.byteLength(text),
  };
}

function parseSseChunks(chunks) {
  let buffer = "";
  let keepAliveCommentCount = 0;
  let otherCommentCount = 0;
  let doneSeen = false;
  const dataPayloads = [];

  const processEvent = (eventText) => {
    const lines = eventText.split(/\r?\n/);
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith(":")) {
        if (line.trim() === ": keep-alive") {
          keepAliveCommentCount += 1;
        } else {
          otherCommentCount += 1;
        }
        continue;
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    if (dataLines.length === 0) return;
    const payload = dataLines.join("\n");
    if (payload === "[DONE]") {
      doneSeen = true;
      return;
    }
    dataPayloads.push(payload);
  };

  for (const chunk of chunks) {
    buffer += String(chunk).replaceAll("\r\n", "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const eventText = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      if (eventText !== "") processEvent(eventText);
      boundary = buffer.indexOf("\n\n");
    }
  }
  if (buffer.trim() !== "") processEvent(buffer);

  return {
    keep_alive_comment_count: keepAliveCommentCount,
    other_comment_count: otherCommentCount,
    data_event_count: dataPayloads.length,
    done_seen: doneSeen,
    data_payloads: dataPayloads,
    trailing_buffer_empty: buffer.trim() === "",
  };
}

function runParserFixtures() {
  const nonStreamingFixture =
    "\n\r\n   \n{\"ok\":true,\"source\":\"local_fixture\"}";
  const nonStreaming = parseNonStreamingJsonWithLeadingWhitespace(
    nonStreamingFixture,
  );
  assert(nonStreaming.leading_blank_line_count === 3,
    "the non-streaming fixture must contain three leading blank lines");
  assert(nonStreaming.parsed.ok === true,
    "the non-streaming fixture must parse as JSON");

  const streamingChunks = [
    ": keep",
    "-alive\n\n",
    "data: {\"delta\":\"O\"}\n\n: keep-alive\n",
    "\ndata: {\"delta\":\"K\"}\n\n",
    "data: [DONE]\n\n",
  ];
  const streaming = parseSseChunks(streamingChunks);
  const assembled = streaming.data_payloads
    .map((payload) => JSON.parse(payload).delta)
    .join("");
  assert(streaming.keep_alive_comment_count === 2,
    "the SSE fixture must parse two keep-alive comments");
  assert(streaming.data_event_count === 2,
    "the SSE fixture must parse two data events");
  assert(streaming.done_seen === true,
    "the SSE fixture must observe the DONE marker");
  assert(assembled === "OK",
    "the SSE fixture must reconstruct the local payload");

  return {
    evidence_type: "offline_local_parser_fixtures",
    nonstreaming_blank_line_fixture: {
      leading_blank_line_count: nonStreaming.leading_blank_line_count,
      parsed_ok: nonStreaming.parsed.ok === true,
      parsed_source: nonStreaming.parsed.source,
      input_byte_count: nonStreaming.input_byte_count,
    },
    streaming_sse_keep_alive_fixture: {
      input_chunk_count: streamingChunks.length,
      keep_alive_comment_count: streaming.keep_alive_comment_count,
      other_comment_count: streaming.other_comment_count,
      data_event_count: streaming.data_event_count,
      done_seen: streaming.done_seen,
      reconstructed_local_payload: assembled,
    },
  };
}

function buildOfflineEvidence() {
  const queueBenchmarks = QUEUE_WORKER_CAPS.map(simulateQueue);
  const retrySimulations = RETRY_SCENARIOS.map(simulateRetryScenario);
  const parserFixtures = runParserFixtures();

  assert(
    queueBenchmarks.every((benchmark) => benchmark.cap_respected),
    "every queue benchmark must respect its configured cap",
  );
  assert(
    queueBenchmarks.every((benchmark) =>
      benchmark.synthetic_job_count === 24),
    "every queue benchmark must schedule 24 jobs",
  );
  assert(
    retrySimulations.find((row) =>
      row.scenario_id === "invalid_request_no_retry")
      ?.attempts.length === 1,
    "HTTP 400 must not be retried by the simulated policy",
  );
  assert(
    retrySimulations.find((row) =>
      row.scenario_id === "rate_limit_then_success")
      ?.terminal_reason === "success",
    "the bounded 429 fixture must terminate in simulated success",
  );

  return {
    schema_version: "1.0.0",
    evidence_type: "offline_deterministic_simulation",
    provider_requests_made: 0,
    api_key_read: false,
    warning:
      "These results are local simulations and must not be presented as DeepSeek provider observations.",
    queue_benchmarks: queueBenchmarks,
    retry_policy_simulations: retrySimulations,
    parser_fixtures: parserFixtures,
  };
}

function publicOfflineValidationSummary(evidence) {
  return {
    valid: true,
    provider_requests_made: evidence.provider_requests_made,
    queue_worker_caps: evidence.queue_benchmarks.map((row) =>
      row.configured_worker_cap),
    jobs_per_queue_run: evidence.queue_benchmarks[0].synthetic_job_count,
    queue_caps_respected: evidence.queue_benchmarks.every((row) =>
      row.cap_respected),
    retry_scenario_count: evidence.retry_policy_simulations.length,
    nonstreaming_blank_lines_parsed:
      evidence.parser_fixtures.nonstreaming_blank_line_fixture
        .leading_blank_line_count,
    streaming_keep_alive_comments_parsed:
      evidence.parser_fixtures.streaming_sse_keep_alive_fixture
        .keep_alive_comment_count,
    streaming_payload_reconstructed:
      evidence.parser_fixtures.streaming_sse_keep_alive_fixture
        .reconstructed_local_payload,
  };
}

async function fetchWithDeadline(url, options) {
  const started = performance.now();
  const response = await fetch(url, {
    ...options,
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return {
    response,
    started,
    headersReceived: performance.now(),
  };
}

function publicUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const numeric = (key) =>
    Number.isFinite(usage[key]) ? usage[key] : null;
  return {
    prompt_tokens: numeric("prompt_tokens"),
    completion_tokens: numeric("completion_tokens"),
    reasoning_tokens:
      Number.isFinite(usage.completion_tokens_details?.reasoning_tokens)
        ? usage.completion_tokens_details.reasoning_tokens
        : null,
    total_tokens: numeric("total_tokens"),
    prompt_cache_hit_tokens: numeric("prompt_cache_hit_tokens"),
    prompt_cache_miss_tokens: numeric("prompt_cache_miss_tokens"),
  };
}

function publicResponseMetadata(response, elapsedMs) {
  return {
    http_status: response.status,
    elapsed_ms: round(elapsedMs),
    content_type: response.headers.get("content-type"),
    retry_after_present: response.headers.has("retry-after"),
    redirect_location_present: response.headers.has("location"),
  };
}

function leadingBlankLineCount(text) {
  let count = 0;
  for (const line of String(text).split(/\r?\n/)) {
    if (line.trim() !== "") break;
    count += 1;
  }
  return count;
}

async function executeModelsInventory(apiKey) {
  const { response, started } = await fetchWithDeadline(MODELS_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  const elapsedMs = performance.now() - started;
  let modelIds = [];
  if (isSuccessStatus(response.status)) {
    try {
      const body = JSON.parse(text);
      modelIds = Array.isArray(body?.data)
        ? body.data
          .map((entry) => entry?.id)
          .filter((id) => typeof id === "string")
        : [];
    } catch {
      modelIds = [];
    }
  }
  return {
    evidence_type: "bounded_live_provider_observation",
    test_id: "models_inventory",
    method: "GET",
    endpoint: "/models",
    ...publicResponseMetadata(response, elapsedMs),
    returned_public_model_ids: modelIds,
    response_body_bytes: Buffer.byteLength(text),
    response_body_sha256: sha256(text),
    stop_required:
      isTerminatingStatus(response.status) ||
      !isSuccessStatus(response.status),
  };
}

async function executeNonStreamingCompletion(scenario, apiKey) {
  const body = fixedRequestBody(scenario.model, false);
  const { response, started } = await fetchWithDeadline(
    CHAT_COMPLETIONS_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const text = await response.text();
  const elapsedMs = performance.now() - started;
  let returnedModel = null;
  let finishReason = null;
  let contentLength = null;
  let contentSha256 = null;
  let usage = null;

  if (isSuccessStatus(response.status)) {
    try {
      const parsed = JSON.parse(text);
      returnedModel =
        typeof parsed?.model === "string" ? parsed.model : null;
      finishReason =
        typeof parsed?.choices?.[0]?.finish_reason === "string"
          ? parsed.choices[0].finish_reason
          : null;
      const content = parsed?.choices?.[0]?.message?.content;
      if (typeof content === "string") {
        contentLength = content.length;
        contentSha256 = sha256(content);
      }
      usage = publicUsage(parsed?.usage);
    } catch {
      // Parsing failure is represented through null structured fields and
      // the response-body byte count and hash below.
    }
  }

  return {
    evidence_type: "bounded_live_provider_observation",
    test_id: scenario.id,
    group: scenario.group,
    execution: scenario.execution,
    method: "POST",
    endpoint: "/chat/completions",
    requested_model: scenario.model,
    requested_stream: false,
    requested_thinking_mode: "disabled",
    requested_max_tokens: MAX_OUTPUT_TOKENS,
    ...publicResponseMetadata(response, elapsedMs),
    returned_model: returnedModel,
    finish_reason: finishReason,
    usage,
    generated_content_length: contentLength,
    generated_content_sha256: contentSha256,
    response_body_bytes: Buffer.byteLength(text),
    response_body_sha256: sha256(text),
    leading_empty_line_count: leadingBlankLineCount(text),
    stop_required:
      isTerminatingStatus(response.status) ||
      !isSuccessStatus(response.status),
  };
}

async function executeStreamingCompletion(scenario, apiKey) {
  const body = fixedRequestBody(scenario.model, true);
  const { response, started, headersReceived } =
    await fetchWithDeadline(CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
    });

  const decoder = new TextDecoder();
  const chunks = [];
  let responseBytes = 0;
  let firstBodyChunkMs = null;
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (firstBodyChunkMs === null) {
        firstBodyChunkMs = performance.now() - started;
      }
      responseBytes += value.byteLength;
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
  }
  const elapsedMs = performance.now() - started;
  const parsed = parseSseChunks(chunks);
  const dataPayloadDigest = sha256(parsed.data_payloads.join("\n"));

  return {
    evidence_type: "bounded_live_provider_observation",
    test_id: scenario.id,
    group: scenario.group,
    execution: scenario.execution,
    method: "POST",
    endpoint: "/chat/completions",
    requested_model: scenario.model,
    requested_stream: true,
    requested_thinking_mode: "disabled",
    requested_max_tokens: MAX_OUTPUT_TOKENS,
    ...publicResponseMetadata(response, elapsedMs),
    headers_received_ms: round(headersReceived - started),
    first_body_chunk_ms:
      firstBodyChunkMs === null ? null : round(firstBodyChunkMs),
    sse_keep_alive_comment_count: parsed.keep_alive_comment_count,
    sse_other_comment_count: parsed.other_comment_count,
    sse_data_event_count: parsed.data_event_count,
    sse_done_seen: parsed.done_seen,
    sse_data_payload_sha256: dataPayloadDigest,
    response_body_bytes: responseBytes,
    stop_required:
      isTerminatingStatus(response.status) ||
      !isSuccessStatus(response.status),
  };
}

async function executeCompletion(scenario, apiKey) {
  if (scenario.stream) {
    return executeStreamingCompletion(scenario, apiKey);
  }
  return executeNonStreamingCompletion(scenario, apiKey);
}

function safeTransportFailure(testId, group, execution, error) {
  return {
    evidence_type: "bounded_live_provider_observation",
    test_id: testId,
    group,
    execution,
    http_status: null,
    transport_failure: true,
    transport_error_name:
      typeof error?.name === "string" ? error.name : "Error",
    stop_required: true,
  };
}

async function writeLiveArtifact(artifact) {
  await mkdir(RESULTS_DIRECTORY, { recursive: true });
  const timestamp = artifact.started_at_utc
    .replaceAll(":", "")
    .replaceAll("-", "")
    .replace(".", "-");
  const filename = `live-observations-${timestamp}-${artifact.run_id}.json`;
  const outputPath = join(RESULTS_DIRECTORY, filename);
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return join("results", filename);
}

async function executeLivePlan() {
  validateLivePlan();
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new Error(
      "DEEPSEEK_API_KEY is required only for --execute. No request was sent.",
    );
  }

  const artifact = {
    schema_version: "1.0.0",
    evidence_type: "bounded_live_provider_observations",
    warning:
      "This small run does not validate provider concurrency ceilings or universal latency.",
    run_id: randomBytes(6).toString("hex"),
    started_at_utc: new Date().toISOString(),
    completed_at_utc: null,
    safety_contract: validateLivePlan(),
    models_inventory: null,
    completion_observations: [],
    observed_peak_completion_requests_in_flight: 0,
    aborted_before_plan_end: false,
    abort_reason: null,
  };

  let activeCompletionRequests = 0;
  const runOne = async (scenario) => {
    activeCompletionRequests += 1;
    artifact.observed_peak_completion_requests_in_flight = Math.max(
      artifact.observed_peak_completion_requests_in_flight,
      activeCompletionRequests,
    );
    try {
      return await executeCompletion(scenario, apiKey);
    } catch (error) {
      return safeTransportFailure(
        scenario.id,
        scenario.group,
        scenario.execution,
        error,
      );
    } finally {
      activeCompletionRequests -= 1;
    }
  };

  const terminateIfNeeded = (observations) => {
    const terminal = observations.find((row) => row.stop_required);
    if (!terminal) return false;
    artifact.aborted_before_plan_end = true;
    artifact.abort_reason = terminal.http_status === null
      ? "transport_failure"
      : `http_status_${terminal.http_status}`;
    return true;
  };

  try {
    try {
      artifact.models_inventory = await executeModelsInventory(apiKey);
    } catch (error) {
      artifact.models_inventory = safeTransportFailure(
        "models_inventory",
        "inventory",
        "sequential",
        error,
      );
    }
    if (terminateIfNeeded([artifact.models_inventory])) return artifact;

    const controlsAndSequential = LIVE_COMPLETION_PLAN.filter((scenario) =>
      ["controls", "sequential_flash"].includes(scenario.group));
    for (const scenario of controlsAndSequential) {
      const observation = await runOne(scenario);
      artifact.completion_observations.push(observation);
      if (terminateIfNeeded([observation])) return artifact;
    }

    const concurrentGroup = LIVE_COMPLETION_PLAN.filter((scenario) =>
      scenario.group === "concurrent_flash");
    assert(
      concurrentGroup.length <= MAX_LIVE_CONCURRENCY,
      "concurrent group exceeds the live cap",
    );
    const concurrentObservations = await Promise.all(
      concurrentGroup.map(runOne),
    );
    artifact.completion_observations.push(...concurrentObservations);
    if (terminateIfNeeded(concurrentObservations)) return artifact;

    const parserObservations = LIVE_COMPLETION_PLAN.filter((scenario) =>
      scenario.group === "parser_observations");
    for (const scenario of parserObservations) {
      const observation = await runOne(scenario);
      artifact.completion_observations.push(observation);
      if (terminateIfNeeded([observation])) return artifact;
    }
    return artifact;
  } finally {
    artifact.completed_at_utc = new Date().toISOString();
    const outputPath = await writeLiveArtifact(artifact);
    console.log(JSON.stringify({
      evidence_type: artifact.evidence_type,
      output_file: outputPath,
      models_inventory_status: artifact.models_inventory?.http_status ?? null,
      completion_observations:
        artifact.completion_observations.length,
      observed_peak_completion_requests_in_flight:
        artifact.observed_peak_completion_requests_in_flight,
      aborted_before_plan_end: artifact.aborted_before_plan_end,
      abort_reason: artifact.abort_reason,
      api_key_persisted_or_printed: false,
    }, null, 2));
  }
}

function printUsage() {
  console.log([
    "DeepSeek API Rate Limits reproducibility harness",
    "",
    "Safe, offline commands:",
    "  node run-api-rate-limits.mjs --validate-plan",
    "  node run-api-rate-limits.mjs --validate-offline",
    "  node run-api-rate-limits.mjs --plan",
    "  node run-api-rate-limits.mjs --simulate",
    "",
    "Explicit bounded live mode:",
    "  node run-api-rate-limits.mjs --execute",
    "",
    "No mode reads a key or contacts a provider except --execute.",
  ].join("\n"));
}

async function main() {
  const [mode, ...extraArguments] = process.argv.slice(2);
  if (extraArguments.length > 0) {
    throw new Error("Unexpected arguments. Use exactly one documented mode.");
  }

  switch (mode) {
    case "--validate-plan":
      console.log(JSON.stringify(validateLivePlan(), null, 2));
      return;
    case "--validate-offline": {
      const evidence = buildOfflineEvidence();
      console.log(JSON.stringify(
        publicOfflineValidationSummary(evidence),
        null,
        2,
      ));
      return;
    }
    case "--plan":
      console.log(JSON.stringify(publicLivePlan(), null, 2));
      return;
    case "--simulate":
      console.log(JSON.stringify(buildOfflineEvidence(), null, 2));
      return;
    case "--execute": {
      const result = await executeLivePlan();
      if (result.aborted_before_plan_end) process.exitCode = 2;
      return;
    }
    case undefined:
    case "--help":
      printUsage();
      return;
    default:
      throw new Error(`Unknown mode: ${mode}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unknown failure");
  process.exitCode = 1;
});
