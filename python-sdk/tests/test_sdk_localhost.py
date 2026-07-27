from __future__ import annotations

import asyncio
import json
import unittest
from typing import Any

import openai
from openai import AsyncOpenAI, OpenAI

from tests.mock_server import start_mock_server


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


def body(
    model: str,
    max_tokens: int,
    thinking: str,
    *,
    stream: bool = False,
    reasoning_effort: str | None = None,
    **extra: Any,
) -> dict[str, Any]:
    value: dict[str, Any] = {
        "model": model,
        "messages": [{"role": "user", "content": "Synthetic offline prompt."}],
        "max_tokens": max_tokens,
        "stream": stream,
        "extra_body": {"thinking": {"type": thinking}},
        **extra,
    }
    if reasoning_effort:
        value["reasoning_effort"] = reasoning_effort
    return value


class SdkLocalhostTests(unittest.TestCase):
    def setUp(self) -> None:
        self.mock = start_mock_server()

    def tearDown(self) -> None:
        self.mock.close()

    def test_full_fourteen_request_serial_matrix(self) -> None:
        self.assertEqual(openai.__version__, "2.48.0")

        with OpenAI(
            api_key=OFFLINE_PLACEHOLDER,
            base_url=self.mock.base_url,
            max_retries=0,
            timeout=2.0,
        ) as client:
            disabled = client.chat.completions.create(
                **body("deepseek-v4-flash", 32, "disabled"),
                extra_headers={"x-offline-case": "sync-standard-disabled"},
            )
            self.assertEqual(disabled.choices[0].message.content, "OK")

            enabled = client.chat.completions.create(
                **body(
                    "deepseek-v4-pro",
                    96,
                    "enabled",
                    reasoning_effort="high",
                ),
                extra_headers={"x-offline-case": "sync-standard-enabled"},
            )
            self.assertEqual(
                enabled.choices[0].message.reasoning_content,
                "Synthetic reasoning.",
            )

            for case_name, thinking, model, max_tokens in [
                ("sync-stream-disabled", "disabled", "deepseek-v4-flash", 32),
                ("sync-stream-enabled", "enabled", "deepseek-v4-pro", 96),
            ]:
                stream = client.chat.completions.create(
                    **body(
                        model,
                        max_tokens,
                        thinking,
                        stream=True,
                        reasoning_effort="high" if thinking == "enabled" else None,
                    ),
                    extra_headers={"x-offline-case": case_name},
                )
                content_seen = False
                finish = None
                for chunk in stream:
                    content_seen = content_seen or bool(
                        chunk.choices[0].delta.content
                    )
                    finish = chunk.choices[0].finish_reason or finish
                self.assertTrue(content_seen)
                self.assertEqual(finish, "stop")

            json_response = client.chat.completions.create(
                **body(
                    "deepseek-v4-flash",
                    64,
                    "disabled",
                    response_format={"type": "json_object"},
                ),
                extra_headers={"x-offline-case": "sync-json-output"},
            )
            self.assertEqual(
                json.loads(json_response.choices[0].message.content),
                {"ok": True},
            )

            with self.assertRaises(openai.BadRequestError) as sync_error:
                client.chat.completions.create(
                    **body("deepseek-does-not-exist", 16, "disabled"),
                    extra_headers={"x-offline-case": "sync-invalid-model"},
                )
            self.assertEqual(sync_error.exception.status_code, 400)

        asyncio.run(self._run_async_matrix())

        self.assertEqual(len(self.mock.requests), 14)
        self.assertEqual(
            [request["offline_case"] for request in self.mock.requests],
            [
                "sync-standard-disabled",
                "sync-standard-enabled",
                "sync-stream-disabled",
                "sync-stream-enabled",
                "sync-json-output",
                "sync-invalid-model",
                "async-standard-disabled",
                "async-standard-enabled",
                "async-stream-disabled",
                "async-stream-enabled",
                "async-json-output",
                "async-tool-initial",
                "async-tool-continuation",
                "async-invalid-model",
            ],
        )
        self.assertTrue(
            all(request["path"] == "/chat/completions" for request in self.mock.requests)
        )
        self.assertEqual(
            self.mock.requests[0]["body"]["thinking"],
            {"type": "disabled"},
        )
        self.assertEqual(
            self.mock.requests[1]["body"]["thinking"],
            {"type": "enabled"},
        )
        self.assertEqual(self.mock.requests[1]["body"]["reasoning_effort"], "high")
        self.assertEqual(
            self.mock.requests[4]["body"]["response_format"],
            {"type": "json_object"},
        )
        initial_call_id = self.mock.requests[11]["body"].get("tools")
        self.assertIsNotNone(initial_call_id)
        self.assertEqual(
            self.mock.requests[12]["body"]["messages"][-1]["tool_call_id"],
            "call_offline_T1",
        )

    async def _run_async_matrix(self) -> None:
        async with AsyncOpenAI(
            api_key=OFFLINE_PLACEHOLDER,
            base_url=self.mock.base_url,
            max_retries=0,
            timeout=2.0,
        ) as client:
            disabled = await client.chat.completions.create(
                **body("deepseek-v4-flash", 32, "disabled"),
                extra_headers={"x-offline-case": "async-standard-disabled"},
            )
            self.assertEqual(disabled.choices[0].message.content, "OK")

            enabled = await client.chat.completions.create(
                **body(
                    "deepseek-v4-pro",
                    96,
                    "enabled",
                    reasoning_effort="high",
                ),
                extra_headers={"x-offline-case": "async-standard-enabled"},
            )
            self.assertEqual(
                enabled.choices[0].message.reasoning_content,
                "Synthetic reasoning.",
            )

            for case_name, thinking, model, max_tokens in [
                ("async-stream-disabled", "disabled", "deepseek-v4-flash", 32),
                ("async-stream-enabled", "enabled", "deepseek-v4-pro", 96),
            ]:
                stream = await client.chat.completions.create(
                    **body(
                        model,
                        max_tokens,
                        thinking,
                        stream=True,
                        reasoning_effort="high" if thinking == "enabled" else None,
                    ),
                    extra_headers={"x-offline-case": case_name},
                )
                content_seen = False
                finish = None
                async for chunk in stream:
                    content_seen = content_seen or bool(
                        chunk.choices[0].delta.content
                    )
                    finish = chunk.choices[0].finish_reason or finish
                self.assertTrue(content_seen)
                self.assertEqual(finish, "stop")

            json_response = await client.chat.completions.create(
                **body(
                    "deepseek-v4-flash",
                    64,
                    "disabled",
                    response_format={"type": "json_object"},
                ),
                extra_headers={"x-offline-case": "async-json-output"},
            )
            self.assertEqual(
                json.loads(json_response.choices[0].message.content),
                {"ok": True},
            )

            initial = await client.chat.completions.create(
                **body(
                    "deepseek-v4-flash",
                    64,
                    "disabled",
                    tools=[TOOL],
                    tool_choice={
                        "type": "function",
                        "function": {"name": "get_temperature"},
                    },
                ),
                extra_headers={"x-offline-case": "async-tool-initial"},
            )
            call = initial.choices[0].message.tool_calls[0]
            self.assertEqual(json.loads(call.function.arguments), {"city": "Oslo"})

            continuation = await client.chat.completions.create(
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
                extra_headers={"x-offline-case": "async-tool-continuation"},
            )
            self.assertEqual(continuation.choices[0].finish_reason, "stop")

            with self.assertRaises(openai.BadRequestError) as async_error:
                await client.chat.completions.create(
                    **body("deepseek-does-not-exist", 16, "disabled"),
                    extra_headers={"x-offline-case": "async-invalid-model"},
                )
            self.assertEqual(async_error.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()

