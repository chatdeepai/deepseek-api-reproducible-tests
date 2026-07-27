from __future__ import annotations

import asyncio
import unittest

from llama_index.core.llms import ChatMessage, MessageRole
from llama_index.core.base.llms.types import ThinkingBlock

from src.models import build_model
from tests.mock_server import MockServer, start_mock_server


class AdapterLocalhostTests(unittest.TestCase):
    server: MockServer

    def setUp(self) -> None:
        self.server = start_mock_server()

    def tearDown(self) -> None:
        self.server.close()

    def model(self, **kwargs):
        return build_model(
            model=kwargs.pop("model", "deepseek-v4-flash"),
            api_base=self.server.base_url,
            **kwargs,
        )

    @staticmethod
    def messages() -> list[ChatMessage]:
        return [ChatMessage(role=MessageRole.USER, content="Synthetic offline question.")]

    def test_sync_and_async_chat_use_real_wrapper(self) -> None:
        sync_response = self.model().chat(self.messages())
        async_response = asyncio.run(self.model().achat(self.messages()))
        self.assertEqual(sync_response.message.content, "Synthetic answer.")
        self.assertEqual(async_response.message.content, "Synthetic answer.")
        self.assertEqual(len(self.server.requests), 2)

    def test_sync_and_async_complete_use_chat_endpoint(self) -> None:
        sync_response = self.model().complete("Synthetic offline question.")
        async_response = asyncio.run(
            self.model().acomplete("Synthetic offline question.")
        )
        self.assertEqual(sync_response.text, "Synthetic answer.")
        self.assertEqual(async_response.text, "Synthetic answer.")
        self.assertTrue(
            all(request["path"].endswith("/chat/completions") for request in self.server.requests)
        )

    def test_sync_chat_stream_aggregates_content(self) -> None:
        chunks = list(self.model().stream_chat(self.messages()))
        self.assertGreaterEqual(len(chunks), 3)
        self.assertEqual(chunks[-1].message.content, "Synthetic")

    def test_async_chat_stream_aggregates_content(self) -> None:
        async def collect():
            stream = await self.model().astream_chat(self.messages())
            return [chunk async for chunk in stream]

        chunks = asyncio.run(collect())
        self.assertGreaterEqual(len(chunks), 3)
        self.assertEqual(chunks[-1].message.content, "Synthetic")

    def test_sync_complete_stream_aggregates_content(self) -> None:
        chunks = list(self.model().stream_complete("Synthetic offline question."))
        self.assertGreaterEqual(len(chunks), 3)
        self.assertEqual(chunks[-1].text, "Synthetic")

    def test_async_complete_stream_aggregates_content(self) -> None:
        async def collect():
            stream = await self.model().astream_complete(
                "Synthetic offline question."
            )
            return [chunk async for chunk in stream]

        chunks = asyncio.run(collect())
        self.assertGreaterEqual(len(chunks), 3)
        self.assertEqual(chunks[-1].text, "Synthetic")

    def test_thinking_field_serializes_and_reasoning_is_preserved(self) -> None:
        model = self.model(
            model="deepseek-v4-pro",
            thinking=True,
        )
        response = model.chat(self.messages())
        body = self.server.requests[-1]["body"]
        self.assertEqual(model.metadata.context_window, 1_000_000)
        self.assertEqual(body["thinking"], {"type": "enabled"})
        self.assertNotIn("context_window", body)
        self.assertTrue(
            any(isinstance(block, ThinkingBlock) for block in response.message.blocks)
        )


if __name__ == "__main__":
    unittest.main()
