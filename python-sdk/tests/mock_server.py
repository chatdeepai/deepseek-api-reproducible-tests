"""Deterministic localhost server for SDK serialization and resilience tests."""

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
    protocol_version = "HTTP/1.1"
    requests: list[dict[str, Any]] = []
    retry_counts: dict[str, int] = {}
    state_lock = threading.Lock()

    def log_message(self, _format: str, *_args: Any) -> None:
        return

    def _read_body(self) -> dict[str, Any] | None:
        length = int(self.headers.get("content-length", "0"))
        if not length:
            return None
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def _json(
        self,
        status: int,
        body: dict[str, Any],
        *,
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        encoded = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(encoded)))
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        try:
            self.wfile.write(encoded)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            # Expected when a localhost timeout test closes the client socket.
            pass

    @staticmethod
    def _chat(
        body: dict[str, Any],
        message: dict[str, Any],
        finish_reason: str = "stop",
    ) -> dict[str, Any]:
        return {
            "id": "chatcmpl_offline",
            "object": "chat.completion",
            "created": 1,
            "model": body["model"],
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", **message},
                    "finish_reason": finish_reason,
                }
            ],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
        }

    def _stream(self, body: dict[str, Any]) -> None:
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.send_header("cache-control", "no-cache")
        self.send_header("connection", "close")
        self.end_headers()

        deltas: list[dict[str, Any]] = []
        if body.get("thinking", {}).get("type") == "enabled":
            deltas.append({"role": "assistant", "reasoning_content": "Synthetic reasoning."})
        else:
            deltas.append({"role": "assistant"})
        deltas.extend([{"content": "O"}, {"content": "K"}])

        for delta in deltas:
            chunk = {
                "id": "chatcmpl_offline_stream",
                "object": "chat.completion.chunk",
                "created": 1,
                "model": body["model"],
                "choices": [{"index": 0, "delta": delta, "finish_reason": None}],
            }
            self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode("utf-8"))

        terminal = {
            "id": "chatcmpl_offline_stream",
            "object": "chat.completion.chunk",
            "created": 1,
            "model": body["model"],
            "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
        }
        self.wfile.write(f"data: {json.dumps(terminal)}\n\n".encode("utf-8"))
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()
        self.close_connection = True

    def do_POST(self) -> None:
        body = self._read_body()
        offline_case = self.headers.get("x-offline-case", "unspecified")
        with self.state_lock:
            self.__class__.requests.append(
                {
                    "method": "POST",
                    "path": self.path,
                    "offline_case": offline_case,
                    "body": body,
                }
            )

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

        if offline_case == "timeout":
            time.sleep(0.2)
            try:
                self._json(200, self._chat(body, {"content": "Late synthetic answer."}))
            except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
                pass
            return

        if offline_case in {"retry-always-500", "retry-then-success"}:
            with self.state_lock:
                attempt = self.__class__.retry_counts.get(offline_case, 0) + 1
                self.__class__.retry_counts[offline_case] = attempt
            if offline_case == "retry-always-500" or attempt <= 2:
                self._json(
                    500,
                    {
                        "error": {
                            "message": "Synthetic transient server error.",
                            "type": "server_error",
                            "code": "synthetic_server_error",
                        }
                    },
                    extra_headers={"x-should-retry": "true"},
                )
                return

        if offline_case.endswith("invalid-model") or body["model"] == "deepseek-does-not-exist":
            self._json(
                400,
                {
                    "error": {
                        "message": "Synthetic invalid model.",
                        "type": "invalid_request_error",
                        "param": "model",
                        "code": "invalid_request_error",
                    }
                },
            )
            return

        if body.get("stream") is True:
            self._stream(body)
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
                        "reasoning_content": "Synthetic reasoning.",
                    },
                ),
            )
            return

        self._json(200, self._chat(body, {"content": "OK"}))


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
    MockHandler.retry_counts = {}
    server = QuietThreadingHTTPServer(("127.0.0.1", 0), MockHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address
    return MockServer(server=server, thread=thread, base_url=f"http://{host}:{port}")
