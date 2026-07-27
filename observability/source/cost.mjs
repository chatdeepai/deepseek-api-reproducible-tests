function requireTokenCount(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a nonnegative safe integer.`);
  }
  return value;
}

function decimalRateToPicoUsdPerToken(value) {
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

export function estimateUsageCost({ model, usage, pricingSnapshot }) {
  const modelRates = pricingSnapshot?.models?.[model];
  if (!modelRates) {
    return {
      status: "unsupported_model",
      snapshot_id: pricingSnapshot?.snapshot_id ?? "unknown",
      estimated_cost_usd: null,
    };
  }

  const promptTokens = requireTokenCount(usage.prompt_tokens, "prompt_tokens");
  const completionTokens = requireTokenCount(
    usage.completion_tokens,
    "completion_tokens",
  );
  const totalTokens = requireTokenCount(usage.total_tokens, "total_tokens");
  const cacheHitTokens = requireTokenCount(
    usage.prompt_cache_hit_tokens,
    "prompt_cache_hit_tokens",
  );
  const cacheMissTokens = requireTokenCount(
    usage.prompt_cache_miss_tokens,
    "prompt_cache_miss_tokens",
  );
  const reasoningTokens = requireTokenCount(
    usage.reasoning_tokens ?? 0,
    "reasoning_tokens",
  );

  if (
    cacheHitTokens + cacheMissTokens !== promptTokens ||
    promptTokens + completionTokens !== totalTokens ||
    reasoningTokens > completionTokens
  ) {
    return {
      status: "invalid_usage",
      snapshot_id: pricingSnapshot.snapshot_id,
      estimated_cost_usd: null,
    };
  }

  const hitRate = decimalRateToPicoUsdPerToken(
    modelRates.input_cache_hit_per_million_usd,
  );
  const missRate = decimalRateToPicoUsdPerToken(
    modelRates.input_cache_miss_per_million_usd,
  );
  const outputRate = decimalRateToPicoUsdPerToken(
    modelRates.output_per_million_usd,
  );

  const totalPicoUsd =
    BigInt(cacheHitTokens) * hitRate +
    BigInt(cacheMissTokens) * missRate +
    BigInt(completionTokens) * outputRate;

  return {
    status: "estimated",
    snapshot_id: pricingSnapshot.snapshot_id,
    currency: pricingSnapshot.currency,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    prompt_cache_hit_tokens: cacheHitTokens,
    prompt_cache_miss_tokens: cacheMissTokens,
    reasoning_tokens: reasoningTokens,
    reasoning_tokens_already_in_completion: true,
    estimated_cost_usd: formatPicoUsd(totalPicoUsd),
  };
}

export function addUsdDecimalStrings(values) {
  let picoUsd = 0n;
  for (const value of values) {
    if (typeof value !== "string" || !/^\d+\.\d{12}$/.test(value)) {
      throw new Error("Cost values must use twelve decimal places.");
    }
    const [whole, fraction] = value.split(".");
    picoUsd += BigInt(whole) * 1_000_000_000_000n + BigInt(fraction);
  }
  return formatPicoUsd(picoUsd);
}
