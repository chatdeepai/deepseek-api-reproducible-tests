import { sanitizeLogRecord, isSafeFinishReason } from "./redaction.mjs";

const TERMINAL_STATES = new Set(["completed", "failed", "cancelled"]);

function safeModel(value) {
  if (typeof value !== "string" || !/^[a-z0-9._-]{1,64}$/.test(value)) {
    throw new Error("The public model alias is invalid.");
  }
  return value;
}

function safeRoute(value) {
  if (typeof value !== "string" || !/^[a-z0-9_-]{1,64}$/.test(value)) {
    throw new Error("The route alias is invalid.");
  }
  return value;
}

function safeAt(value) {
  if (!Number.isInteger(value) || value < 0 || value > 86_400_000) {
    throw new Error("Lifecycle offsets must be bounded integers.");
  }
  return value;
}

export class RequestLifecycle {
  #internalCorrelationId;
  #routeAlias;
  #model;
  #state = "created";
  #events = [];
  #lastAt = 0;
  #attempts = 0;
  #retries = 0;
  #status = null;
  #outcome = null;
  #finishReason = null;
  #cost = null;
  #stream = null;
  #tool = null;

  constructor({ internalCorrelationId, routeAlias, model }) {
    if (
      typeof internalCorrelationId !== "string" ||
      internalCorrelationId.length < 8
    ) {
      throw new Error("An internal correlation identifier is required.");
    }
    this.#internalCorrelationId = internalCorrelationId;
    this.#routeAlias = safeRoute(routeAlias);
    this.#model = safeModel(model);
    this.#events.push(
      sanitizeLogRecord({
        event: "created",
        at_ms: 0,
        route_alias: this.#routeAlias,
        model: this.#model,
        correlation_id: this.#internalCorrelationId,
      }),
    );
  }

  #append(event, atMs) {
    const offset = safeAt(atMs);
    if (offset < this.#lastAt) {
      throw new Error("Lifecycle events must be monotonic.");
    }
    this.#lastAt = offset;
    this.#events.push(
      sanitizeLogRecord({
        ...event,
        at_ms: offset,
        route_alias: this.#routeAlias,
        model: this.#model,
        correlation_id: this.#internalCorrelationId,
      }),
    );
  }

  startAttempt(atMs) {
    if (!["created", "retry_wait"].includes(this.#state)) {
      throw new Error("An attempt cannot start from the current state.");
    }
    this.#attempts += 1;
    this.#state = "attempting";
    this.#append(
      { event: "attempt_started", attempt: this.#attempts },
      atMs,
    );
  }

  receiveHeaders({ status, atMs }) {
    if (this.#state !== "attempting") {
      throw new Error("Headers require an active attempt.");
    }
    if (!Number.isInteger(status) || status < 100 || status > 599) {
      throw new Error("The HTTP status is invalid.");
    }
    this.#status = status;
    this.#state = "headers";
    this.#append(
      { event: "headers_received", attempt: this.#attempts, status },
      atMs,
    );
  }

  startStream(atMs) {
    if (this.#state !== "headers") {
      throw new Error("Streaming requires received headers.");
    }
    this.#state = "streaming";
    this.#append(
      { event: "stream_started", attempt: this.#attempts },
      atMs,
    );
  }

  scheduleRetry({ atMs, delayMs, errorClass }) {
    if (!["attempting", "headers"].includes(this.#state)) {
      throw new Error("A retry cannot be scheduled from the current state.");
    }
    this.#retries += 1;
    this.#state = "retry_wait";
    this.#append(
      {
        event: "retry_scheduled",
        attempt: this.#attempts,
        retry_delay_ms: delayMs,
        error_class: errorClass,
      },
      atMs,
    );
  }

  attachCost(cost) {
    if (cost?.status !== "estimated") {
      throw new Error("Only a validated cost estimate can be attached.");
    }
    this.#cost = structuredClone(cost);
  }

  attachStream(stream) {
    if (!stream || typeof stream !== "object" || stream.raw_chunks_retained) {
      throw new Error("A sanitized stream summary is required.");
    }
    this.#stream = structuredClone(stream);
  }

  attachToolTrace(tool) {
    if (
      !tool ||
      typeof tool !== "object" ||
      tool.tool_arguments_stored ||
      tool.tool_result_stored ||
      tool.provider_tool_call_id_stored
    ) {
      throw new Error("A sanitized tool trace is required.");
    }
    this.#tool = structuredClone(tool);
  }

  complete({ atMs, finishReason }) {
    if (!["headers", "streaming"].includes(this.#state)) {
      throw new Error("Completion requires a provider response.");
    }
    if (!isSafeFinishReason(finishReason)) {
      throw new Error("The finish reason is not allowlisted.");
    }
    this.#finishReason = finishReason;
    this.#outcome =
      finishReason === "stop" || finishReason === "tool_calls"
        ? "success"
        : "incomplete";
    this.#state = "completed";
    this.#append(
      {
        event: "completed",
        attempt: this.#attempts,
        status: this.#status,
        outcome: this.#outcome,
        finish_reason: finishReason,
      },
      atMs,
    );
  }

  fail({ atMs, status = null, errorClass = "unknown" }) {
    if (TERMINAL_STATES.has(this.#state)) {
      throw new Error("The lifecycle is already terminal.");
    }
    this.#status = status;
    this.#outcome =
      status === null ? "transport_error" : "provider_error";
    this.#state = "failed";
    this.#append(
      {
        event: "failed",
        attempt: this.#attempts,
        status,
        outcome: this.#outcome,
        error_class: errorClass,
      },
      atMs,
    );
  }

  cancel(atMs) {
    if (TERMINAL_STATES.has(this.#state)) {
      throw new Error("The lifecycle is already terminal.");
    }
    this.#outcome = "cancelled";
    this.#state = "cancelled";
    this.#append(
      {
        event: "cancelled",
        attempt: this.#attempts,
        outcome: "cancelled",
        error_class: "cancelled",
      },
      atMs,
    );
  }

  summary() {
    if (!TERMINAL_STATES.has(this.#state)) {
      throw new Error("A nonterminal lifecycle cannot be summarized.");
    }
    return {
      schema_version: 1,
      route_alias: this.#routeAlias,
      model: this.#model,
      state: this.#state,
      outcome: this.#outcome,
      status: this.#status,
      finish_reason: this.#finishReason,
      attempt_count: this.#attempts,
      retry_count: this.#retries,
      duration_ms: this.#lastAt,
      correlation_linked: Boolean(this.#internalCorrelationId),
      lifecycle_events: structuredClone(this.#events),
      cost_estimate: this.#cost,
      stream_metrics: this.#stream,
      tool_trace: this.#tool,
      provider_request_id_stored: false,
      internal_correlation_id_stored: false,
    };
  }
}
