import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-v4-flash";
const THINKING = Object.freeze({ type: "disabled" });
const MAX_OUTPUT_TOKENS = 24;
const REQUEST_TIMEOUT_MS = 120_000;
const REQUEST_BUDGET = 16;
const PREFIX_RECORDS = 96;
const DEFAULT_CACHE_SETTLE_MS = 6_000;
const BASE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_DIRECTORY = join(BASE_DIRECTORY, "results");

const TEST_PLAN = Object.freeze([
  {
    suite: "exact_extension",
    requests: 2,
    phases: ["warm", "extended_conversation"],
    interpretation:
      "The second request extends the first conversation and should expose any reusable prompt prefix through API-reported cache-token fields.",
  },
  {
    suite: "divergent_prefix",
    requests: 3,
    phases: ["A+B", "A+C", "A+D"],
    interpretation:
      "All three requests share the same long A prefix and diverge only in the short final instruction.",
  },
  {
    suite: "stable_vs_volatile_prefix",
    requests: 6,
    phases: [
      "stable_1",
      "stable_2",
      "stable_3",
      "volatile_1",
      "volatile_2",
      "volatile_3",
    ],
    interpretation:
      "Stable requests reuse an identical opening. Volatile requests change the first line before otherwise similar synthetic context.",
  },
  {
    suite: "user_id_isolation",
    requests: 5,
    phases: [
      "tenant_a_warm",
      "tenant_a_same_user_probe",
      "tenant_b_cross_user_probe",
      "tenant_b_same_user_probe",
      "tenant_a_return_probe",
    ],
    interpretation:
      "The same request body is observed under two synthetic user_id values. Only labels and hashes are persisted.",
  },
]);

const PLANNED_REQUESTS = TEST_PLAN.reduce(
  (sum, suite) => sum + suite.requests,
  0,
);

if (PLANNED_REQUESTS !== REQUEST_BUDGET) {
  throw new Error(
    `Internal request-plan error: planned ${PLANNED_REQUESTS}, budget ${REQUEST_BUDGET}.`,
  );
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function makeRunId() {
  return randomBytes(8).toString("hex");
}

function boundedInteger(value, fallback, minimum, maximum) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `Expected an integer from ${minimum} to ${maximum}; received ${String(value)}.`,
    );
  }
  return parsed;
}

