import { casesForSdk, loadPlan } from './plan.mjs';
import { assertAllowlistedResult, safeErrorClass, safeErrorCode } from './security.mjs';

const PROVIDER_ORIGIN = 'https://api.deepseek.com';
const TOOL_NAME = 'get_temperature';
const TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: TOOL_NAME,
    description: 'Return a synthetic temperature for one city.',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string' },
      },
      required: ['city'],
      additionalProperties: false,
    },
  },
};

function baseChat(caseItem, prompt) {
  const body = {
    model: caseItem.model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: caseItem.max_tokens,
    stream: false,
  };
  if (caseItem.thinking) {
    body.thinking = { type: caseItem.thinking };
  }
  return body;
}

function validateToolCall(message) {
  const calls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  if (calls.length !== 1 || calls[0]?.function?.name !== TOOL_NAME) {
    return { ok: false, call: null };
  }
  try {
    const parsed = JSON.parse(calls[0].function.arguments);
    const ok =
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).length === 1 &&
      typeof parsed.city === 'string' &&
      parsed.city.length > 0;
    return { ok, call: ok ? calls[0] : null };
  } catch {
    return { ok: false, call: null };
  }
}

function successBase(caseItem, startedAt) {
  return {
    case_id: caseItem.id,
    sdk: 'node',
    scenario: caseItem.scenario,
    requested_model: caseItem.model ?? null,
    request_issued: true,
    status: 200,
    elapsed_ms: Date.now() - startedAt,
    exception_class: null,
    error_code: null,
  };
}

function errorResult(caseItem, startedAt, error, expectedError = false) {
  return {
    case_id: caseItem.id,
    sdk: 'node',
    scenario: caseItem.scenario,
    requested_model: caseItem.model ?? null,
    request_issued: true,
    status: Number.isInteger(error?.status) ? error.status : null,
    elapsed_ms: Date.now() - startedAt,
    exception_class: safeErrorClass(error),
    error_code: safeErrorCode(error),
    expected_error: expectedError,
  };
}

