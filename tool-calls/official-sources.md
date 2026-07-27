# Official DeepSeek Source Register

Checked for the offline design on 2026-07-27. Only first-party DeepSeek documentation is used.

| Official source | Contract encoded by this suite |
|---|---|
| [Tool Calls guide](https://api-docs.deepseek.com/guides/tool_calls/) | The application executes functions; thinking and non-thinking modes support tools; strict mode uses the Beta base URL; every strict function sets `strict: true`; object properties are required; `additionalProperties` is false; supported schema types and documented unsupported keywords. |
| [Create Chat Completion reference](https://api-docs.deepseek.com/api/create-chat-completion/) | `tools`, function name and parameters, the 128-function maximum, `tool_choice` values and named form, `finish_reason: tool_calls`, tool-call IDs, JSON argument strings, tool result messages, and the warning to validate generated arguments. |
| [Thinking Mode guide](https://api-docs.deepseek.com/guides/thinking_mode/) | When a thinking turn performs a tool call, the complete `reasoning_content` must be passed back in subsequent requests; incorrect replay returns HTTP 400. |

## Evidence classification

- These pages define the official contract.
- Local fixtures test the application implementation against that contract.
- No provider request was made for this suite.
- No local passing case should be described as observed DeepSeek model behavior.
- A later live benchmark must record its own date, models, request count, statuses, token budget, and limitations.

The completed dated evidence is documented separately in [`LIVE_RUN.md`](./LIVE_RUN.md). Observed HTTP acceptance, truncation, and strict-schema behavior are not presented as changes to the official contract.
