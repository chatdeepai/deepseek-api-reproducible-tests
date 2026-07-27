# Official Sources

Source review date: 2026-07-27.

Only first-party OpenAI and DeepSeek sources define this harness contract.

## OpenAI Python SDK

- [Official OpenAI Python repository](https://github.com/openai/openai-python)
- [OpenAI Python README](https://github.com/openai/openai-python/blob/main/README.md)
- [OpenAI Python package metadata](https://github.com/openai/openai-python/blob/main/pyproject.toml)
- [OpenAI Python streaming helpers](https://github.com/openai/openai-python/blob/main/helpers.md)

The reviewed official package metadata reports version `2.48.0` and Python 3.10 or newer. The README documents `OpenAI`, `AsyncOpenAI`, custom `base_url`, synchronous and asynchronous streaming, typed API status errors, configurable timeouts, and automatic retries. It also states that connection errors, HTTP 408, 409, 429, and server errors are retried twice by default unless `max_retries` changes that behavior.

## DeepSeek

- [Models and pricing](https://api-docs.deepseek.com/quick_start/pricing/)
- [Python OpenAI SDK sample](https://api-docs.deepseek.com/api_samples/chat_python/)
- [Create Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion/)
- [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/)
- [JSON Output](https://api-docs.deepseek.com/guides/json_mode/)
- [Tool Calls](https://api-docs.deepseek.com/guides/tool_calls/)
- [Error Codes](https://api-docs.deepseek.com/quick_start/error_codes/)

The reviewed DeepSeek docs use `https://api.deepseek.com` as the OpenAI-format API origin. For the OpenAI Python SDK, DeepSeek instructs callers to pass `thinking` through `extra_body`. Thinking defaults to enabled, so this plan always chooses `enabled` or `disabled` explicitly. JSON Output requires `response_format.type=json_object` and an explicit JSON instruction. Tool continuation requires the assistant tool-call message plus a matching `tool_call_id`.

## Scope boundary

This page is Python-specific. It does not repeat the separate Python-versus-Node compatibility study, legacy alias probes, or OpenAI Responses API compatibility testing. It covers the current OpenAI Python SDK as a production client for DeepSeek's documented Chat Completions surface.