async function executeNodeCase(client, caseItem, state) {
  const startedAt = Date.now();

  if (caseItem.scenario === 'models_list') {
    try {
      const page = await client.models.list();
      const modelIds = Array.isArray(page?.data)
        ? page.data.map((item) => item?.id).filter((id) => typeof id === 'string')
        : [];
      return {
        ...successBase(caseItem, startedAt),
        list_object: Array.isArray(page?.data),
        model_count: modelIds.length,
        expected_flash_present: modelIds.includes('deepseek-v4-flash'),
        expected_pro_present: modelIds.includes('deepseek-v4-pro'),
      };
    } catch (error) {
      return errorResult(caseItem, startedAt, error);
    }
  }

  if (caseItem.scenario === 'basic_chat') {
    try {
      const response = await client.chat.completions.create(
        baseChat(caseItem, 'Reply with one short word.'),
      );
      const choice = response?.choices?.[0];
      const message = choice?.message;
      return {
        ...successBase(caseItem, startedAt),
        choice_count: Array.isArray(response?.choices) ? response.choices.length : 0,
        finish_reason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : null,
        content_nonempty:
          typeof message?.content === 'string' && message.content.length > 0,
        reasoning_field_present: Object.hasOwn(message ?? {}, 'reasoning_content'),
        reasoning_nonempty:
          typeof message?.reasoning_content === 'string' && message.reasoning_content.length > 0,
      };
    } catch (error) {
      return errorResult(caseItem, startedAt, error);
    }
  }

  if (caseItem.scenario === 'thinking_disabled' || caseItem.scenario === 'thinking_enabled') {
    try {
      const body = baseChat(caseItem, 'Return a short answer.');
      if (caseItem.scenario === 'thinking_enabled') {
        body.reasoning_effort = 'high';
      }
      const response = await client.chat.completions.create(body);
      const message = response?.choices?.[0]?.message;
      return {
        ...successBase(caseItem, startedAt),
        finish_reason:
          typeof response?.choices?.[0]?.finish_reason === 'string'
            ? response.choices[0].finish_reason
            : null,
        content_nonempty: typeof message?.content === 'string' && message.content.length > 0,
        reasoning_field_present: Object.hasOwn(message ?? {}, 'reasoning_content'),
        reasoning_nonempty:
          typeof message?.reasoning_content === 'string' && message.reasoning_content.length > 0,
      };
    } catch (error) {
      return errorResult(caseItem, startedAt, error);
    }
  }

  if (caseItem.scenario === 'streaming') {
    try {
      const body = baseChat(caseItem, 'Reply with one short word.');
      body.stream = true;
      const stream = await client.chat.completions.create(body);
      let eventCount = 0;
      let contentSeen = false;
      let reasoningSeen = false;
      let terminalFinishReason = null;
      for await (const chunk of stream) {
        eventCount += 1;
        for (const choice of chunk?.choices ?? []) {
          contentSeen ||= typeof choice?.delta?.content === 'string' && choice.delta.content.length > 0;
          reasoningSeen ||=
            typeof choice?.delta?.reasoning_content === 'string' &&
            choice.delta.reasoning_content.length > 0;
          if (typeof choice?.finish_reason === 'string') {
            terminalFinishReason = choice.finish_reason;
          }
        }
      }
      return {
        ...successBase(caseItem, startedAt),
        event_count: eventCount,
        content_delta_seen: contentSeen,
        reasoning_delta_seen: reasoningSeen,
        terminal_finish_reason: terminalFinishReason,
      };
    } catch (error) {
      return errorResult(caseItem, startedAt, error);
    }
  }

  if (caseItem.scenario === 'json_output') {
    try {
      const body = baseChat(
        caseItem,
        'Return JSON exactly matching this example: {"ok":true}.',
      );
      body.response_format = { type: 'json_object' };
      const response = await client.chat.completions.create(body);
      const text = response?.choices?.[0]?.message?.content;
      let jsonValid = false;
      if (typeof text === 'string' && text.length > 0) {
        try {
          JSON.parse(text);
          jsonValid = true;
        } catch {
          jsonValid = false;
        }
      }
      return {
        ...successBase(caseItem, startedAt),
        content_nonempty: typeof text === 'string' && text.length > 0,
        json_valid: jsonValid,
      };
    } catch (error) {
      return errorResult(caseItem, startedAt, error);
    }
  }

  if (caseItem.scenario === 'tool_initial') {
    try {
      const body = baseChat(caseItem, 'Call get_temperature once for Oslo.');
      body.tools = [TOOL_DEFINITION];
      body.tool_choice = { type: 'function', function: { name: TOOL_NAME } };
      const response = await client.chat.completions.create(body);
      const message = response?.choices?.[0]?.message;
      const validation = validateToolCall(message);
      if (validation.ok) {
        state.toolMessage = {
          role: 'assistant',
          content: message.content ?? '',
          tool_calls: message.tool_calls,
        };
        state.toolCall = validation.call;
      }
      return {
        ...successBase(caseItem, startedAt),
        finish_reason:
          typeof response?.choices?.[0]?.finish_reason === 'string'
            ? response.choices[0].finish_reason
            : null,
        tool_call_count: Array.isArray(message?.tool_calls) ? message.tool_calls.length : 0,
        tool_call_valid: validation.ok,
      };
    } catch (error) {
      return errorResult(caseItem, startedAt, error);
    }
  }

  if (caseItem.scenario === 'tool_continuation') {
    if (!state.toolMessage || !state.toolCall) {
      return {
        case_id: caseItem.id,
        sdk: 'node',
        scenario: caseItem.scenario,
        request_issued: false,
        status: null,
        elapsed_ms: 0,
        skip_code: 'unsafe_or_missing_initial_tool_call',
      };
    }
    try {
      const body = baseChat(caseItem, 'Call get_temperature once for Oslo.');
      body.messages = [
        { role: 'user', content: 'Call get_temperature once for Oslo.' },
        state.toolMessage,
        {
          role: 'tool',
          tool_call_id: state.toolCall.id,
          content: '6 C',
        },
      ];
      const response = await client.chat.completions.create(body);
      const message = response?.choices?.[0]?.message;
      return {
        ...successBase(caseItem, startedAt),
        finish_reason:
          typeof response?.choices?.[0]?.finish_reason === 'string'
            ? response.choices[0].finish_reason
            : null,
        content_nonempty: typeof message?.content === 'string' && message.content.length > 0,
        replay_call_alias: 'T1',
      };
    } catch (error) {
      return errorResult(caseItem, startedAt, error);
    }
  }

  if (caseItem.scenario === 'invalid_model') {
    try {
      await client.chat.completions.create(
        baseChat(caseItem, 'Return one short word.'),
      );
      return {
        ...successBase(caseItem, startedAt),
        expected_error: true,
        unexpected_success: true,
      };
    } catch (error) {
      return errorResult(caseItem, startedAt, error, true);
    }
  }

  if (caseItem.scenario === 'alias_probe') {
    try {
      const body = baseChat(caseItem, 'Return one short word.');
      if (caseItem.thinking === 'enabled') {
        body.reasoning_effort = 'high';
      }
      const response = await client.chat.completions.create(body);
      return {
        ...successBase(caseItem, startedAt),
        returned_model:
          typeof response?.model === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(response.model)
            ? response.model
            : null,
        finish_reason:
          typeof response?.choices?.[0]?.finish_reason === 'string'
            ? response.choices[0].finish_reason
            : null,
        reasoning_field_present: Object.hasOwn(
          response?.choices?.[0]?.message ?? {},
          'reasoning_content',
        ),
      };
    } catch (error) {
      return errorResult(caseItem, startedAt, error, true);
    }
  }

  throw new Error(`Unknown scenario: ${caseItem.scenario}`);
}

export async function runNodeLive({ apiKey, allowProviderRequests = false } = {}) {
  if (!allowProviderRequests) {
    throw new Error('Provider requests are disabled. Set ALLOW_PROVIDER_REQUESTS=1 explicitly.');
  }
  if (typeof apiKey !== 'string' || apiKey.length < 8) {
    throw new Error('DEEPSEEK_API_KEY is required and is never persisted.');
  }

  const plan = await loadPlan();
  const nodeCases = casesForSdk(plan, 'node');
  if (nodeCases.length !== 10 || plan.provider_request_cap !== 20) {
    throw new Error('Refusing to run a mutated request plan.');
  }

  const { default: OpenAI } = await import('openai');
  const { VERSION: openaiVersion } = await import('openai/version');
  const startedAt = new Date().toISOString();
  const client = new OpenAI({
    apiKey,
    baseURL: PROVIDER_ORIGIN,
    maxRetries: 0,
    timeout: plan.default_timeout_ms,
  });

  const results = [];
  const state = {};
  for (const caseItem of nodeCases) {
    results.push(await executeNodeCase(client, caseItem, state));
  }

  const issued = results.filter((item) => item.request_issued).length;
  const summary = {
    schema_version: 1,
    status: 'completed',
    sdk: 'node',
    sdk_version: openaiVersion,
    runtime_version: process.version,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    source_plan_cases: nodeCases.length,
    requests_issued: issued,
    requests_skipped: nodeCases.length - issued,
    provider_request_cap: plan.provider_request_cap,
    concurrency: 1,
    automatic_retries: 0,
    provider_origin: PROVIDER_ORIGIN,
    cases: results,
  };
  assertAllowlistedResult(summary);
  return summary;
}
