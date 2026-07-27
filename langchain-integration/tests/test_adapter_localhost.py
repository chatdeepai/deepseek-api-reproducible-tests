from __future__ import annotations

import asyncio
import unittest

from pydantic import BaseModel, ConfigDict, Field

from src.adapter import (
    AdapterSettings,
    build_chat_model,
    build_local_context_runnable,
)
from tests.mock_server import start_mock_server


PLACEHOLDER = "offline-only-not-a-credential"


class StructuredAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: str
    score: int = Field(ge=0, le=5)


class SyntheticLookup(BaseModel):
    """Look up one synthetic local key."""

    model_config = ConfigDict(extra="forbid")
    key: str


class AdapterLocalhostTests(unittest.TestCase):
    def setUp(self) -> None:
        self.mock = start_mock_server()

    def tearDown(self) -> None:
        self.mock.close()

    def model(
        self,
        *,
        name: str = "deepseek-v4-flash",
        thinking: str = "disabled",
        timeout: float = 2.0,
        retries: int = 0,
    ):
        return build_chat_model(
            AdapterSettings(
                model=name,
                base_url=self.mock.base_url,
                max_tokens=64,
                thinking=thinking,
                reasoning_effort="high" if thinking == "enabled" else None,
                timeout_seconds=timeout,
                max_retries=retries,
            ),
            api_key=PLACEHOLDER,
        )

    def test_sync_async_and_config_pass_through(self) -> None:
        sync_model = self.model(thinking="enabled")
        message = sync_model.invoke("Synthetic offline question.")
        self.assertEqual(message.content, "Synthetic answer.")
        self.assertEqual(
            message.additional_kwargs.get("reasoning_content"),
            "Synthetic reasoning fixture.",
        )

        async_model = self.model()
        async_message = asyncio.run(async_model.ainvoke("Synthetic offline question."))
        self.assertEqual(async_message.content, "Synthetic answer.")

        self.assertEqual(len(self.mock.requests), 2)
        first = self.mock.requests[0]
        self.assertEqual(first["path"], "/chat/completions")
        self.assertEqual(first["body"]["model"], "deepseek-v4-flash")
        self.assertEqual(first["body"]["thinking"], {"type": "enabled"})
        self.assertEqual(first["body"]["reasoning_effort"], "high")

    def test_sync_and_async_streaming(self) -> None:
        sync_chunks = list(self.model().stream("Synthetic offline question."))
        self.assertGreaterEqual(len(sync_chunks), 2)
        self.assertTrue(any(chunk.content for chunk in sync_chunks))

        async def consume() -> list[object]:
            chunks = []
            async for chunk in self.model().astream("Synthetic offline question."):
                chunks.append(chunk)
            return chunks

        async_chunks = asyncio.run(consume())
        self.assertGreaterEqual(len(async_chunks), 2)
        self.assertTrue(any(getattr(chunk, "content", "") for chunk in async_chunks))
        self.assertTrue(all(request["body"]["stream"] is True for request in self.mock.requests))

    def test_structured_output_and_strict_tool_binding(self) -> None:
        model = self.model()
        structured = model.with_structured_output(
            StructuredAnswer,
            method="json_mode",
        )
        parsed = structured.invoke(
            'Return JSON with exactly this shape: {"label":"synthetic","score":1}.'
        )
        self.assertIsInstance(parsed, StructuredAnswer)
        self.assertEqual(parsed.score, 1)

        bound = model.bind_tools(
            [SyntheticLookup],
            tool_choice="SyntheticLookup",
            strict=True,
        )
        tool_message = bound.invoke("Use the synthetic lookup tool.")
        self.assertEqual(len(tool_message.tool_calls), 1)
        self.assertEqual(tool_message.tool_calls[0]["name"], "SyntheticLookup")
        self.assertEqual(tool_message.tool_calls[0]["args"], {"key": "retention"})

        structured_body, tool_body = [request["body"] for request in self.mock.requests]
        self.assertEqual(structured_body["response_format"], {"type": "json_object"})
        self.assertTrue(tool_body["tools"][0]["function"]["strict"])
        self.assertFalse(
            tool_body["tools"][0]["function"]["parameters"]["additionalProperties"]
        )

    def test_local_context_rag_is_one_request_and_injects_selected_record(self) -> None:
        records = [
            "Synthetic retention policy: records are retained for 30 days.",
            "Synthetic support hours: the desk closes at 17:00 UTC.",
        ]
        chain = build_local_context_runnable(self.model(), records)
        result = chain.invoke("How long are retention records kept?")
        self.assertEqual(result, "Synthetic answer.")
        self.assertEqual(len(self.mock.requests), 1)
        messages = self.mock.requests[0]["body"]["messages"]
        self.assertIn("retained for 30 days", messages[-1]["content"])
        self.assertNotIn("closes at 17:00", messages[-1]["content"])


if __name__ == "__main__":
    unittest.main()

