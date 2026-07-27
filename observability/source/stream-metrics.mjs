import { isSafeFinishReason } from "./redaction.mjs";

const EVENT_KEYS = new Set([
  "type",
  "at_ms",
  "delta_chars",
  "network_bytes",
  "finish_reason",
]);

const EVENT_TYPES = new Set([
  "network_chunk",
  "json_event",
  "content_delta",
  "reasoning_delta",
  "usage",
  "finish",
]);

function requireOffset(value) {
  if (!Number.isInteger(value) || value < 0 || value > 86_400_000) {
    throw new Error("A stream offset must be a bounded nonnegative integer.");
  }
  return value;
}

function requireCount(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 100_000_000) {
    throw new Error(`${name} must be a bounded nonnegative integer.`);
  }
  return value;
}

export class StreamMetrics {
  #lastAt = 0;
  #closed = false;
  #networkChunkCount = 0;
  #jsonEventCount = 0;
  #contentDeltaCount = 0;
  #reasoningDeltaCount = 0;
  #contentChars = 0;
  #reasoningChars = 0;
  #firstNetworkChunk = null;
  #firstJsonEvent = null;
  #firstContent = null;
  #usageSeen = false;
  #finishReason = null;
  #maxGap = 0;
  #duration = null;

  record(event) {
    if (this.#closed) throw new Error("The stream is already closed.");
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      throw new Error("A stream event must be an object.");
    }
    for (const key of Object.keys(event)) {
      if (!EVENT_KEYS.has(key)) {
        throw new Error("Raw stream fields are not accepted.");
      }
    }
    if (!EVENT_TYPES.has(event.type)) {
      throw new Error("The stream event type is not allowlisted.");
    }

    const atMs = requireOffset(event.at_ms);
    if (atMs < this.#lastAt) {
      throw new Error("Stream events must be monotonic.");
    }
    this.#maxGap = Math.max(this.#maxGap, atMs - this.#lastAt);
    this.#lastAt = atMs;

    if (event.type === "network_chunk") {
      requireCount(event.network_bytes ?? 0, "network_bytes");
      this.#networkChunkCount += 1;
      this.#firstNetworkChunk ??= atMs;
    } else if (event.type === "json_event") {
      this.#jsonEventCount += 1;
      this.#firstJsonEvent ??= atMs;
    } else if (event.type === "content_delta") {
      this.#contentDeltaCount += 1;
      this.#contentChars += requireCount(
        event.delta_chars ?? 0,
        "delta_chars",
      );
      this.#firstContent ??= atMs;
    } else if (event.type === "reasoning_delta") {
      this.#reasoningDeltaCount += 1;
      this.#reasoningChars += requireCount(
        event.delta_chars ?? 0,
        "delta_chars",
      );
    } else if (event.type === "usage") {
      this.#usageSeen = true;
    } else if (event.type === "finish") {
      if (!isSafeFinishReason(event.finish_reason)) {
        throw new Error("The finish reason is not allowlisted.");
      }
      this.#finishReason = event.finish_reason;
    }
  }

  close(atMs) {
    const offset = requireOffset(atMs);
    if (offset < this.#lastAt) {
      throw new Error("The close offset must be monotonic.");
    }
    if (!this.#finishReason) {
      throw new Error("A terminal finish event is required.");
    }
    this.#closed = true;
    this.#duration = offset;
    return this.summary();
  }

  summary() {
    if (!this.#closed) {
      throw new Error("The stream must close before it is summarized.");
    }
    return {
      network_chunk_count: this.#networkChunkCount,
      json_event_count: this.#jsonEventCount,
      content_delta_count: this.#contentDeltaCount,
      reasoning_delta_count: this.#reasoningDeltaCount,
      content_chars: this.#contentChars,
      reasoning_chars: this.#reasoningChars,
      time_to_first_network_chunk_ms: this.#firstNetworkChunk,
      time_to_first_json_event_ms: this.#firstJsonEvent,
      time_to_first_content_ms: this.#firstContent,
      maximum_inter_event_gap_ms: this.#maxGap,
      terminal_usage_present: this.#usageSeen,
      finish_reason: this.#finishReason,
      duration_ms: this.#duration,
      raw_chunks_retained: false,
    };
  }
}
