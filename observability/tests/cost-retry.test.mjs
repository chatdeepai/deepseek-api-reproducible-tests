import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  addUsdDecimalStrings,
  estimateUsageCost,
} from "../source/cost.mjs";
import { classifyRetry, computeBackoffMs } from "../source/retry.mjs";

const pricing = JSON.parse(
  await readFile(
    new URL("../fixtures/pricing-snapshot.json", import.meta.url),
    "utf8",
  ),
);

test("cost estimate separates cache-hit, cache-miss, and output tokens", () => {
  const result = estimateUsageCost({
    model: "deepseek-v4-flash",
    pricingSnapshot: pricing,
    usage: {
      prompt_tokens: 3000,
      completion_tokens: 500,
      total_tokens: 3500,
      prompt_cache_hit_tokens: 1000,
      prompt_cache_miss_tokens: 2000,
      reasoning_tokens: 100,
    },
  });
  assert.equal(result.status, "estimated");
  assert.equal(result.estimated_cost_usd, "0.000422800000");
  assert.equal(result.reasoning_tokens_already_in_completion, true);
});

test("cost estimate fails closed when usage components do not reconcile", () => {
  const result = estimateUsageCost({
    model: "deepseek-v4-flash",
    pricingSnapshot: pricing,
    usage: {
      prompt_tokens: 20,
      completion_tokens: 5,
      total_tokens: 25,
      prompt_cache_hit_tokens: 8,
      prompt_cache_miss_tokens: 11,
      reasoning_tokens: 0,
    },
  });
  assert.equal(result.status, "invalid_usage");
  assert.equal(result.estimated_cost_usd, null);
});

test("cost estimate labels an unknown model instead of guessing", () => {
  const result = estimateUsageCost({
    model: "unknown-model",
    pricingSnapshot: pricing,
    usage: {},
  });
  assert.equal(result.status, "unsupported_model");
  assert.equal(result.estimated_cost_usd, null);
});

test("decimal cost aggregation is exact at twelve places", () => {
  assert.equal(
    addUsdDecimalStrings(["0.000000000001", "0.000000000009"]),
    "0.000000000010",
  );
});

test("retry classification separates transient, deterministic, abort, and side-effect states", () => {
  assert.deepEqual(
    classifyRetry({
      failureKind: "http",
      status: 429,
      attempt: 1,
      maxRetries: 2,
      idempotent: true,
    }),
    {
      category: "rate_limited",
      retryable: true,
      action: "schedule_backoff",
    },
  );
  assert.equal(
    classifyRetry({
      failureKind: "http",
      status: 400,
      attempt: 1,
      maxRetries: 2,
      idempotent: true,
    }).retryable,
    false,
  );
  assert.equal(
    classifyRetry({
      failureKind: "user_abort",
      attempt: 1,
      maxRetries: 2,
      idempotent: true,
    }).action,
    "propagate_cancellation",
  );
  assert.equal(
    classifyRetry({
      failureKind: "tool",
      attempt: 1,
      maxRetries: 2,
      idempotent: false,
      sideEffectState: "unknown",
    }).action,
    "reconcile_before_retry",
  );
});

test("retry classification respects the configured retry budget", () => {
  const result = classifyRetry({
    failureKind: "timeout",
    attempt: 1,
    maxRetries: 0,
    idempotent: true,
  });
  assert.equal(result.category, "retry_budget_exhausted");
  assert.equal(result.retryable, false);
});

test("backoff calculation is bounded and reproducible for a supplied sample", () => {
  assert.equal(
    computeBackoffMs({ retryNumber: 1, jitterSample: 0.5 }),
    250,
  );
  assert.equal(
    computeBackoffMs({ retryNumber: 2, jitterSample: 0.5 }),
    500,
  );
  assert.equal(
    computeBackoffMs({
      retryNumber: 1,
      retryAfterMs: 20_000,
      capMs: 10_000,
    }),
    10_000,
  );
});
