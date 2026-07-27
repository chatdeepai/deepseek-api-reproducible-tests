function rateToPicoUsdPerToken(value) {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,6})?$/.test(value)) {
    throw new Error("A pricing rate must be a decimal string.");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

function formatPicoUsd(value) {
  const whole = value / 1_000_000_000_000n;
  const fraction = (value % 1_000_000_000_000n)
    .toString()
    .padStart(12, "0");
  return `${whole}.${fraction}`;
}

function requireCount(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a nonnegative safe integer.`);
  }
  return value;
}

export function estimateCaseCost(model, usage, pricing) {
  const rates = pricing?.models?.[model];
  if (!rates) {
    return {
      status: "unsupported_model",
      estimated_cost_usd: null,
      snapshot_id: pricing?.snapshot_id ?? "unknown",
    };
  }
  const prompt = requireCount(usage.prompt_tokens, "prompt_tokens");
  const completion = requireCount(
    usage.completion_tokens,
    "completion_tokens",
  );
  const total = requireCount(usage.total_tokens, "total_tokens");
  const hit = requireCount(
    usage.prompt_cache_hit_tokens,
    "prompt_cache_hit_tokens",
  );
  const miss = requireCount(
    usage.prompt_cache_miss_tokens,
    "prompt_cache_miss_tokens",
  );
  const reasoning = requireCount(
    usage.reasoning_tokens ?? 0,
    "reasoning_tokens",
  );
  if (hit + miss !== prompt || prompt + completion !== total || reasoning > completion) {
    return {
      status: "invalid_usage",
      estimated_cost_usd: null,
      snapshot_id: pricing.snapshot_id,
    };
  }

  const picoUsd =
    BigInt(hit) *
      rateToPicoUsdPerToken(rates.input_cache_hit_per_million_usd) +
    BigInt(miss) *
      rateToPicoUsdPerToken(rates.input_cache_miss_per_million_usd) +
    BigInt(completion) *
      rateToPicoUsdPerToken(rates.output_per_million_usd);
  return {
    status: "estimated",
    snapshot_id: pricing.snapshot_id,
    currency: pricing.currency,
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: total,
    prompt_cache_hit_tokens: hit,
    prompt_cache_miss_tokens: miss,
    reasoning_tokens: reasoning,
    reasoning_tokens_already_in_completion: true,
    estimated_cost_usd: formatPicoUsd(picoUsd),
  };
}

function parseCost(value) {
  if (typeof value !== "string" || !/^\d+\.\d{12}$/.test(value)) {
    throw new Error("Cost values must use twelve decimal places.");
  }
  const [whole, fraction] = value.split(".");
  return BigInt(whole) * 1_000_000_000_000n + BigInt(fraction);
}

export function aggregateUsageCost(rows, pricing) {
  const variants = {};
  let overallCost = 0n;
  let overallPrompt = 0;
  let overallCompletion = 0;
  let overallTotal = 0;

  for (const row of rows) {
    const estimate = estimateCaseCost(row.model, row.usage, pricing);
    if (estimate.status !== "estimated") {
      throw new Error("A usage row could not be estimated.");
    }
    const variant = row.variant;
    variants[variant] ??= {
      case_count: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      estimated_cost_pico_usd: 0n,
    };
    const bucket = variants[variant];
    bucket.case_count += 1;
    bucket.prompt_tokens += estimate.prompt_tokens;
    bucket.completion_tokens += estimate.completion_tokens;
    bucket.total_tokens += estimate.total_tokens;
    bucket.estimated_cost_pico_usd += parseCost(
      estimate.estimated_cost_usd,
    );
    overallPrompt += estimate.prompt_tokens;
    overallCompletion += estimate.completion_tokens;
    overallTotal += estimate.total_tokens;
    overallCost += parseCost(estimate.estimated_cost_usd);
  }

  const publicVariants = Object.fromEntries(
    Object.entries(variants).map(([variant, bucket]) => [
      variant,
      {
        case_count: bucket.case_count,
        prompt_tokens: bucket.prompt_tokens,
        completion_tokens: bucket.completion_tokens,
        total_tokens: bucket.total_tokens,
        estimated_cost_usd: formatPicoUsd(bucket.estimated_cost_pico_usd),
      },
    ]),
  );

  return {
    snapshot_id: pricing.snapshot_id,
    currency: pricing.currency,
    variants: publicVariants,
    overall: {
      case_count: rows.length,
      prompt_tokens: overallPrompt,
      completion_tokens: overallCompletion,
      total_tokens: overallTotal,
      estimated_cost_usd: formatPicoUsd(overallCost),
    },
    estimate_not_bill: true,
  };
}
