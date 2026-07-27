import type OpenAI from "openai";

import {
  safeErrorClass,
  safeErrorCode,
  safeStatus,
  safeToken,
} from "./security.js";
import type {
  PlanCase,
  RequestPlan,
  SafeResult,
  ThinkingMode,
} from "./types.js";

const TOOL_NAME = "lookup_synthetic_record";
const TOOL_PROMPT = "Call lookup_synthetic_record once for the key retention.";

const TOOL_DEFINITION: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: TOOL_NAME,
    description: "Look up one synthetic local record.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string" },
      },
      required: ["key"],
      additionalProperties: false,
    },
  },
};

type DeepSeekRequestFields = {
  thinking: { type: ThinkingMode };
  reasoning_effort?: "high";
};

type DeepSeekNonStreamingBody =
  OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming &
    DeepSeekRequestFields;

type DeepSeekStreamingBody =
  OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming &
    DeepSeekRequestFields;

type DeepSeekMessage = OpenAI.Chat.Completions.ChatCompletionMessage & {
  reasoning_content?: unknown;
};

type DeepSeekDelta = OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta & {
  reasoning_content?: unknown;
};

interface ValidatedToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ExecutionState {
  toolMessage?: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam;
  toolCall?: ValidatedToolCall;
}

export type BeforeIssue = (caseItem: PlanCase) => void | Promise<void>;

function baseBody(caseItem: PlanCase, prompt: string): DeepSeekNonStreamingBody {
  const body: DeepSeekNonStreamingBody = {
    model: caseItem.model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: caseItem.max_tokens,
    stream: false,
    thinking: { type: caseItem.thinking },
  };
  if (caseItem.reasoning_effort === "high") {
    body.reasoning_effort = "high";
  }
  return body;
}

function successBase(caseItem: PlanCase, started: number, status: number): SafeResult {
  return {
    case_id: caseItem.id,
    runtime: "nodejs-typescript",
    scenario: caseItem.scenario,
    requested_model: caseItem.model,
    request_issued: true,
    status,
    elapsed_ms: Math.max(0, Math.round(performance.now() - started)),
  };
}

function errorResult(
  caseItem: PlanCase,
  started: number,
  error: unknown,
  outcome: string,
): SafeResult {
  return {
    case_id: caseItem.id,
    runtime: "nodejs-typescript",
    scenario: caseItem.scenario,
    requested_model: caseItem.model,
    request_issued: true,
    status: safeStatus(error),
    elapsed_ms: Math.max(0, Math.round(performance.now() - started)),
    outcome,
    exception_class: safeErrorClass(error),
    error_code: safeErrorCode(error),
  };
}

function validateStructuredValue(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    typeof record.label === "string" &&
    Number.isInteger(record.score) &&
    Number(record.score) >= 0 &&
    Number(record.score) <= 5
  );
}

function validateToolCall(message: DeepSeekMessage | undefined): ValidatedToolCall | null {
  const calls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  if (calls.length !== 1) {
    return null;
  }
  const call = calls[0];
  if (
    !call ||
    call.type !== "function" ||
    typeof call.id !== "string" ||
    call.id.length === 0 ||
    call.function.name !== TOOL_NAME
  ) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(call.function.arguments);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (
      Object.keys(record).length !== 1 ||
      typeof record.key !== "string" ||
      record.key.length === 0
    ) {
      return null;
    }
    return {
      id: call.id,
      type: "function",
      function: {
        name: call.function.name,
        arguments: call.function.arguments,
      },
    };
  } catch {
    return null;
  }
}

function skippedContinuation(caseItem: PlanCase): SafeResult {
  return {
    case_id: caseItem.id,
    runtime: "nodejs-typescript",
    scenario: caseItem.scenario,
    requested_model: caseItem.model,
    request_issued: false,
    status: null,
    elapsed_ms: 0,
    outcome: "safety_skipped",
    skip_code: "unsafe_or_missing_initial_tool_call",
  };
}

