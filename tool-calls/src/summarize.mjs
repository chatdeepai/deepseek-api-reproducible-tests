function safeCounter(value) {
  return Number.isFinite(value) && value >= 0 ? Number(value) : 0;
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  const index = Math.max(0, Math.ceil(fraction * sorted.length) - 1);
  return sorted[index];
}

export function summarizeTurns(turns) {
  if (!Array.isArray(turns)) {
    throw new TypeError("turns must be an array.");
  }

  const totals = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    promptCacheHitTokens: 0,
    promptCacheMissTokens: 0
  };
  const timings = [];

  for (const turn of turns) {
    const usage = turn?.usage ?? {};
    totals.promptTokens += safeCounter(usage.prompt_tokens);
    totals.completionTokens += safeCounter(usage.completion_tokens);
    totals.totalTokens += safeCounter(usage.total_tokens);
    totals.promptCacheHitTokens += safeCounter(usage.prompt_cache_hit_tokens);
    totals.promptCacheMissTokens += safeCounter(usage.prompt_cache_miss_tokens);
    if (Number.isFinite(turn?.elapsedMs) && turn.elapsedMs >= 0) {
      timings.push(Number(turn.elapsedMs));
    }
  }

  timings.sort((left, right) => left - right);
  const timingSum = timings.reduce((sum, value) => sum + value, 0);
  const middle = Math.floor(timings.length / 2);
  const median =
    timings.length === 0
      ? null
      : timings.length % 2 === 1
        ? timings[middle]
        : (timings[middle - 1] + timings[middle]) / 2;

  return Object.freeze({
    turnCount: turns.length,
    usage: Object.freeze(totals),
    timingMs: Object.freeze({
      sampleCount: timings.length,
      min: timings.length > 0 ? timings[0] : null,
      median,
      p95: percentile(timings, 0.95),
      max: timings.length > 0 ? timings.at(-1) : null,
      mean:
        timings.length > 0
          ? Number((timingSum / timings.length).toFixed(3))
          : null
    })
  });
}
