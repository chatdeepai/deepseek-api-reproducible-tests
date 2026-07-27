# Official Source Register

Reviewed on 2026-07-27 before scaffold creation. Recheck before any later live
run.

## OpenAI Node SDK

- Repository and TypeScript usage:
  https://github.com/openai/openai-node
- Release 6.49.0:
  https://github.com/openai/openai-node/releases/tag/v6.49.0
- Package metadata at the reviewed revision:
  https://raw.githubusercontent.com/openai/openai-node/master/package.json

Version verification was three-way: the official GitHub `releases/latest`
redirect resolved to `v6.49.0`, the official repository package metadata
reported `6.49.0`, and `pnpm view openai version` returned `6.49.0` from the
npm registry. The installed runtime export `openai/version` was then checked
by the offline contract suite.

Relevant SDK behaviors:

- `client.chat.completions.create(...)` supports Chat Completions.
- Streaming responses are async iterables.
- `maxRetries` controls automatic SDK retries; the documented default is two,
  so this harness explicitly uses zero.
- Request options accept an AbortSignal.
- The SDK supports Node.js 20 or newer and TypeScript 4.9 or newer.

## DeepSeek API

- OpenAI SDK compatibility and public API origin:
  https://api-docs.deepseek.com/
- Create Chat Completion:
  https://api-docs.deepseek.com/api/create-chat-completion
- Thinking mode:
  https://api-docs.deepseek.com/guides/thinking_mode
- JSON Output:
  https://api-docs.deepseek.com/guides/json_mode
- Tool calls:
  https://api-docs.deepseek.com/guides/tool_calls

Relevant DeepSeek-specific fields include `thinking`, `reasoning_content`,
`response_format`, `tools`, `tool_choice`, and tool-result messages. The
harness uses the OpenAI SDK as a typed transport while locally extending the
request and response shapes for documented DeepSeek fields.

## TypeScript

- TypeScript package:
  https://www.npmjs.com/package/typescript
- TypeScript repository:
  https://github.com/microsoft/TypeScript

The frozen package version is 7.0.2.
