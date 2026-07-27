const SAFE_EVENTS = new Set([
  "created",
  "attempt_started",
  "headers_received",
  "stream_started",
  "retry_scheduled",
  "completed",
  "failed",
  "cancelled",
  "tool_requested",
  "tool_validated",
  "tool_authorized",
  "tool_executed",
  "tool_replayed",
]);

const SAFE_OUTCOMES = new Set([
  "success",
  "incomplete",
  "provider_error",
  "transport_error",
  "cancelled",
  "validation_failed",
  "skipped",
]);

const SAFE_FINISH_REASONS = new Set([
  "stop",
  "length",
  "content_filter",
  "tool_calls",
  "insufficient_system_resource",
]);

const SAFE_ERROR_CLASSES = new Set([
  "bad_request",
  "authentication",
  "insufficient_balance",
  "invalid_parameters",
  "rate_limited",
  "provider_server",
  "provider_overloaded",
  "timeout",
  "connection",
  "cancelled",
  "unknown",
]);

const REDACTION_PATTERNS = [
  {
    expression: /\bsk-[A-Za-z0-9_-]{8,}\b/gi,
    replacement: "[REDACTED_CREDENTIAL]",
  },
  {
    expression: /\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*\b/gi,
    replacement: "Bearer [REDACTED_CREDENTIAL]",
  },
  {
    expression: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[REDACTED_EMAIL]",
  },
  {
    expression:
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
    replacement: "[REDACTED_IDENTIFIER]",
  },
  {
    expression: /\bcorr_[A-Za-z0-9_-]{8,}\b/g,
    replacement: "[REDACTED_IDENTIFIER]",
  },
  {
    expression: /\b[A-Za-z]:\\(?:[^\\\s]+\\)*[^\\\s]*/g,
    replacement: "[REDACTED_PATH]",
  },
  {
    expression: /\/(?:Users|home)\/[^\s]+/g,
    replacement: "[REDACTED_PATH]",
  },
];

function boundedInteger(value, maximum = 86_400_000) {
  return Number.isInteger(value) && value >= 0 && value <= maximum
    ? value
    : undefined;
}

function safeToken(value, pattern) {
  return typeof value === "string" && pattern.test(value) ? value : undefined;
}

function safeStatus(value) {
  return Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
}

export function redactDiagnosticText(value) {
  let output = String(value);
  for (const item of REDACTION_PATTERNS) {
    output = output.replace(item.expression, item.replacement);
  }
  return output;
}

export function sanitizeLogRecord(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("A log record must be an object.");
  }

  const event = SAFE_EVENTS.has(input.event) ? input.event : undefined;
  if (!event) {
    throw new Error("The log event is not allowlisted.");
  }

  const record = {
    schema_version: 1,
    event,
    correlation_linked: Boolean(
      input.correlation_linked || input.correlation_id,
    ),
  };

  const routeAlias = safeToken(input.route_alias, /^[a-z0-9_-]{1,64}$/);
  const model = safeToken(input.model, /^[a-z0-9._-]{1,64}$/);
  const outcome = SAFE_OUTCOMES.has(input.outcome)
    ? input.outcome
    : undefined;
  const finishReason = SAFE_FINISH_REASONS.has(input.finish_reason)
    ? input.finish_reason
    : undefined;
  const errorClass = SAFE_ERROR_CLASSES.has(input.error_class)
    ? input.error_class
    : undefined;
  const toolAlias = safeToken(input.tool_alias, /^[a-z0-9_-]{1,64}$/);
  const attempt = boundedInteger(input.attempt, 100);
  const atMs = boundedInteger(input.at_ms);
  const durationMs = boundedInteger(input.duration_ms);
  const retryDelayMs = boundedInteger(input.retry_delay_ms, 300_000);
  const status = safeStatus(input.status);

  if (routeAlias !== undefined) record.route_alias = routeAlias;
  if (model !== undefined) record.model = model;
  if (outcome !== undefined) record.outcome = outcome;
  if (finishReason !== undefined) record.finish_reason = finishReason;
  if (errorClass !== undefined) record.error_class = errorClass;
  if (toolAlias !== undefined) record.tool_alias = toolAlias;
  if (attempt !== undefined) record.attempt = attempt;
  if (atMs !== undefined) record.at_ms = atMs;
  if (durationMs !== undefined) record.duration_ms = durationMs;
  if (retryDelayMs !== undefined) record.retry_delay_ms = retryDelayMs;
  if (status !== undefined) record.status = status;

  return record;
}

export function isSafeFinishReason(value) {
  return SAFE_FINISH_REASONS.has(value);
}
