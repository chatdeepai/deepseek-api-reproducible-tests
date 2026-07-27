import { createServer } from "node:http";

function writeJson(response, status, value, extraHeaders = {}) {
  if (response.destroyed || response.writableEnded) {
    return;
  }
  const encoded = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(encoded),
    ...extraHeaders,
  });
  response.end(encoded);
}

function chatResponse(body, message, finishReason = "stop") {
  return {
    id: "chatcmpl_offline",
    object: "chat.completion",
    created: 1,
    model: body.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", ...message },
        finish_reason: finishReason,
      },
    ],
    usage: {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2,
    },
  };
}

function writeStream(response, body) {
  if (response.destroyed || response.writableEnded) {
    return;
  }
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "close",
  });
  const chunks = [
    {
      id: "chatcmpl_offline_stream",
      object: "chat.completion.chunk",
      created: 1,
      model: body.model,
      choices: [
        {
          index: 0,
          delta: { role: "assistant", content: "O" },
          finish_reason: null,
        },
      ],
      usage: null,
    },
    {
      id: "chatcmpl_offline_stream",
      object: "chat.completion.chunk",
      created: 1,
      model: body.model,
      choices: [
        {
          index: 0,
          delta: { content: "K" },
          finish_reason: "stop",
        },
      ],
      usage: null,
    },
    {
      id: "chatcmpl_offline_stream",
      object: "chat.completion.chunk",
      created: 1,
      model: body.model,
      choices: [],
      usage: {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
      },
    },
  ];
  for (const chunk of chunks) {
    response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  response.end("data: [DONE]\n\n");
}

function syntheticError(response, status, code) {
  writeJson(
    response,
    status,
    {
      error: {
        message: "Synthetic controlled error.",
        type: "invalid_request_error",
        code,
      },
    },
    status === 429 ? { "retry-after-ms": "1" } : {},
  );
}

export async function startMockServer() {
  const requests = [];
  let activeRequests = 0;
  let maxActiveRequests = 0;

  const server = createServer(async (request, response) => {
    activeRequests += 1;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
    try {
      const chunks = [];
      for await (const chunk of request) {
        chunks.push(chunk);
      }
      const encoded = Buffer.concat(chunks).toString("utf8");
      const body = encoded ? JSON.parse(encoded) : null;
      requests.push({
        method: request.method,
        path: request.url,
        body,
      });

      if (request.method !== "POST" || request.url !== "/chat/completions") {
        syntheticError(response, 404, "route_not_found");
        return;
      }
      if (body.model === "synthetic-slow") {
        await new Promise((resolve) => setTimeout(resolve, 250));
        writeJson(response, 200, chatResponse(body, { content: "Synthetic answer." }));
        return;
      }
      if (body.model === "synthetic-always-500") {
        syntheticError(response, 500, "synthetic_server_error");
        return;
      }
      if (body.model === "synthetic-429") {
        syntheticError(response, 429, "synthetic_rate_limit");
        return;
      }
      if (
        body.model === "synthetic-400" ||
        body.model === "deepseek-does-not-exist"
      ) {
        syntheticError(response, 400, "model_not_found");
        return;
      }
      if (body.stream === true) {
        writeStream(response, body);
        return;
      }
      if (
        Array.isArray(body.messages) &&
        body.messages.some((message) => message.role === "tool")
      ) {
        writeJson(response, 200, chatResponse(body, { content: "Synthetic final." }));
        return;
      }
      if (Array.isArray(body.tools)) {
        writeJson(
          response,
          200,
          chatResponse(
            body,
            {
              content: "",
              tool_calls: [
                {
                  id: "call_offline_T1",
                  type: "function",
                  function: {
                    name: "lookup_synthetic_record",
                    arguments: '{"key":"retention"}',
                  },
                },
              ],
            },
            "tool_calls",
          ),
        );
        return;
      }
      if (body.response_format?.type === "json_object") {
        writeJson(
          response,
          200,
          chatResponse(body, { content: '{"label":"synthetic","score":1}' }),
        );
        return;
      }
      if (body.thinking?.type === "enabled") {
        writeJson(
          response,
          200,
          chatResponse(body, {
            content: "Synthetic answer.",
            reasoning_content: "Synthetic reasoning fixture.",
          }),
        );
        return;
      }
      writeJson(response, 200, chatResponse(body, { content: "OK" }));
    } finally {
      activeRequests -= 1;
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to resolve localhost mock address.");
  }

  return {
    baseURL: `http://127.0.0.1:${address.port}`,
    requests,
    get maxActiveRequests() {
      return maxActiveRequests;
    },
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
