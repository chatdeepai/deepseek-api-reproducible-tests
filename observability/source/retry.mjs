const RETRYABLE_STATUSES = new Set([408, 409, 429]);

export function classifyRetry({
  failureKind,
  status = null,
  attempt,
  maxRetries,
  idempotent,
  sideEffectState = "none",
}) {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error("attempt must be a positive integer.");
  }
  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new Error("maxRetries must be a nonnegative integer.");
  }

  if (failureKind === "user_abort") {
    return {
      category: "cancelled",
      retryable: false,
      action: "propagate_cancellation",
    };
  }

  if (
    sideEffectState === "unknown" ||
    sideEffectState === "possibly_committed"
  ) {
    return {
      category: "side_effect_uncertain",
      retryable: false,
      action: "reconcile_before_retry",
    };
  }

  if (!idempotent) {
    return {
      category: "non_idempotent",
      retryable: false,
      action: "stop",
    };
  }

  let category = "request_defect";
  let transient = false;
  if (failureKind === "timeout" || failureKind === "connection") {
    category = failureKind;
    transient = true;
  } else if (status === 429) {
    category = "rate_limited";
    transient = true;
  } else if (
    RETRYABLE_STATUSES.has(status) ||
    (Number.isInteger(status) && status >= 500)
  ) {
    category = "provider_transient";
    transient = true;
  }

  if (!transient) {
    return { category, retryable: false, action: "fix_or_surface" };
  }

  if (attempt > maxRetries) {
    return {
      category: "retry_budget_exhausted",
      retryable: false,
      action: "surface_failure",
    };
  }

  return { category, retryable: true, action: "schedule_backoff" };
}

export function computeBackoffMs({
  retryNumber,
  baseMs = 250,
  capMs = 10_000,
  jitterRatio = 0.2,
  jitterSample = 0.5,
  retryAfterMs = null,
}) {
  if (!Number.isInteger(retryNumber) || retryNumber < 1) {
    throw new Error("retryNumber must be a positive integer.");
  }
  if (
    !Number.isFinite(baseMs) ||
    baseMs <= 0 ||
    !Number.isFinite(capMs) ||
    capMs < baseMs ||
    !Number.isFinite(jitterRatio) ||
    jitterRatio < 0 ||
    jitterRatio > 1 ||
    !Number.isFinite(jitterSample) ||
    jitterSample < 0 ||
    jitterSample > 1
  ) {
    throw new Error("Backoff parameters are invalid.");
  }

  if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    return Math.min(capMs, Math.round(retryAfterMs));
  }

  const exponential = Math.min(capMs, baseMs * 2 ** (retryNumber - 1));
  const multiplier = 1 + jitterRatio * (2 * jitterSample - 1);
  return Math.min(capMs, Math.max(0, Math.round(exponential * multiplier)));
}
