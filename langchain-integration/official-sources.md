# Official sources

Documentation review date: July 27, 2026.

Only first-party DeepSeek material, official LangChain documentation, the official LangChain repository, and the target site page were used.

| Source | Owner | Use in the rewrite |
|---|---|---|
| https://chat-deep.ai/docs/deepseek-langchain-integration/ | Chat-Deep.ai | Existing-page audit, scope, internal-link inventory, and stale-claim identification |
| https://docs.langchain.com/oss/python/integrations/chat/deepseek | LangChain | Dedicated Python package, `ChatDeepSeek`, credentials, installation, invocation, and documented feature surface |
| https://reference.langchain.com/python/langchain-deepseek/chat_models/ChatDeepSeek | LangChain | Current `ChatDeepSeek` methods, sync, async, streaming, tool binding, structured output, usage metadata, and response metadata |
| https://github.com/langchain-ai/langchain/tree/master/libs/partners/deepseek | LangChain | Official integration package repository and package boundary |
| https://github.com/langchain-ai/langchain/blob/master/libs/partners/deepseek/langchain_deepseek/chat_models.py | LangChain | Current wrapper implementation: default and beta origins, reasoning preservation, `bind_tools`, `with_structured_output`, strict-mode routing, and error behavior |
| https://github.com/langchain-ai/langchain/blob/master/libs/partners/deepseek/pyproject.toml | LangChain | Dated package metadata, Python requirement, and dependency boundary |
| https://docs.langchain.com/oss/javascript/integrations/chat/deepseek | LangChain | Dedicated JavaScript and TypeScript package, credentials, installation, constructor, invocation, and documented feature surface |
| https://reference.langchain.com/javascript/langchain-deepseek/ChatDeepSeek | LangChain | JavaScript `ChatDeepSeek` constructor and Runnable methods |
| https://github.com/langchain-ai/langchainjs/tree/main/libs/providers/langchain-deepseek | LangChain | Official `@langchain/deepseek` package source |
| https://github.com/langchain-ai/langchainjs/blob/main/libs/providers/langchain-deepseek/package.json | LangChain | Dated JavaScript package metadata; version 1.1.5 at review |
| https://github.com/langchain-ai/langchainjs/blob/main/libs/providers/langchain-deepseek/profiles.toml | LangChain | Current model-profile evidence, including DeepSeek V4 identifiers |
| https://docs.langchain.com/oss/python/langchain/models | LangChain | `invoke`, `stream`, async methods, batch concurrency, tool calling, structured output, and message aggregation |
| https://docs.langchain.com/oss/python/langchain/retrieval | LangChain | Retrieval building blocks and the distinction between two-step, agentic, and hybrid RAG |
| https://docs.langchain.com/oss/python/langchain/agents | LangChain | Current `create_agent` pattern, model instances, tools, stop conditions, middleware, and agent safety boundaries |
| https://docs.langchain.com/oss/python/langchain/tools | LangChain | Tool schemas, the `@tool` decorator, structured tool results, and execution ownership |
| https://docs.langchain.com/oss/python/langchain/structured-output | LangChain | Structured-output strategies, schema validation, and agent response formats |
| https://docs.langchain.com/oss/python/langchain/test/unit-testing | LangChain | `GenericFakeChatModel` and deterministic tests without provider calls |
| https://docs.langchain.com/oss/python/langchain/test/integration-testing | LangChain | Separation of local unit tests from opt-in provider integration tests |
| https://api-docs.deepseek.com/faq/ | DeepSeek | First-party confirmation that the DeepSeek API can be used with LangChain |
| https://api-docs.deepseek.com/quick_start/pricing/ | DeepSeek | Current model IDs and feature matrix only; no prices copied into the article |
| https://api-docs.deepseek.com/guides/thinking_mode/ | DeepSeek | Thinking default, explicit toggle, effort behavior, unsupported sampling controls, reasoning field, and tool replay requirements |
| https://api-docs.deepseek.com/guides/json_mode/ | DeepSeek | JSON Output requirements, empty-content caveat, and truncation risk |
| https://api-docs.deepseek.com/guides/tool_calls/ | DeepSeek | Provider tool-call flow, application-owned execution, and strict beta schema requirements |
| https://api-docs.deepseek.com/quick_start/error_codes/ | DeepSeek | Provider error categories and high-level recovery guidance |
| https://api-docs.deepseek.com/quick_start/rate_limit/ | DeepSeek | Account-level concurrency semantics, HTTP 429 behavior, `user_id`, and keep-alive behavior |

## Source-reconciliation notes

- The official LangChain integration page still includes older `deepseek-chat` and `deepseek-reasoner` examples.
- The official LangChain JavaScript integration page and reference also retain older alias examples.
- Current DeepSeek documentation identifies `deepseek-v4-flash` and `deepseek-v4-pro` as the active model IDs and assigns the older aliases a July 24, 2026 retirement deadline.
- At review, official package metadata identified `langchain-deepseek` 1.1.0 with Python 3.10 or newer and `@langchain/deepseek` 1.1.5. These are dated source facts, not permanent version recommendations.
- The rewrite therefore uses the current DeepSeek model IDs while using LangChain sources for package and wrapper mechanics.
- The article does not state whether a retired alias still responds after the deadline because that requires a dated live request.
- The current LangChain wrapper source is documentation evidence, not proof of a deployed provider response. All response-level claims remain in marked future evidence slots.
