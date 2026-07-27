import assert from 'node:assert/strict';
import test from 'node:test';
import OpenAI from 'openai';
import { startMockServer } from './helpers/mock-server.mjs';

const OFFLINE_PLACEHOLDER = 'offline-only-not-a-credential';
const TOOL = {
  type: 'function',
  function: {
    name: 'get_temperature',
    description: 'Return a synthetic temperature for one city.',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
      additionalProperties: false,
    },
  },
};

function chat(model, maxTokens, extra = {}) {
  return {
    model,
    messages: [{ role: 'user', content: 'Synthetic offline prompt.' }],
    max_tokens: maxTokens,
    stream: false,
    ...extra,
  };
}

test('OpenAI Node SDK serializes and parses the full 10-request matrix on localhost', async () => {
  const mock = await startMockServer();
  try {
    const client = new OpenAI({
      apiKey: OFFLINE_PLACEHOLDER,
      baseURL: mock.baseURL,
      maxRetries: 0,
      timeout: 2000,
    });

    const models = await client.models.list();
    assert.equal(models.data.length, 2);

    const basic = await client.chat.completions.create(
      chat('deepseek-v4-flash', 64),
    );
    assert.equal(basic.choices[0].message.content, 'OK');

    await client.chat.completions.create(
      chat('deepseek-v4-flash', 32, { thinking: { type: 'disabled' } }),
    );

    const thinking = await client.chat.completions.create(
      chat('deepseek-v4-pro', 96, {
        thinking: { type: 'enabled' },
        reasoning_effort: 'high',
      }),
    );
    assert.equal(thinking.choices[0].message.reasoning_content, 'Synthetic reasoning fixture.');

    const stream = await client.chat.completions.create(
      chat('deepseek-v4-flash', 32, {
        thinking: { type: 'disabled' },
        stream: true,
      }),
    );
    let streamText = '';
    let streamFinish = null;
    for await (const chunk of stream) {
      streamText += chunk.choices[0]?.delta?.content ?? '';
      streamFinish = chunk.choices[0]?.finish_reason ?? streamFinish;
    }
    assert.equal(streamText, 'OK');
    assert.equal(streamFinish, 'stop');

    const jsonOutput = await client.chat.completions.create(
      chat('deepseek-v4-flash', 64, {
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
      }),
    );
    assert.deepEqual(JSON.parse(jsonOutput.choices[0].message.content), { ok: true });

    const initial = await client.chat.completions.create(
      chat('deepseek-v4-flash', 64, {
        thinking: { type: 'disabled' },
        tools: [TOOL],
        tool_choice: { type: 'function', function: { name: 'get_temperature' } },
      }),
    );
    const call = initial.choices[0].message.tool_calls[0];
    assert.deepEqual(JSON.parse(call.function.arguments), { city: 'Oslo' });

    const continuation = await client.chat.completions.create({
      model: 'deepseek-v4-flash',
      max_tokens: 48,
      thinking: { type: 'disabled' },
      messages: [
        { role: 'user', content: 'Synthetic offline prompt.' },
        {
          role: 'assistant',
          content: initial.choices[0].message.content ?? '',
          tool_calls: initial.choices[0].message.tool_calls,
        },
        { role: 'tool', tool_call_id: call.id, content: '6 C' },
      ],
    });
    assert.equal(continuation.choices[0].finish_reason, 'stop');

    await assert.rejects(
      client.chat.completions.create(
        chat('deepseek-does-not-exist', 16, { thinking: { type: 'disabled' } }),
      ),
      (error) => error?.status === 404 && error?.constructor?.name === 'NotFoundError',
    );

    const alias = await client.chat.completions.create(
      chat('deepseek-reasoner', 32, {
        thinking: { type: 'enabled' },
        reasoning_effort: 'high',
      }),
    );
    assert.equal(alias.model, 'deepseek-reasoner');

    assert.equal(mock.requests.length, 10);
    assert.deepEqual(
      mock.requests.map((item) => `${item.method} ${item.path}`),
      [
        'GET /models',
        'POST /chat/completions',
        'POST /chat/completions',
        'POST /chat/completions',
        'POST /chat/completions',
        'POST /chat/completions',
        'POST /chat/completions',
        'POST /chat/completions',
        'POST /chat/completions',
        'POST /chat/completions',
      ],
    );
    assert.deepEqual(mock.requests[2].body.thinking, { type: 'disabled' });
    assert.deepEqual(mock.requests[3].body.thinking, { type: 'enabled' });
    assert.equal(mock.requests[3].body.reasoning_effort, 'high');
    assert.deepEqual(mock.requests[5].body.response_format, { type: 'json_object' });
    assert.equal(mock.requests[7].body.messages.at(-1).tool_call_id, call.id);
  } finally {
    await mock.close();
  }
});
