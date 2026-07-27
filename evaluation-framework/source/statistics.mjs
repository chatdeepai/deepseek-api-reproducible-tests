function round(value, places = 6) {
  return Number(value.toFixed(places));
}

export function wilsonInterval(successes, sampleSize, z = 1.96) {
  if (
    !Number.isInteger(successes) ||
    !Number.isInteger(sampleSize) ||
    sampleSize < 0 ||
    successes < 0 ||
    successes > sampleSize ||
    !Number.isFinite(z) ||
    z <= 0
  ) {
    throw new Error("Wilson interval inputs are invalid.");
  }
  if (sampleSize === 0) {
    return { estimate: null, low: null, high: null, sample_size: 0 };
  }
  const p = successes / sampleSize;
  const z2 = z ** 2;
  const denominator = 1 + z2 / sampleSize;
  const center = (p + z2 / (2 * sampleSize)) / denominator;
  const margin =
    (z *
      Math.sqrt(
        (p * (1 - p) + z2 / (4 * sampleSize)) / sampleSize,
      )) /
    denominator;
  return {
    estimate: round(p),
    low: round(Math.max(0, center - margin)),
    high: round(Math.min(1, center + margin)),
    sample_size: sampleSize,
  };
}

export function summarizeRate(successes, sampleSize) {
  const interval = wilsonInterval(successes, sampleSize);
  const width =
    interval.low === null ? null : round(interval.high - interval.low);
  return {
    successes,
    ...interval,
    interval_width: width,
    interpretation:
      sampleSize < 30 || (width !== null && width > 0.2)
        ? "small_sample_wide_interval"
        : "descriptive_interval",
  };
}

function combination(n, k) {
  if (k < 0 || k > n) return 0;
  const effective = Math.min(k, n - k);
  let value = 1;
  for (let index = 1; index <= effective; index += 1) {
    value = (value * (n - effective + index)) / index;
  }
  return value;
}

export function pairedSignTestPValue(wins, losses) {
  if (
    !Number.isInteger(wins) ||
    !Number.isInteger(losses) ||
    wins < 0 ||
    losses < 0
  ) {
    throw new Error("Paired sign-test counts are invalid.");
  }
  const discordant = wins + losses;
  if (discordant === 0) return 1;
  const tail = Math.min(wins, losses);
  let cumulative = 0;
  for (let value = 0; value <= tail; value += 1) {
    cumulative += combination(discordant, value) / 2 ** discordant;
  }
  return round(Math.min(1, 2 * cumulative));
}
