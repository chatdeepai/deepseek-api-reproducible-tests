from __future__ import annotations

import asyncio
import unittest

import openai

from src.adapter import AdapterSettings, build_chat_model
from tests.mock_server import start_mock_server


PLACEHOLDER = "offline-only-not-a-credential"


class ResilienceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.mock = start_mock_server()

    def tearDown(self) -> None:
        self.mock.close()

    def model(self, name: str, *, timeout: float = 2.0, retries: int = 0):
        return build_chat_model(
            AdapterSettings(
                model=name,
                base_url=self.mock.base_url,
                max_tokens=16,
                timeout_seconds=timeout,
                max_retries=retries,
            ),
            api_key=PLACEHOLDER,
        )

    def test_typed_provider_error_and_zero_transport_retries(self) -> None:
        with self.assertRaises(openai.InternalServerError):
            self.model("synthetic-always-500").invoke("Synthetic offline question.")
        self.assertEqual(len(self.mock.requests), 1)

    def test_explicit_runnable_retry_is_separate_from_transport_retry(self) -> None:
        runnable = self.model("synthetic-always-500").with_retry(
            retry_if_exception_type=(openai.InternalServerError,),
            wait_exponential_jitter=False,
            stop_after_attempt=2,
        )
        with self.assertRaises(openai.InternalServerError):
            runnable.invoke("Synthetic offline question.")
        self.assertEqual(len(self.mock.requests), 2)

    def test_timeout_is_typed_and_not_retried(self) -> None:
        with self.assertRaises(openai.APITimeoutError):
            self.model("synthetic-slow", timeout=0.03).invoke(
                "Synthetic offline question."
            )
        self.assertEqual(len(self.mock.requests), 1)

    def test_async_cancellation_propagates_without_retry(self) -> None:
        asyncio.run(self._cancel_once())
        self.assertEqual(len(self.mock.requests), 1)

    async def _cancel_once(self) -> None:
        task = asyncio.create_task(
            self.model("synthetic-slow").ainvoke("Synthetic offline question.")
        )
        for _ in range(50):
            if self.mock.requests:
                break
            await asyncio.sleep(0.005)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task


if __name__ == "__main__":
    unittest.main()

