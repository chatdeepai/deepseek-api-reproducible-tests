import { createHash } from "node:crypto";
import { compileArgumentsForLocalExecution } from "./argument-validator.mjs";
import { buildToolReplay, validateAssistantToolTurn } from "./replay.mjs";
import { sanitizeForPublic } from "./redact.mjs";
import { summarizeTurns } from "./summarize.mjs";
import {
  normalizeToolChoice,
  validateObservedCalls
} from "./tool-choice.mjs";

const TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hashCallId(callId) {
  return createHash("sha256").update(callId).digest("hex").slice(0, 12);
}

function stopReport({
  code,
  iteration,
  turns,
  executions,
  replayAudits,
  errors = []
}) {
  return sanitizeForPublic({
    completed: false,
    stopCode: code,
    stoppedAtIteration: iteration,
    iterationsProcessed: turns.length,
    toolExecutions: executions,
    replayAudits,
    errors,
    aggregate: summarizeTurns(turns)
  });
}

export function createLocalToolRegistry(definitions) {
  if (!Array.isArray(definitions) || definitions.length === 0) {
    throw new TypeError("At least one local tool definition is required.");
  }
  if (definitions.length > 128) {
    throw new Error("The registry exceeds the documented 128-function limit.");
  }

  const registry = new Map();
  for (const definition of definitions) {
    if (
      !isRecord(definition) ||
      typeof definition.name !== "string" ||
      !TOOL_NAME.test(definition.name) ||
      !isRecord(definition.parameters) ||
      typeof definition.execute !== "function"
    ) {
      throw new Error("Invalid local tool definition.");
    }
    if (registry.has(definition.name)) {
      throw new Error("Local tool names must be unique.");
    }
    registry.set(
      definition.name,
      Object.freeze({
        name: definition.name,
        parameters: structuredClone(definition.parameters),
        execute: definition.execute
      })
    );
  }
  return registry;
}

export async function runScriptedOrchestration({
  turns,
  registry,
  thinking = false,
  maxIterations = 6,
  toolChoice = "auto"
}) {
  if (!Array.isArray(turns) || turns.length === 0) {
    throw new TypeError("At least one scripted assistant turn is required.");
  }
  if (!(registry instanceof Map) || registry.size === 0) {
    throw new TypeError("A local tool registry is required.");
  }
  if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 32) {
    throw new Error("maxIterations must be between 1 and 32.");
  }

  const toolNames = [...registry.keys()];
  const defaultChoice = normalizeToolChoice(toolChoice, { toolNames });
  const seenCallIds = new Set();
  const processedTurns = [];
  const executions = [];
  const replayAudits = [];
  const internalReplayHistory = [];

  for (let index = 0; index < turns.length; index += 1) {
    const iteration = index + 1;
    if (iteration > maxIterations) {
      return stopReport({
        code: "max_iterations",
        iteration,
        turns: processedTurns,
        executions,
        replayAudits
      });
    }

    const turn = turns[index];
    const message = turn?.message;
    if (!isRecord(message) || message.role !== "assistant") {
      return stopReport({
        code: "assistant_message_required",
        iteration,
        turns: processedTurns,
        executions,
        replayAudits
      });
    }
    processedTurns.push({
      usage: turn.usage,
      elapsedMs: turn.elapsedMs
    });

    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    const turnChoice =
      turn.toolChoice === undefined
        ? defaultChoice
        : normalizeToolChoice(turn.toolChoice, { toolNames });
    const choiceReport = validateObservedCalls(turnChoice, calls);
    if (!choiceReport.valid) {
      return stopReport({
        code: choiceReport.code,
        iteration,
        turns: processedTurns,
        executions,
        replayAudits
      });
    }

    if (calls.length === 0) {
      return sanitizeForPublic({
        completed: true,
        stopCode: "final_answer",
        iterationsProcessed: processedTurns.length,
        toolExecutions: executions,
        replayAudits,
        internalReplayMessageCount: internalReplayHistory.length,
        aggregate: summarizeTurns(processedTurns)
      });
    }

    if (turn.finishReason !== "tool_calls") {
      return stopReport({
        code: "finish_reason_tool_calls_required",
        iteration,
        turns: processedTurns,
        executions,
        replayAudits
      });
    }

    const assistantReport = validateAssistantToolTurn(message, { thinking });
    if (!assistantReport.valid) {
      return stopReport({
        code: assistantReport.code,
        iteration,
        turns: processedTurns,
        executions,
        replayAudits
      });
    }

    for (const call of calls) {
      if (seenCallIds.has(call.id)) {
        return stopReport({
          code: "duplicate_tool_call_id",
          iteration,
          turns: processedTurns,
          executions,
          replayAudits
        });
      }
      seenCallIds.add(call.id);
    }

    const toolMessages = [];
    for (const call of calls) {
      const definition = registry.get(call.function.name);
      if (!definition) {
        return stopReport({
          code: "unknown_tool",
          iteration,
          turns: processedTurns,
          executions,
          replayAudits
        });
      }

      const compiled = compileArgumentsForLocalExecution(
        call.function.arguments,
        definition.parameters
      );
      if (!compiled.report.valid) {
        return stopReport({
          code: "invalid_tool_arguments",
          iteration,
          turns: processedTurns,
          executions,
          replayAudits,
          errors: compiled.report.errors
        });
      }

      let localResult;
      try {
        localResult = await definition.execute(structuredClone(compiled.value));
      } catch {
        return stopReport({
          code: "tool_execution_failed",
          iteration,
          turns: processedTurns,
          executions,
          replayAudits
        });
      }

      let serializedResult;
      try {
        serializedResult = JSON.stringify(localResult);
      } catch {
        return stopReport({
          code: "tool_result_not_serializable",
          iteration,
          turns: processedTurns,
          executions,
          replayAudits
        });
      }

      executions.push(
        Object.freeze({
          iteration,
          toolName: definition.name,
          callIdHash: hashCallId(call.id),
          argumentsValid: true
        })
      );
      toolMessages.push({
        role: "tool",
        tool_call_id: call.id,
        content: serializedResult
      });
    }

    const replay = buildToolReplay({
      assistantMessage: message,
      toolMessages,
      thinking
    });
    if (!replay.valid) {
      return stopReport({
        code: replay.code,
        iteration,
        turns: processedTurns,
        executions,
        replayAudits
      });
    }

    internalReplayHistory.push(...replay.internalMessages);
    replayAudits.push(
      Object.freeze({
        iteration,
        thinking,
        reasoningContentPreserved: replay.audit.reasoningContentPreserved,
        toolIdsMatched: replay.audit.toolIdsMatched,
        toolCallCount: calls.length
      })
    );
  }

  return stopReport({
    code: "script_exhausted_without_final_answer",
    iteration: turns.length,
    turns: processedTurns,
    executions,
    replayAudits
  });
}
