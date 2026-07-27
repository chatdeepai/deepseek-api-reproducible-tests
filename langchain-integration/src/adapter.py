"""Minimal, explicit ChatDeepSeek construction and local-context composition."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Iterable


@dataclass(frozen=True)
class AdapterSettings:
    model: str
    base_url: str
    max_tokens: int
    thinking: str = "disabled"
    reasoning_effort: str | None = None
    timeout_seconds: float = 30.0
    max_retries: int = 0

    def validate(self) -> None:
        if not self.model or len(self.model) > 120:
            raise ValueError("A bounded model name is required.")
        if self.thinking not in {"enabled", "disabled"}:
            raise ValueError("Thinking must be explicitly enabled or disabled.")
        if not 1 <= self.max_tokens <= 4096:
            raise ValueError("max_tokens is outside the harness boundary.")
        if self.max_retries < 0 or self.max_retries > 2:
            raise ValueError("max_retries is outside the harness boundary.")
        if self.timeout_seconds <= 0 or self.timeout_seconds > 120:
            raise ValueError("timeout_seconds is outside the harness boundary.")
        if not (
            self.base_url.startswith("https://")
            or self.base_url.startswith("http://127.0.0.1:")
            or self.base_url.startswith("http://localhost:")
        ):
            raise ValueError("Only HTTPS or loopback test endpoints are allowed.")


def build_chat_model(settings: AdapterSettings, *, api_key: str) -> Any:
    """Build the provider-specific LangChain wrapper with explicit controls."""
    settings.validate()
    if not api_key:
        raise ValueError("An environment-sourced API key is required.")

    from langchain_deepseek import ChatDeepSeek

    kwargs: dict[str, Any] = {
        "model": settings.model,
        "api_key": api_key,
        "base_url": settings.base_url,
        "temperature": 0,
        "max_tokens": settings.max_tokens,
        "timeout": settings.timeout_seconds,
        "max_retries": settings.max_retries,
        "stream_usage": False,
        "extra_body": {"thinking": {"type": settings.thinking}},
    }
    if settings.reasoning_effort:
        kwargs["reasoning_effort"] = settings.reasoning_effort
    return ChatDeepSeek(**kwargs)


def _tokens(value: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", value.lower()))


def select_local_context(question: str, records: Iterable[str]) -> str:
    """Select one local record using deterministic lexical overlap."""
    question_tokens = _tokens(question)
    ranked = sorted(
        ((len(question_tokens & _tokens(record)), index, record) for index, record in enumerate(records)),
        key=lambda item: (-item[0], item[1]),
    )
    if not ranked or ranked[0][0] == 0:
        return "No matching local context."
    return ranked[0][2]


def build_local_context_runnable(model: Any, records: list[str]) -> Any:
    """Compose a one-record local retriever, prompt, model, and string parser."""
    from langchain_core.output_parsers import StrOutputParser
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.runnables import RunnableLambda, RunnablePassthrough

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "Answer only from the supplied synthetic local context. "
                "If it is insufficient, say so.",
            ),
            ("human", "Context:\n{context}\n\nQuestion:\n{question}"),
        ]
    )
    inputs = {
        "context": RunnableLambda(lambda question: select_local_context(question, records)),
        "question": RunnablePassthrough(),
    }
    return inputs | prompt | model | StrOutputParser()

