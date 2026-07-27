# Official Sources

Source review date: 2026-07-27.

Only first-party OpenAI and DeepSeek sources are used for the harness contract. A source documents a supported request shape; it does not prove that every OpenAI API surface is implemented by DeepSeek.

## DeepSeek

- [Models and pricing](https://api-docs.deepseek.com/quick_start/pricing/)
- [List models](https://api-docs.deepseek.com/api/list-models/)
- [Create chat completion](https://api-docs.deepseek.com/api/create-chat-completion/)
- [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/)
- [JSON Output](https://api-docs.deepseek.com/guides/json_mode/)
- [Tool Calls](https://api-docs.deepseek.com/guides/tool_calls/)
- [Error Codes](https://api-docs.deepseek.com/quick_start/error_codes/)
- [Python OpenAI SDK sample](https://api-docs.deepseek.com/api_samples/chat_python/)
- [Node.js OpenAI SDK sample](https://api-docs.deepseek.com/api_samples/chat_nodejs/)

The reviewed DeepSeek docs identify `https://api.deepseek.com` as the OpenAI-format origin, document `GET /models` and `POST /chat/completions`, use `max_tokens`, require provider-specific thinking fields, and require the word `json` plus `response_format.type=json_object` for JSON Output. The tool-call guide requires the assistant tool-call message and a matching `tool_call_id` on the tool result.

## OpenAI SDKs

- [OpenAI Python repository and README](https://github.com/openai/openai-python)
- [OpenAI Python package metadata](https://github.com/openai/openai-python/blob/main/pyproject.toml)
- [OpenAI Node repository and README](https://github.com/openai/openai-node)
- [OpenAI Node package metadata](https://github.com/openai/openai-node/blob/master/package.json)
- [Chat Completions API reference](https://platform.openai.com/docs/api-reference/chat/create)

The source snapshots reviewed on 2026-07-27 reported OpenAI Python `2.48.0` with Python 3.10 or newer and OpenAI Node `6.49.0` with Node 20 or newer. Both official SDKs document custom API origins, Chat Completions, streaming, typed status errors, and retry controls. The harness pins those reviewed versions and explicitly sets retries to zero.

## Compatibility boundary

The harness tests the OpenAI SDKs as HTTP clients for the DeepSeek OpenAI-compatible Chat Completions surface. It does not claim support for the OpenAI Responses API, Assistants, Realtime, Files, Batches, embeddings, fine-tuning, or any other untested endpoint.
