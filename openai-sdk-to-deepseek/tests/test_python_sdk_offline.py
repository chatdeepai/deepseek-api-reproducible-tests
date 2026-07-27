"""Localhost-only serialization tests for the official OpenAI Python SDK."""

from __future__ import annotations

import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

import openai
from openai import OpenAI


OFFLINE_PLACEHOLDER = "offline-only-not-a-credential"
TOOL = {
    "type": "function",
    "function": {
        "name": "get_temperature",
        "description": "Return a synthetic temperature for one city.",
        "parameters": {
            "type": "object",
            "properties": {"city": {"type": "string"}},
            "required": ["city"],
            "additionalProperties": False,
        },
    },
}


def chat(model: str, max_tokens: int, **extra: Any) -> dict[str, Any]:
    return {
        "model": model,
        "messages": [{"role": "user", "content": "Synthetic offline prompt."}],
        "max_tokens": max_tokens,
        "stream": False,
        **extra,
    }


class MockHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    requests: list[dict[str, Any]] = []

    def log_message(self, _format: str, *_args: Any) -> None:
        return

    def _read_body(self) -> dict[str, Any] | None:
        length = int(self.headers.get("content-length", "0"))
        if not length:
            return None
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def _json(self, status: int, body: dict[str, Any]) -> None:
        encoded = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    @staticmethod
    def _chat(body: dict[str, Any], message: dict[str, Any], finish: str = "stop") -> dict[str, Any]:
        return {
            "id": "chatcmpl_offline",
            "object": "chat.completion",
            "created": 1,
            "model": body["model"],
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", **message},
                    "finish_reason": finish,
                }
            ],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
        }

    def do_GET(self) -> None:
        self.__class__.requests.append({"method": "GET", "path": self.path, "body": None})
        if self.path == "/models":
            self._json(
                200,
                {
                    "object": "list",
                    "data": [
                        {"id": "deepseek-v4-flash", "object": "model", "owned_by": "deepseek"},
                        {"id": "deepseek-v4-pro", "object": "model", "owned_by": "deepseek"},
                    ],
                },
            )
            return
        self._json(
            404,
            {
                "error": {
                    "message": "Synthetic route not found.",
                    "type": "invalid_request_error",
                    "code": "route_not_found",
                }
            },
        )

    def do_POST(self) -> None:
        body = self._read_body()
        self.__class__.requests.append({"method": "POST", "path": self.path, "body": body})
        if self.path != "/chat/completions" or not isinstance(body, dict):
            self._json(
                404,
                {
                    "error": {
                        "message": "Synthetic route not found.",
                        "type": "invalid_request_error",
                        "code": "route_not_found",
                    }
                },
            )
            return

        if body["model"] == "deepseek-does-not-exist":
            self._json(
                404,
                {
                    "error": {
                        "message": "Synthetic model not found.",
                        "type": "invalid_request_error",
                        "param": "model",
                        "code": "model_not_found",
                    }
                },
            )
            return

        if body.get("stream") is True:
            self.send_response(200)
            self.send_header("content-type", "text/event-stream")
            self.send_header("connection", "close")
            self.end_headers()
            chunks = [
                {
                    "id": "chatcmpl_offline_stream",
                    "object": "chat.completion.chunk",
                    "created": 1,
                    "model": body["model"],
                    "choices": [
                        {
                            "index": 0,
                            "delta": {"role": "assistant", "content": "O"},
                            "finish_reason": None,
                        }
                    ],
                },
                {
                    "id": "chatcmpl_offline_stream",
                    "object": "chat.completion.chunk",
                    "created": 1,
                    "model": body["model"],
                    "choices": [
                        {"index": 0, "delta": {"content": "K"}, "finish_reason": None}
                    ],
                },
                {
                    "id": "chatcmpl_offline_stream",
                    "object": "chat.completion.chunk",
                    "created": 1,
                    "model": body["model"],
                    "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                },
            ]
            for chunk in chunks:
                self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode("utf-8"))
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
            self.close_connection = True
            return

        messages = body.get("messages")
        if isinstance(messages, list) and any(item.get("role") == "tool" for item in messages):
            self._json(200, self._chat(body, {"content": "Synthetic final answer."}))
            return

        if isinstance(body.get("tools"), list):
            self._json(
                200,
                self._chat(
                    body,
                    {
                        "content": "",
                        "tool_calls": [
                            {
                                "id": "call_offline_T1",
                                "type": "function",
                                "function": {
                                    "name": "get_temperature",
                                    "arguments": '{"city":"Oslo"}',
                                },
                            }
                        ],
                    },
                    "tool_calls",
                ),
            )
            return

        if body.get("response_format", {}).get("type") == "json_object":
            self._json(200, self._chat(body, {"content": '{"ok":true}'}))
            return

        if body.get("thinking", {}).get("type") == "enabled":
            self._json(
                200,
                self._chat(
                    body,
                    {
                        "content": "Synthetic answer.",
                        "reasoning_content": "Synthetic reasoning fixture.",
                    },
                ),
            )
            return

        self._json(200, self._chat(body, {"content": "OK"}))


class PythonSdkOfflineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        MockHandler.requests = []
        cls.server = HTTPServer(("127.0.0.1", 0), MockHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        host, port = cls.server.server_address
        cls.client = OpenAI(
            api_key=OFFLINE_PLACEHOLDER,
            base_url=f"http://{host}:{port}",
            max_retries=0,
            timeout=2.0,
        )

    @classmethod
    def tearDownClass(cls) -> None:
        cls.client.close()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def test_full_ten_request_matrix(self) -> None:
        models = self.client.models.list()
        self.assertEqual(len(models.data), 2)

        basic = self.client.chat.completions.create(**chat("deepseek-v4-flash", 64))
        self.assertEqual(basic.choices[0].message.content, "OK")

        self.client.chat.completions.create(
            **chat(
                "deepseek-v4-flash",
                32,
                extra_body={"thinking": {"type": "disabled"}},
            )
        )

        thinking = self.client.chat.completions.create(
            **chat(
                "deepseek-v4-pro",
                96,
                reasoning_effort="high",
                extra_body={"thinking": {"type": "enabled"}},
            )
        )
        self.assertEqual(
            thinking.choices[0].message.reasoning_content,
            "Synthetic reasoning fixture.",
        )

        stream = self.client.chat.completions.create(
            **chat(
                "deepseek-v4-flash",
                32,
                stream=True,
                extra_body={"thinking": {"type": "disabled"}},
            )
        )
        stream_text = ""
        stream_finish = None
        for chunk in stream:
            stream_text += chunk.choices[0].delta.content or ""
            stream_finish = chunk.choices[0].finish_reason or stream_finish
        self.assertEqual(stream_text, "OK")
        self.assertEqual(stream_finish, "stop")

        json_output = self.client.chat.completions.create(
            **chat(
                "deepseek-v4-flash",
                64,
                response_format={"type": "json_object"},
                extra_body={"thinking": {"type": "disabled"}},
            )
        )
        self.assertEqual(json.loads(json_output.choices[0].message.content), {"ok": True})

        initial = self.client.chat.completions.create(
            **chat(
                "deepseek-v4-flash",
                64,
                tools=[TOOL],
                tool_choice={"type": "function", "function": {"name": "get_temperature"}},
                extra_body={"thinking": {"type": "disabled"}},
            )
        )
        call = initial.choices[0].message.tool_calls[0]
        self.assertEqual(json.loads(call.function.arguments), {"city": "Oslo"})

        continuation = self.client.chat.completions.create(
            model="deepseek-v4-flash",
            max_tokens=48,
            extra_body={"thinking": {"type": "disabled"}},
            messages=[
                {"role": "user", "content": "Synthetic offline prompt."},
                {
                    "role": "assistant",
                    "content": initial.choices[0].message.content or "",
                    "tool_calls": [
                        {
                            "id": call.id,
                            "type": "function",
                            "function": {
                                "name": call.function.name,
                                "arguments": call.function.arguments,
                            },
                        }
                    ],
                },
                {"role": "tool", "tool_call_id": call.id, "content": "6 C"},
            ],
        )
        self.assertEqual(continuation.choices[0].finish_reason, "stop")

        with self.assertRaises(openai.NotFoundError) as invalid_context:
            self.client.chat.completions.create(
                **chat(
                    "deepseek-does-not-exist",
                    16,
                    extra_body={"thinking": {"type": "disabled"}},
                )
            )
        self.assertEqual(invalid_context.exception.status_code, 404)

        alias = self.client.chat.completions.create(
            **chat(
                "deepseek-chat",
                32,
                extra_body={"thinking": {"type": "disabled"}},
            )
        )
        self.assertEqual(alias.model, "deepseek-chat")

        self.assertEqual(len(MockHandler.requests), 10)
        self.assertEqual(
            [(item["method"], item["path"]) for item in MockHandler.requests],
            [("GET", "/models")] + [("POST", "/chat/completions")] * 9,
        )
        self.assertEqual(
            MockHandler.requests[2]["body"]["thinking"],
            {"type": "disabled"},
        )
        self.assertEqual(
            MockHandler.requests[3]["body"]["thinking"],
            {"type": "enabled"},
        )
        self.assertEqual(MockHandler.requests[3]["body"]["reasoning_effort"], "high")
        self.assertEqual(
            MockHandler.requests[5]["body"]["response_format"],
            {"type": "json_object"},
        )
        self.assertEqual(
            MockHandler.requests[7]["body"]["messages"][-1]["tool_call_id"],
            call.id,
        )


if __name__ == "__main__":
    unittest.main()
