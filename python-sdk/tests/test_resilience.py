from __future__ import annotations

import asyncio
import unittest

import openai
from openai import AsyncOpenAI, OpenAI

from tests.mock_server import start_mock_server


OFFLINE_PLACEHOLDER = "offline-only-not-a-credential"


def request_body() -> dict[str, object]:
    return {
        "model": "deepseek-v4-flash",
        "messages": [{"role": "user", "content": "Synthetic offline prompt."}],
        "max_tokens": 16,
        "extra_body": {"thinking": {"type": "disabled"}},
    }


class ResilienceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.mock = start_mock_server()

    def tearDown(self) -> None:
        self.mock.close()

    def test_max_retries_zero_sends_one_attempt(self) -> None:
        with OpenAI(
            api_key=OFFLINE_PLACEHOLDER,
            base_url=self.mock.base_url,
            max_retries=0,
            timeout=2.0,
        ) as client:
            with self.assertRaises(openai.InternalServerError):
                client.chat.completions.create(
                    **request_body(),
                    extra_headers={"x-offline-case": "retry-always-500"},
                )
        self.assertEqual(len(self.mock.requests), 1)

    def test_two_retries_send_three_attempts_before_success(self) -> None:
        with OpenAI(
            api_key=OFFLINE_PLACEHOLDER,
            base_url=self.mock.base_url,
            max_retries=2,
            timeout=2.0,
        ) as client:
            response = client.chat.completions.create(
                **request_body(),
                extra_headers={"x-offline-case": "retry-then-success"},
            )
        self.assertEqual(response.choices[0].message.content, "OK")
        self.assertEqual(len(self.mock.requests), 3)

    def test_sync_timeout_maps_to_api_timeout_without_retry(self) -> None:
        with OpenAI(
            api_key=OFFLINE_PLACEHOLDER,
            base_url=self.mock.base_url,
            max_retries=0,
            timeout=0.03,
        ) as client:
            with self.assertRaises(openai.APITimeoutError):
                client.chat.completions.create(
                    **request_body(),
                    extra_headers={"x-offline-case": "timeout"},
                )
        self.assertEqual(len(self.mock.requests), 1)

    def test_async_timeout_maps_to_api_timeout_without_retry(self) -> None:
        asyncio.run(self._run_async_timeout())
        self.assertEqual(len(self.mock.requests), 1)

    async def _run_async_timeout(self) -> None:
        async with AsyncOpenAI(
            api_key=OFFLINE_PLACEHOLDER,
            base_url=self.mock.base_url,
            max_retries=0,
            timeout=0.03,
        ) as client:
            with self.assertRaises(openai.APITimeoutError):
                await client.chat.completions.create(
                    **request_body(),
                    extra_headers={"x-offline-case": "timeout"},
                )


if __name__ == "__main__":
    unittest.main()