function integerOrNull(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function sleep(milliseconds) {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function redact(value, apiKey) {
  let text = String(value ?? "");
  if (apiKey) {
    text = text.split(apiKey).join("[REDACTED_API_KEY]");
  }
  return text
    .replace(/Bearer\s+[^\s"',}]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_API_KEY]")
    .replace(
      /(DEEPSEEK_API_KEY\s*[=:]\s*)[^\s"',}]+/gi,
      "$1[REDACTED]",
    )
    .slice(0, 500);
}

function safeErrorField(value, apiKey) {
  if (value === null || value === undefined) return null;
  const redacted = redact(value, apiKey);
  return redacted || null;
}

function syntheticPrefix(runId, suiteLabel) {
  const vocabulary = [
    "amber",
    "birch",
    "cobalt",
    "delta",
    "ember",
    "frost",
    "granite",
    "harbor",
    "indigo",
    "juniper",
    "keystone",
    "lantern",
  ];
  const lines = [
    `SYNTHETIC CONTEXT CACHE BENCHMARK | run=${runId} | suite=${suiteLabel}`,
    "The following records are inert English test data. Do not infer personal information, browse, or call tools.",
    "Use this material only as a stable token prefix. The final instruction after the records controls the short answer.",
  ];

  for (let index = 1; index <= PREFIX_RECORDS; index += 1) {
    const first = vocabulary[index % vocabulary.length];
    const second = vocabulary[(index * 5) % vocabulary.length];
    const third = vocabulary[(index * 7) % vocabulary.length];
    lines.push(
      [
        `Synthetic record ${String(index).padStart(3, "0")}.`,
        `The ${first} unit coordinates with the ${second} unit under marker ${suiteLabel}.`,
        `Its fixed checksum word is ${third}.`,
        "This sentence is deliberately repetitive enough for a prefix-cache experiment and contains no user data.",
      ].join(" "),
    );
  }

  return lines.join("\n");
}

function requestBody(messages, userId) {
  const body = {
    model: MODEL,
    messages,
    thinking: THINKING,
    stream: false,
    max_tokens: MAX_OUTPUT_TOKENS,
  };
  if (userId !== undefined) body.user_id = userId;
  return body;
}

function requestHashes(body) {
  const withoutUserId = { ...body };
  delete withoutUserId.user_id;
  return {
    prompt_sha256: sha256(JSON.stringify(body.messages)),
    request_body_sha256: sha256(JSON.stringify(body)),
    request_body_sha256_without_user_id: sha256(
      JSON.stringify(withoutUserId),
    ),
  };
}

function userIdMetadata(userId, label) {
  if (userId === undefined) {
    return {
      user_id_supplied: false,
      user_id_label: label || "omitted",
      user_id_sha256: null,
    };
  }
  return {
    user_id_supplied: true,
    user_id_label: label || "synthetic",
    user_id_sha256: sha256(userId),
  };
}

function parsePayload(rawText) {
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function extractError(payload, responseStatus, apiKey) {
  if (responseStatus >= 200 && responseStatus < 300) {
    return {
      error_type: null,
      error_code: null,
      error_param: null,
      error_message: null,
    };
  }

  const error = payload?.error ?? payload ?? {};
  return {
    error_type: safeErrorField(error?.type, apiKey),
    error_code: safeErrorField(error?.code, apiKey),
    error_param: safeErrorField(error?.param, apiKey),
    error_message: safeErrorField(
      error?.message || `HTTP ${responseStatus}`,
      apiKey,
    ),
  };
}

class BoundedRunner {
  constructor({ apiKey, runId, cacheSettleMs }) {
    this.apiKey = apiKey;
    this.runId = runId;
    this.cacheSettleMs = cacheSettleMs;
    this.requestCount = 0;
    this.records = [];
  }

  async settle() {
    await sleep(this.cacheSettleMs);
  }

  async call({
    suite,
    variant,
    phase,
    repetition,
    messages,
    userId,
    userIdLabel,
    dependencyOk = true,
  }) {
    if (this.requestCount >= REQUEST_BUDGET) {
      throw new Error(
        `Request budget exhausted before ${suite}/${phase}. No request was sent.`,
      );
    }

    this.requestCount += 1;
    const requestNumber = this.requestCount;
    const body = requestBody(messages, userId);
    const hashes = requestHashes(body);
    const identity = userIdMetadata(userId, userIdLabel);
    const timestamp = new Date();
    const started = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error("Request timeout")),
      REQUEST_TIMEOUT_MS,
    );

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const rawText = await response.text();
      const completedAt = new Date();
      const latencyMs = Math.round(performance.now() - started);
      const payload = parsePayload(rawText);
      const usage = payload?.usage ?? {};
      const hitTokens = integerOrNull(usage.prompt_cache_hit_tokens);
      const missTokens = integerOrNull(usage.prompt_cache_miss_tokens);
      const promptTokens = integerOrNull(usage.prompt_tokens);
      const outputTokens = integerOrNull(usage.completion_tokens);
      const assistantContent =
        typeof payload?.choices?.[0]?.message?.content === "string"
          ? payload.choices[0].message.content
          : null;
      const record = {
        schema_version: "1.0",
        run_id: this.runId,
        request_number: requestNumber,
        suite,
        variant,
        phase,
        repetition,
        dependency_ok: Boolean(dependencyOk),
        timestamp_utc: timestamp.toISOString(),
        completed_at_utc: completedAt.toISOString(),
        http_status: response.status,
        http_ok: response.ok,
        requested_model: MODEL,
        model:
          typeof payload?.model === "string" ? payload.model : MODEL,
        latency_ms: latencyMs,
        prompt_tokens: promptTokens,
        prompt_cache_hit_tokens: hitTokens,
        prompt_cache_miss_tokens: missTokens,
        output_tokens: outputTokens,
        finish_reason:
          typeof payload?.choices?.[0]?.finish_reason === "string"
            ? payload.choices[0].finish_reason
            : null,
        usage_consistent:
          promptTokens !== null &&
          hitTokens !== null &&
          missTokens !== null
            ? promptTokens === hitTokens + missTokens
            : null,
        cache_hit_observed: hitTokens === null ? null : hitTokens > 0,
        response_sha256:
          assistantContent === null ? null : sha256(assistantContent),
        ...hashes,
        ...identity,
        ...extractError(payload, response.status, this.apiKey),
      };
      this.records.push(record);
      return { record, assistantContent };
    } catch (error) {
      const completedAt = new Date();
      const record = {
        schema_version: "1.0",
        run_id: this.runId,
        request_number: requestNumber,
        suite,
        variant,
        phase,
        repetition,
        dependency_ok: Boolean(dependencyOk),
        timestamp_utc: timestamp.toISOString(),
        completed_at_utc: completedAt.toISOString(),
        http_status: 0,
        http_ok: false,
        requested_model: MODEL,
        model: MODEL,
        latency_ms: Math.round(performance.now() - started),
        prompt_tokens: null,
        prompt_cache_hit_tokens: null,
        prompt_cache_miss_tokens: null,
        output_tokens: null,
        finish_reason: null,
        usage_consistent: null,
        cache_hit_observed: null,
        response_sha256: null,
        ...hashes,
        ...identity,
        error_type:
          error?.name === "AbortError" ? "request_timeout" : "network_error",
        error_code: null,
        error_param: null,
        error_message: safeErrorField(
          error?.message || "Network request failed",
          this.apiKey,
        ),
      };
      this.records.push(record);
      return { record, assistantContent: null };
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function runExactExtension(runner, runId) {
  const prefix = syntheticPrefix(runId, "exact-extension");
  const initialMessages = [
    {
      role: "system",
      content: prefix,
    },
    {
      role: "user",
      content: "Return exactly CACHE-WARM and nothing else.",
    },
  ];
  const warm = await runner.call({
    suite: "exact_extension",
    variant: "conversation_extension",
    phase: "warm",
    repetition: 1,
    messages: initialMessages,
  });

  await runner.settle();

  const assistantContent = warm.assistantContent || "CACHE-WARM";
  await runner.call({
    suite: "exact_extension",
    variant: "conversation_extension",
    phase: "extended_conversation",
    repetition: 2,
    dependencyOk: warm.record.http_ok,
    messages: [
      ...initialMessages,
      {
        role: "assistant",
        content: assistantContent,
      },
      {
        role: "user",
        content: "Return exactly CACHE-EXTENDED and nothing else.",
      },
    ],
  });
}

async function runDivergentPrefix(runner, runId) {
  const prefix = syntheticPrefix(runId, "divergent-A");
  const tails = [
    ["A+B", "Return exactly BRANCH-B and nothing else."],
    ["A+C", "Return exactly BRANCH-C and nothing else."],
    ["A+D", "Return exactly BRANCH-D and nothing else."],
  ];

  for (let index = 0; index < tails.length; index += 1) {
    const [phase, instruction] = tails[index];
    await runner.call({
      suite: "divergent_prefix",
      variant: "shared_A",
      phase,
      repetition: index + 1,
      messages: [
        {
          role: "system",
          content: prefix,
        },
        {
          role: "user",
          content: instruction,
        },
      ],
    });
    if (index < tails.length - 1) await runner.settle();
  }
}

async function runStableVsVolatile(runner, runId) {
  const stablePrefix = syntheticPrefix(runId, "stable-prefix");
  for (let repetition = 1; repetition <= 3; repetition += 1) {
    await runner.call({
      suite: "stable_vs_volatile_prefix",
      variant: "stable",
      phase: `stable_${repetition}`,
      repetition,
      messages: [
        {
          role: "system",
          content: stablePrefix,
        },
        {
          role: "user",
          content: `Return exactly STABLE-${repetition} and nothing else.`,
        },
      ],
    });
    if (repetition === 1) await runner.settle();
  }

  const volatileCore = syntheticPrefix(runId, "volatile-core");
  for (let repetition = 1; repetition <= 3; repetition += 1) {
    const volatilePrefix = [
      `VOLATILE FIRST LINE ${runId}-${repetition}`,
      volatileCore,
    ].join("\n");
    await runner.call({
      suite: "stable_vs_volatile_prefix",
      variant: "volatile",
      phase: `volatile_${repetition}`,
      repetition,
      messages: [
        {
          role: "system",
          content: volatilePrefix,
        },
        {
          role: "user",
          content: `Return exactly VOLATILE-${repetition} and nothing else.`,
        },
      ],
    });
  }
}

async function runUserIdIsolation(runner, runId) {
  const prefix = syntheticPrefix(runId, "user-id-isolation");
  const messages = [
    {
      role: "system",
      content: prefix,
    },
    {
      role: "user",
      content: "Return exactly ISOLATION-CHECK and nothing else.",
    },
  ];
  const tenantA = `cache-tenant-a-${runId}`;
  const tenantB = `cache-tenant-b-${runId}`;

  const tenantAWarm = await runner.call({
    suite: "user_id_isolation",
    variant: "tenant_a",
    phase: "tenant_a_warm",
    repetition: 1,
    messages,
    userId: tenantA,
    userIdLabel: "tenant_a",
  });
  await runner.settle();

  await runner.call({
    suite: "user_id_isolation",
    variant: "tenant_a",
    phase: "tenant_a_same_user_probe",
    repetition: 2,
    dependencyOk: tenantAWarm.record.http_ok,
    messages,
    userId: tenantA,
    userIdLabel: "tenant_a",
  });

  const tenantBCold = await runner.call({
    suite: "user_id_isolation",
    variant: "tenant_b",
    phase: "tenant_b_cross_user_probe",
    repetition: 1,
    dependencyOk: tenantAWarm.record.http_ok,
    messages,
    userId: tenantB,
    userIdLabel: "tenant_b",
  });
  await runner.settle();

  await runner.call({
    suite: "user_id_isolation",
    variant: "tenant_b",
    phase: "tenant_b_same_user_probe",
    repetition: 2,
    dependencyOk: tenantBCold.record.http_ok,
    messages,
    userId: tenantB,
    userIdLabel: "tenant_b",
  });

  await runner.call({
    suite: "user_id_isolation",
    variant: "tenant_a",
    phase: "tenant_a_return_probe",
    repetition: 3,
    dependencyOk: tenantAWarm.record.http_ok,
    messages,
    userId: tenantA,
    userIdLabel: "tenant_a",
  });
}

function average(values) {
  if (!values.length) return null;
  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}

function summarize(records) {
  const groups = new Map();
  for (const record of records) {
    const key = `${record.suite}::${record.variant}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  return [...groups.entries()].map(([key, rows]) => {
    const [suite, variant] = key.split("::");
    const numericHit = rows
      .map((row) => row.prompt_cache_hit_tokens)
      .filter(Number.isInteger);
    const numericMiss = rows
      .map((row) => row.prompt_cache_miss_tokens)
      .filter(Number.isInteger);
    const totalHit = numericHit.reduce((sum, value) => sum + value, 0);
    const totalMiss = numericMiss.reduce((sum, value) => sum + value, 0);
    return {
      suite,
      variant,
      calls: rows.length,
      http_200_calls: rows.filter((row) => row.http_status === 200).length,
      calls_with_observed_cache_hits: rows.filter(
        (row) => row.cache_hit_observed === true,
      ).length,
      average_latency_ms: average(
        rows.map((row) => row.latency_ms).filter(Number.isInteger),
      ),
      prompt_cache_hit_tokens:
        numericHit.length === rows.length ? totalHit : null,
      prompt_cache_miss_tokens:
        numericMiss.length === rows.length ? totalMiss : null,
      observed_cache_hit_ratio:
        totalHit + totalMiss > 0 ? totalHit / (totalHit + totalMiss) : null,
    };
  });
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const stringValue =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(stringValue)
    ? `"${stringValue.replace(/"/g, '""')}"`
    : stringValue;
}

function toCsv(records) {
  const headers = [
    "schema_version",
    "run_id",
    "request_number",
    "suite",
    "variant",
    "phase",
    "repetition",
    "dependency_ok",
    "timestamp_utc",
    "completed_at_utc",
    "http_status",
    "http_ok",
    "requested_model",
    "model",
    "latency_ms",
    "prompt_tokens",
    "prompt_cache_hit_tokens",
    "prompt_cache_miss_tokens",
    "output_tokens",
    "finish_reason",
    "usage_consistent",
    "cache_hit_observed",
    "prompt_sha256",
    "request_body_sha256",
    "request_body_sha256_without_user_id",
    "user_id_supplied",
    "user_id_label",
    "user_id_sha256",
    "response_sha256",
    "error_type",
    "error_code",
    "error_param",
    "error_message",
  ];
  return [
    headers.join(","),
    ...records.map((record) =>
      headers.map((header) => csvEscape(record[header])).join(","),
    ),
  ].join("\n");
}

async function saveResults({
  records,
  runId,
  startedAt,
  completedAt,
  cacheSettleMs,
  outputDirectory,
}) {
  await mkdir(outputDirectory, { recursive: true });
  const fileTimestamp = startedAt.replace(/[:.]/g, "-");
  const baseName = `context-caching-${fileTimestamp}-${runId}`;
  const jsonPath = join(outputDirectory, `${baseName}.json`);
  const csvPath = join(outputDirectory, `${baseName}.csv`);
  const latestJsonPath = join(outputDirectory, "latest.json");
  const latestCsvPath = join(outputDirectory, "latest.csv");
  const payload = {
    schema_version: "1.0",
    benchmark: "DeepSeek Context Caching Live-Test Harness",
    run_id: runId,
    started_at_utc: startedAt,
    completed_at_utc: completedAt,
    endpoint: API_URL,
    requested_model: MODEL,
    request_budget: REQUEST_BUDGET,
    requests_sent: records.length,
    configuration: {
      thinking: THINKING,
      stream: false,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      request_timeout_ms: REQUEST_TIMEOUT_MS,
      cache_settle_ms: cacheSettleMs,
      synthetic_prefix_records: PREFIX_RECORDS,
      automatic_retries: 0,
      execution_order: "sequential",
    },
    redaction: {
      api_key_persisted: false,
      raw_authorization_header_persisted: false,
      prompt_text_persisted: false,
      response_text_persisted: false,
      raw_response_body_persisted: false,
      raw_user_id_persisted: false,
    },
    test_plan: TEST_PLAN,
    interpretation_limits: [
      "Results describe one account, endpoint, model, payload set, and time window.",
      "Provider-managed cache construction and retention may vary between runs.",
      "A failed warm-up makes its dependent probe inconclusive.",
      "The user_id suite observes returned cache-token fields and does not inspect provider infrastructure.",
      "No request attempts to exhaust concurrency or intentionally produce a rate-limit error.",
    ],
    summary: summarize(records),
    results: records,
  };
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  const csv = `${toCsv(records)}\n`;

  await Promise.all([
    writeFile(jsonPath, json, "utf8"),
    writeFile(csvPath, csv, "utf8"),
    writeFile(latestJsonPath, json, "utf8"),
    writeFile(latestCsvPath, csv, "utf8"),
  ]);

  return { jsonPath, csvPath, latestJsonPath, latestCsvPath };
}

function planPayload(cacheSettleMs) {
  return {
    benchmark: "DeepSeek Context Caching Live-Test Harness",
    network_requests_will_be_sent: false,
    live_request_budget: REQUEST_BUDGET,
    endpoint_if_executed: API_URL,
    model_if_executed: MODEL,
    thinking_if_executed: THINKING,
    max_output_tokens_per_request: MAX_OUTPUT_TOKENS,
    cache_settle_ms_if_executed: cacheSettleMs,
    suites: TEST_PLAN,
  };
}

function printUsage(cacheSettleMs) {
  console.log(
    [
      "No API request was sent.",
      "",
      "Safe validation:",
      "  node --check run-context-caching.mjs",
      "  node run-context-caching.mjs --plan",
      "",
      "Explicit live execution:",
      "  set DEEPSEEK_API_KEY in the current process environment",
      "  node run-context-caching.mjs --execute",
      "",
      `Live request budget: ${REQUEST_BUDGET}`,
      `Cache settle delay: ${cacheSettleMs} ms`,
    ].join("\n"),
  );
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const cacheSettleMs = boundedInteger(
    process.env.DEEPSEEK_CACHE_SETTLE_MS,
    DEFAULT_CACHE_SETTLE_MS,
    0,
    30_000,
  );

  if (args.has("--plan")) {
    console.log(JSON.stringify(planPayload(cacheSettleMs), null, 2));
    return;
  }

  if (!args.has("--execute")) {
    printUsage(cacheSettleMs);
    return;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error(
      "DEEPSEEK_API_KEY is not set. No API request was sent.",
    );
  }

  const outputDirectory =
    process.env.DEEPSEEK_CACHE_OUTPUT_DIR || DEFAULT_OUTPUT_DIRECTORY;
  const runId = makeRunId();
  const startedAt = new Date().toISOString();
  const runner = new BoundedRunner({
    apiKey,
    runId,
    cacheSettleMs,
  });

  await runExactExtension(runner, runId);
  await runDivergentPrefix(runner, runId);
  await runStableVsVolatile(runner, runId);
  await runUserIdIsolation(runner, runId);

  if (runner.requestCount !== REQUEST_BUDGET) {
    throw new Error(
      `Internal request-count error: sent ${runner.requestCount}, expected ${REQUEST_BUDGET}.`,
    );
  }

  const completedAt = new Date().toISOString();
  const paths = await saveResults({
    records: runner.records,
    runId,
    startedAt,
    completedAt,
    cacheSettleMs,
    outputDirectory,
  });

  console.log(
    JSON.stringify(
      {
        completed: true,
        run_id: runId,
        requests_sent: runner.requestCount,
        request_budget: REQUEST_BUDGET,
        files: paths,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  const apiKey = process.env.DEEPSEEK_API_KEY || "";
  console.error(redact(error?.message || error, apiKey));
  process.exitCode = 1;
});
