from __future__ import annotations

import asyncio
import unittest

from openai import APIStatusError, APITimeoutError
from llama_index.core.llms import ChatMessage, MessageRole

from src.models import build_model
from tests.mock_server import MockServer, start_mock_server


class ResilienceTests(unittest.TestCase):
    server: MockServer

    def setUp(self) -> None:
        self.server = start_mock_server()

    def tearDown(self) -> None:
        self.server.close()

    @staticmethod
    def messages() -> list[ChatMessage]:
        return [ChatMessage(role=MessageRole.USER, content="Synthetic offline question.")]

    def model(self, model: str, *, timeout: float = 1.0):
        return build_model(
            model=model,
            api_base=self.server.base_url,
            timeout=timeout,
        )

    def test_typed_provider_error_is_not_retried(self) -> None:
        with self.assertRaises(APIStatusError) as captured:
            self.model("synthetic-always-500").chat(self.messages())
        self.assertEqual(captured.exception.status_code, 500)
        self.assertEqual(len(self.server.requests), 1)

    def test_invalid_model_error_is_typed_and_not_retried(self) -> None:
        with self.assertRaises(APIStatusError) as captured:
            self.model("deepseek-does-not-exist").chat(self.messages())
        self.assertEqual(captured.exception.status_code, 400)
        self.assertEqual(len(self.server.requests), 1)

    def test_timeout_is_typed_and_not_retried(self) -> None:
        with self.assertRaises(APITimeoutError):
            self.model("synthetic-slow", timeout=0.05).chat(self.messages())
        self.assertEqual(len(self.server.requests), 1)

    def test_async_cancellation_propagates_without_retry(self) -> None:
        async def run() -> None:
            model = self.model("synthetic-slow", timeout=1.0)
            try:
                task = asyncio.create_task(model.achat(self.messages()))
                await asyncio.sleep(0.05)
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await task
            finally:
                await model._get_aclient().close()

        asyncio.run(run())
        self.assertLessEqual(len(self.server.requests), 1)


if __name__ == "__main__":
    unittest.main()
