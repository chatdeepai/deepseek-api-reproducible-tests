import http from "node:http";

function completion(body, message, finishReason = "stop") {
  return {
    id: "offline-completion",
    object: "chat.completion",
    created: 1,
    model: body.model ?? "offline-model",
    choices: [
      {
        index: 0,
        message: { role: "assistant", ...message },
        finish_reason: finishReason,
      },
    ],
    usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
  };
}

function sendJson(response, status, value) {
  const encoded = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(encoded),
  });
  response.end(encoded);
}

function sendStream(response, body) {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "close",
  });
  for (const delta of [{ role: "assistant" }, { content: "S" }, { content: "ynthetic" }]) {
    response.write(
      `data: ${JSON.stringify({
        id: "offline-stream",
        object: "chat.completion.chunk",
        created: 1,
        model: body.model,
        choices: [{ index: 0, delta, finish_reason: null }],
      })}\n\n`,
    );
  }
  response.write(
    `data: ${JSON.stringify({
      id: "offline-stream",
      object: "chat.completion.chunk",
      created: 1,
      model: body.model,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    })}\n\n`,
  );
  response.end("data: [DONE]\n\n");
}

export async function startMockServer() {
  const requests = [];
  const server = http.createServer((request, response) => {
    let encoded = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      encoded += chunk;
    });
    request.on("end", () => {
      let body = {};
      try {
        body = JSON.parse(encoded);
      } catch {
        body = {};
      }
      requests.push({ path: request.url, body });

      const respond = () => {
        if (!["/chat/completions", "/v1/chat/completions"].includes(request.url)) {
          sendJson(response, 404, {
            error: { message: "Synthetic route.", code: "route_not_found" },
          });
          return;
        }
        if (body.model === "synthetic-always-500") {
          sendJson(response, 500, {
            error: {
              message: "Synthetic transient failure.",
              type: "server_error",
              code: "synthetic_server_error",
            },
          });
          return;
        }
        if (body.model === "deepseek-does-not-exist") {
          sendJson(response, 400, {
            error: {
              message: "Synthetic invalid model.",
              type: "invalid_request_error",
              code: "invalid_model",
            },
          });
          return;
        }
        if (body.stream === true) {
          sendStream(response, body);
          return;
        }
        if (Array.isArray(body.tools) && body.tools.length > 0) {
          const name = body.tools[0]?.function?.name ?? "SyntheticLookup";
          const args =
            name.includes("Structured") || name.includes("Answer")
              ? '{"label":"synthetic","score":1}'
              : '{"key":"retention"}';
          sendJson(
            response,
            200,
            completion(
              body,
              {
                content: "",
                tool_calls: [
                  {
                    id: "offline-tool-call",
                    type: "function",
                    function: { name, arguments: args },
                  },
                ],
              },
              "tool_calls",
            ),
          );
          return;
        }
        sendJson(response, 200, completion(body, { content: "Synthetic answer." }));
      };

      if (body.model === "synthetic-slow") {
        setTimeout(respond, 350);
      } else {
        respond();
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    requests,
    baseURL: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

