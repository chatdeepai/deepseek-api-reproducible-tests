function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(code) {
  return Object.freeze({ valid: false, code });
}

export function validateAssistantToolTurn(assistantMessage, { thinking }) {
  if (!isRecord(assistantMessage) || assistantMessage.role !== "assistant") {
    return failure("assistant_message_required");
  }
  if (!Array.isArray(assistantMessage.tool_calls) || assistantMessage.tool_calls.length === 0) {
    return failure("tool_calls_required");
  }
  if (
    thinking &&
    (typeof assistantMessage.reasoning_content !== "string" ||
      assistantMessage.reasoning_content.length === 0)
  ) {
    return failure("reasoning_content_required");
  }

  const seen = new Set();
  for (const call of assistantMessage.tool_calls) {
    if (
      !isRecord(call) ||
      typeof call.id !== "string" ||
      call.id.length === 0 ||
      call.type !== "function" ||
      !isRecord(call.function) ||
      typeof call.function.name !== "string" ||
      typeof call.function.arguments !== "string"
    ) {
      return failure("invalid_tool_call_shape");
    }
    if (seen.has(call.id)) {
      return failure("duplicate_tool_call_id");
    }
    seen.add(call.id);
  }

  return Object.freeze({
    valid: true,
    code: null,
    toolCallCount: assistantMessage.tool_calls.length,
    reasoningContentPresent:
      typeof assistantMessage.reasoning_content === "string"
  });
}

export function buildToolReplay({
  assistantMessage,
  toolMessages,
  thinking
}) {
  const assistantReport = validateAssistantToolTurn(assistantMessage, { thinking });
  if (!assistantReport.valid) {
    return Object.freeze({
      valid: false,
      code: assistantReport.code,
      internalMessages: Object.freeze([]),
      audit: Object.freeze({
        reasoningContentPreserved: false,
        toolIdsMatched: false
      })
    });
  }
  if (!Array.isArray(toolMessages)) {
    return Object.freeze({
      valid: false,
      code: "tool_messages_required",
      internalMessages: Object.freeze([]),
      audit: Object.freeze({
        reasoningContentPreserved: false,
        toolIdsMatched: false
      })
    });
  }

  const expectedIds = assistantMessage.tool_calls.map((call) => call.id);
  const actualIds = toolMessages.map((message) => message?.tool_call_id);
  const idsMatched =
    expectedIds.length === actualIds.length &&
    new Set(actualIds).size === actualIds.length &&
    expectedIds.every((id) => actualIds.includes(id)) &&
    toolMessages.every(
      (message) =>
        isRecord(message) &&
        message.role === "tool" &&
        typeof message.content === "string"
    );

  if (!idsMatched) {
    return Object.freeze({
      valid: false,
      code: "tool_call_id_mismatch",
      internalMessages: Object.freeze([]),
      audit: Object.freeze({
        reasoningContentPreserved: false,
        toolIdsMatched: false
      })
    });
  }

  const replayedAssistant = structuredClone(assistantMessage);
  const reasoningContentPreserved =
    !thinking ||
    replayedAssistant.reasoning_content === assistantMessage.reasoning_content;

  return Object.freeze({
    valid: reasoningContentPreserved,
    code: reasoningContentPreserved ? null : "reasoning_content_not_preserved",
    internalMessages: Object.freeze([
      replayedAssistant,
      ...toolMessages.map((message) => structuredClone(message))
    ]),
    audit: Object.freeze({
      reasoningContentPreserved,
      toolIdsMatched: true
    })
  });
}
