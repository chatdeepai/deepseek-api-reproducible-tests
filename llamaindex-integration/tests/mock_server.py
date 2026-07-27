from __future__ import annotations

import json
import sys
import threading
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


class QuietThreadingHTTPServer(ThreadingHTTPServer):
    def handle_error(self, request: Any, client_address: Any) -> None:
        error = sys.exc_info()[1]
        if isinstance(
            error,
            (BrokenPipeError, ConnectionAbortedError, ConnectionResetError),
        ):
            return
        super().handle_error(request, client_address)


class MockHandler(BaseHTTPRequestHandler):
    requests: list[dict[str, Any]] = []
    lock = threading.Lock()

    def log_message(self, format: str, *args: Any) -> None:
        return

    def _read_json(self) -> dict[str, Any]:
        try:
            length = int(self.headers.get("content-length", "0"))
            value = json.loads(self.rfile.read(length))
        except (ValueError, json.JSONDecodeError):
            return {}
        return value if isinstance(value, dict) else {}

    def _write_json(self, status: int, value: dict[str, Any]) -> None:
        encoded = json.dumps(value).encode("ascii")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(encoded)))
        self.end_headers()
        try:
            self.wfile.write(encoded)
            self.wfile.flush()
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    @staticmethod
    def _completion(
        body: dict[str, Any],
        message: dict[str, Any],
        finish_reason: str = "stop",
    ) -> dict[str, Any]:
        return {
            "id": "offline-completion",
            "object": "chat.completion",
            "created": 1,
            "model": body.get("model", "offline-model"),
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", **message},
                    "finish_reason": finish_reason,
                }
            ],
            "usage": {"prompt_tokens": 4, "completion_tokens": 2, "total_tokens": 6},
        }

    def _stream(self, body: dict[str, Any]) -> None:
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.send_header("cache-control", "no-cache")
        self.send_header("connection", "close")
        self.end_headers()
        deltas = [{"role": "assistant"}, {"content": "S"}, {"content": "ynthetic"}]
        if body.get("thinking", {}).get("type") == "enabled":
            deltas.insert(1, {"reasoning_content": "Synthetic reasoning fixture."})
        try:
            for delta in deltas:
                chunk = {
                    "id": "offline-stream",
                    "object": "chat.completion.chunk",
                    "created": 1,
                    "model": body.get("model", "offline-model"),
                    "choices": [{"index": 0, "delta": delta, "finish_reason": None}],
                }
                self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode("ascii"))
            terminal = {
                "id": "offline-stream",
                "object": "chat.completion.chunk",
                "created": 1,
                "model": body.get("model", "offline-model"),
                "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
            }
            self.wfile.write(f"data: {json.dumps(terminal)}\n\n".encode("ascii"))
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass
        self.close_connection = True

    def do_POST(self) -> None:
        body = self._read_json()
        with self.lock:
            self.__class__.requests.append({"path": self.path, "body": body})

        if self.path not in {
            "/chat/completions",
            "/v1/chat/completions",
            "/beta/chat/completions",
        }:
            self._write_json(
                404,
                {"error": {"message": "Synthetic route.", "code": "route_not_found"}},
            )
            return

        model = body.get("model")
        if model == "synthetic-slow":
            time.sleep(0.35)
        if model == "synthetic-always-500":
            self._write_json(
                500,
                {
                    "error": {
                        "message": "Synthetic transient failure.",
                        "type": "server_error",
                        "code": "synthetic_server_error",
                    }
                },
            )
            return
        if model == "deepseek-does-not-exist":
            self._write_json(
                400,
                {
                    "error": {
                        "message": "Synthetic invalid model.",
                        "type": "invalid_request_error",
                        "code": "invalid_model",
                    }
                },
            )
            return
        if body.get("stream") is True:
            self._stream(body)
            return

        messages = body.get("messages", [])
        if isinstance(messages, list) and any(
            isinstance(message, dict) and message.get("role") == "tool"
            for message in messages
        ):
            self._write_json(200, self._completion(body, {"content": "Synthetic final."}))
            return

        tools = body.get("tools")
        if isinstance(tools, list) and tools:
            function = tools[0].get("function", {})
            name = function.get("name", "SyntheticLookup")
            arguments = (
                '{"label":"synthetic","score":1}'
                if "Structured" in name or "Answer" in name
                else '{"key":"retention"}'
            )
            self._write_json(
                200,
                self._completion(
                    body,
                    {
                        "content": "",
                        "tool_calls": [
                            {
                                "id": "offline-tool-call",
                                "type": "function",
                                "function": {"name": name, "arguments": arguments},
                            }
                        ],
                    },
                    "tool_calls",
                ),
            )
            return

        response_format = body.get("response_format", {})
        if isinstance(response_format, dict) and response_format.get("type") in {
            "json_object",
            "json_schema",
        }:
            self._write_json(
                200,
                self._completion(body, {"content": '{"label":"synthetic","score":1}'}),
            )
            return

        message: dict[str, Any] = {"content": "Synthetic answer."}
        if body.get("thinking", {}).get("type") == "enabled":
            message["reasoning_content"] = "Synthetic reasoning fixture."
        self._write_json(200, self._completion(body, message))


@dataclass
class MockServer:
    server: QuietThreadingHTTPServer
    thread: threading.Thread
    base_url: str

    @property
    def requests(self) -> list[dict[str, Any]]:
        return MockHandler.requests

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)


def start_mock_server() -> MockServer:
    MockHandler.requests = []
    server = QuietThreadingHTTPServer(("127.0.0.1", 0), MockHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address
    return MockServer(server=server, thread=thread, base_url=f"http://{host}:{port}")
