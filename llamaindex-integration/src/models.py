from __future__ import annotations

from typing import Any

from llama_index.llms.deepseek import DeepSeek


OFFLINE_PLACEHOLDER = "offline-only-not-a-credential"


def build_model(
    *,
    model: str,
    api_base: str,
    api_key: str = OFFLINE_PLACEHOLDER,
    thinking: bool = False,
    function_calling: bool | None = None,
    timeout: float = 30.0,
    max_tokens: int = 32,
) -> DeepSeek:
    kwargs: dict[str, Any] = {
        "model": model,
        "api_base": api_base,
        "api_key": api_key,
        "max_retries": 0,
        "timeout": timeout,
        "max_tokens": max_tokens,
        "context_window": 1_000_000,
        "reuse_client": True,
        "additional_kwargs": {
            "extra_body": {
                "thinking": {"type": "enabled" if thinking else "disabled"}
            }
        },
    }
    if function_calling is not None:
        kwargs["is_function_calling_model"] = function_calling
    return DeepSeek(**kwargs)
