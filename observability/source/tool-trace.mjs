const TOOL_ALIASES = new Map([
  ["lookup_synthetic_record", "tool_lookup_synthetic"],
]);

const PHASES = [
  "tool_requested",
  "tool_validated",
  "tool_authorized",
  "tool_executed",
  "tool_replayed",
];

const OUTCOMES = new Set(["pass", "denied", "failed", "skipped"]);

export class ToolTrace {
  #internalCorrelationId;
  #toolAlias;
  #events = [];
  #lastAt = 0;

  constructor({ internalCorrelationId, toolName }) {
    if (
      typeof internalCorrelationId !== "string" ||
      internalCorrelationId.length < 8
    ) {
      throw new Error("An internal correlation identifier is required.");
    }
    const alias = TOOL_ALIASES.get(toolName);
    if (!alias) throw new Error("The tool is not allowlisted.");
    this.#internalCorrelationId = internalCorrelationId;
    this.#toolAlias = alias;
  }

  record(event) {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      throw new Error("A tool trace event must be an object.");
    }
    const keys = Object.keys(event);
    if (keys.some((key) => !["phase", "outcome", "at_ms"].includes(key))) {
      throw new Error("Raw tool fields are not accepted.");
    }
    const expectedPhase = PHASES[this.#events.length];
    if (event.phase !== expectedPhase) {
      throw new Error("Tool trace phases must follow the safety sequence.");
    }
    if (!OUTCOMES.has(event.outcome)) {
      throw new Error("The tool trace outcome is not allowlisted.");
    }
    if (
      !Number.isInteger(event.at_ms) ||
      event.at_ms < this.#lastAt ||
      event.at_ms > 86_400_000
    ) {
      throw new Error("Tool trace offsets must be monotonic.");
    }

    this.#lastAt = event.at_ms;
    this.#events.push({
      phase: event.phase,
      outcome: event.outcome,
      at_ms: event.at_ms,
    });
  }

  summary() {
    const phases = this.#events.map((event) => event.phase);
    const outcomes = this.#events.map((event) => event.outcome);
    return {
      tool_alias: this.#toolAlias,
      phase_count: this.#events.length,
      phases,
      validation_passed:
        this.#events.find((event) => event.phase === "tool_validated")
          ?.outcome === "pass",
      authorization_passed:
        this.#events.find((event) => event.phase === "tool_authorized")
          ?.outcome === "pass",
      execution_outcome:
        this.#events.find((event) => event.phase === "tool_executed")?.outcome ??
        "skipped",
      trace_complete:
        phases.length === PHASES.length &&
        outcomes.every((outcome) => outcome === "pass"),
      duration_ms: this.#lastAt,
      correlation_linked: Boolean(this.#internalCorrelationId),
      provider_tool_call_id_stored: false,
      tool_arguments_stored: false,
      tool_result_stored: false,
    };
  }
}
