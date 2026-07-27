import { createServer } from 'node:http';

function jsonResponse(response, status, body) {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(text),
  });
  response.end(text);
}

function chatResponse(body, message, finishReason = 'stop') {
  return {
    id: 'chatcmpl_offline',
    object: 'chat.completion',
    created: 1,
    model: body.model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', ...message },
        finish_reason: finishReason,
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

function streamResponse(response, body) {
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'close',
  });
  const chunks = [
    {
      id: 'chatcmpl_offline_stream',
      object: 'chat.completion.chunk',
      created: 1,
      model: body.model,
      choices: [{ index: 0, delta: { role: 'assistant', content: 'O' }, finish_reason: null }],
    },
    {
      id: 'chatcmpl_offline_stream',
      object: 'chat.completion.chunk',
      created: 1,
      model: body.model,
      choices: [{ index: 0, delta: { content: 'K' }, finish_reason: null }],
    },
    {
      id: 'chatcmpl_offline_stream',
      object: 'chat.completion.chunk',
      created: 1,
      model: body.model,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    },
  ];
  for (const chunk of chunks) {
    response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  response.end('data: [DONE]\n\n');
}

export async function startMockServer() {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    const body = text ? JSON.parse(text) : null;
    requests.push({ method: request.method, path: request.url, body });

    if (request.method === 'GET' && request.url === '/models') {
      jsonResponse(response, 200, {
        object: 'list',
        data: [
          { id: 'deepseek-v4-flash', object: 'model', owned_by: 'deepseek' },
          { id: 'deepseek-v4-pro', object: 'model', owned_by: 'deepseek' },
        ],
      });
      return;
    }

    if (request.method !== 'POST' || request.url !== '/chat/completions') {
      jsonResponse(response, 404, {
        error: {
          message: 'Synthetic route not found.',
          type: 'invalid_request_error',
          code: 'route_not_found',
        },
      });
      return;
    }

    if (body.model === 'deepseek-does-not-exist') {
      jsonResponse(response, 404, {
        error: {
          message: 'Synthetic model not found.',
          type: 'invalid_request_error',
          param: 'model',
          code: 'model_not_found',
        },
      });
      return;
    }

    if (body.stream === true) {
      streamResponse(response, body);
      return;
    }

    if (Array.isArray(body.messages) && body.messages.some((item) => item.role === 'tool')) {
      jsonResponse(response, 200, chatResponse(body, { content: 'Synthetic final answer.' }));
      return;
    }

    if (Array.isArray(body.tools)) {
      jsonResponse(
        response,
        200,
        chatResponse(
          body,
          {
            content: '',
            tool_calls: [
              {
                id: 'call_offline_T1',
                type: 'function',
                function: { name: 'get_temperature', arguments: '{"city":"Oslo"}' },
              },
            ],
          },
          'tool_calls',
        ),
      );
      return;
    }

    if (body.response_format?.type === 'json_object') {
      jsonResponse(response, 200, chatResponse(body, { content: '{"ok":true}' }));
      return;
    }

    if (body.thinking?.type === 'enabled') {
      jsonResponse(
        response,
        200,
        chatResponse(body, {
          content: 'Synthetic answer.',
          reasoning_content: 'Synthetic reasoning fixture.',
        }),
      );
      return;
    }

    jsonResponse(response, 200, chatResponse(body, { content: 'OK' }));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to resolve localhost mock address.');
  }

  return {
    baseURL: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