export async function executeProviderCase(
  client: OpenAI,
  caseItem: PlanCase,
  state: ExecutionState,
): Promise<SafeResult> {
  const started = performance.now();

  if (caseItem.scenario === "ordinary_chat") {
    try {
      const { data: response, response: httpResponse } =
        await client.chat.completions
          .create(baseBody(caseItem, "Return one concise synthetic answer."))
          .withResponse();
      const choice = response.choices[0];
      const message = choice?.message as DeepSeekMessage | undefined;
      return {
        ...successBase(caseItem, started, httpResponse.status),
        outcome: "success",
        choice_count: response.choices.length,
        finish_reason: safeToken(choice?.finish_reason),
        content_nonempty:
          typeof message?.content === "string" && message.content.length > 0,
        reasoning_field_present: Object.hasOwn(message ?? {}, "reasoning_content"),
        reasoning_nonempty:
          typeof message?.reasoning_content === "string" &&
          message.reasoning_content.length > 0,
      };
    } catch (error) {
      return errorResult(caseItem, started, error, "provider_error");
    }
  }

  if (caseItem.scenario === "streaming") {
    try {
      const body: DeepSeekStreamingBody = {
        ...baseBody(caseItem, "Return one concise synthetic answer."),
        stream: true,
        stream_options: { include_usage: true },
      };
      const { data: stream, response: httpResponse } =
        await client.chat.completions.create(body).withResponse();
      let eventCount = 0;
      let contentDeltaSeen = false;
      let reasoningDeltaSeen = false;
      let usageChunkSeen = false;
      let terminalFinishReason: string | null = null;
      for await (const chunk of stream) {
        eventCount += 1;
        usageChunkSeen ||= chunk.usage !== null && chunk.usage !== undefined;
        for (const choice of chunk.choices) {
          const delta = choice.delta as DeepSeekDelta;
          contentDeltaSeen ||= Boolean(delta.content);
          reasoningDeltaSeen ||=
            typeof delta.reasoning_content === "string" &&
            delta.reasoning_content.length > 0;
          terminalFinishReason =
            safeToken(choice.finish_reason) ?? terminalFinishReason;
        }
      }
      return {
        ...successBase(caseItem, started, httpResponse.status),
        outcome: "success",
        event_count: eventCount,
        content_delta_seen: contentDeltaSeen,
        reasoning_delta_seen: reasoningDeltaSeen,
        usage_chunk_seen: usageChunkSeen,
        terminal_finish_reason: terminalFinishReason,
      };
    } catch (error) {
      return errorResult(caseItem, started, error, "provider_error");
    }
  }

  if (caseItem.scenario === "json_output") {
    try {
      const body = baseBody(
        caseItem,
        'Return JSON exactly matching {"label":"synthetic","score":1}.',
      );
      body.response_format = { type: "json_object" };
      const { data: response, response: httpResponse } =
        await client.chat.completions.create(body).withResponse();
      const text = response.choices[0]?.message.content;
      let parsed: unknown;
      let jsonValid = false;
      let schemaValid = false;
      if (typeof text === "string" && text.length > 0) {
        try {
          parsed = JSON.parse(text);
          jsonValid = true;
          schemaValid = validateStructuredValue(parsed);
        } catch {
          jsonValid = false;
        }
      }
      return {
        ...successBase(caseItem, started, httpResponse.status),
        outcome: "success",
        content_nonempty: typeof text === "string" && text.length > 0,
        json_valid: jsonValid,
        schema_valid: schemaValid,
        validated_field_count: schemaValid ? 2 : 0,
      };
    } catch (error) {
      return errorResult(caseItem, started, error, "provider_error");
    }
  }

  if (caseItem.scenario === "tool_initial") {
    try {
      const body = baseBody(caseItem, TOOL_PROMPT);
      body.tools = [TOOL_DEFINITION];
      body.tool_choice = {
        type: "function",
        function: { name: TOOL_NAME },
      };
      const { data: response, response: httpResponse } =
        await client.chat.completions.create(body).withResponse();
      const choice = response.choices[0];
      const message = choice?.message as DeepSeekMessage | undefined;
      const validated = validateToolCall(message);
      if (validated && message?.tool_calls) {
        state.toolCall = validated;
        state.toolMessage = {
          role: "assistant",
          content: message.content ?? "",
          tool_calls: message.tool_calls,
        };
      }
      return {
        ...successBase(caseItem, started, httpResponse.status),
        outcome: "success",
        finish_reason: safeToken(choice?.finish_reason),
        tool_call_count: Array.isArray(message?.tool_calls)
          ? message.tool_calls.length
          : 0,
        tool_call_valid: validated !== null,
        tool_name_allowlisted: validated?.function.name === TOOL_NAME,
        arguments_schema_valid: validated !== null,
      };
    } catch (error) {
      return errorResult(caseItem, started, error, "provider_error");
    }
  }

  if (caseItem.scenario === "tool_continuation") {
    if (!state.toolCall || !state.toolMessage) {
      return skippedContinuation(caseItem);
    }
    try {
      const body = baseBody(caseItem, TOOL_PROMPT);
      body.messages = [
        { role: "user", content: TOOL_PROMPT },
        state.toolMessage,
        {
          role: "tool",
          tool_call_id: state.toolCall.id,
          content: '{"value":"synthetic"}',
        },
      ];
      const { data: response, response: httpResponse } =
        await client.chat.completions.create(body).withResponse();
      const choice = response.choices[0];
      return {
        ...successBase(caseItem, started, httpResponse.status),
        outcome: "success",
        finish_reason: safeToken(choice?.finish_reason),
        content_nonempty:
          typeof choice?.message.content === "string" &&
          choice.message.content.length > 0,
        replay_call_alias: "T1",
      };
    } catch (error) {
      return errorResult(caseItem, started, error, "provider_error");
    }
  }

  if (caseItem.scenario === "thinking") {
    try {
      const { data: response, response: httpResponse } =
        await client.chat.completions
          .create(baseBody(caseItem, "Return one concise synthetic answer."))
          .withResponse();
      const choice = response.choices[0];
      const message = choice?.message as DeepSeekMessage | undefined;
      return {
        ...successBase(caseItem, started, httpResponse.status),
        outcome: "success",
        finish_reason: safeToken(choice?.finish_reason),
        content_nonempty:
          typeof message?.content === "string" && message.content.length > 0,
        reasoning_field_present: Object.hasOwn(message ?? {}, "reasoning_content"),
        reasoning_nonempty:
          typeof message?.reasoning_content === "string" &&
          message.reasoning_content.length > 0,
      };
    } catch (error) {
      return errorResult(caseItem, started, error, "provider_error");
    }
  }

  if (caseItem.scenario === "alias_probe") {
    try {
      const { data: response, response: httpResponse } =
        await client.chat.completions
          .create(baseBody(caseItem, "Return one concise synthetic answer."))
          .withResponse();
      return {
        ...successBase(caseItem, started, httpResponse.status),
        outcome: "alias_accepted",
        returned_model: safeToken(response.model),
        finish_reason: safeToken(response.choices[0]?.finish_reason),
      };
    } catch (error) {
      return errorResult(caseItem, started, error, "alias_rejected");
    }
  }

  if (caseItem.scenario === "invalid_model") {
    try {
      const { response: httpResponse } = await client.chat.completions
        .create(baseBody(caseItem, "Return one concise synthetic answer."))
        .withResponse();
      return {
        ...successBase(caseItem, started, httpResponse.status),
        outcome: "unexpected_model_accepted",
        expected_error_observed: false,
      };
    } catch (error) {
      return {
        ...errorResult(caseItem, started, error, "expected_provider_error"),
        expected_error_observed: true,
      };
    }
  }

  throw new Error("Unknown provider scenario.");
}

export async function executePlanSerially(
  client: OpenAI,
  plan: RequestPlan,
  beforeIssue: BeforeIssue = () => undefined,
): Promise<SafeResult[]> {
  const results: SafeResult[] = [];
  const state: ExecutionState = {};
  for (const caseItem of plan.cases) {
    if (
      caseItem.scenario === "tool_continuation" &&
      (!state.toolCall || !state.toolMessage)
    ) {
      results.push(skippedContinuation(caseItem));
      continue;
    }
    await beforeIssue(caseItem);
    results.push(await executeProviderCase(client, caseItem, state));
  }
  return results;
}
