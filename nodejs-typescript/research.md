# DeepSeek Node.js and TypeScript Research

Research date: 2026-07-27
Status: source audit, bounded live run, independent offline rerun, and privacy audit complete
Language: English only

## Preserved page identity

- Exact public H1 and WordPress title: `DeepSeek Node.js TypeScript Guide: Chat Completions, Streaming, JSON & Tools`
- Slug: `deepseek-nodejs-typescript`
- Canonical: `https://chat-deep.ai/docs/deepseek-nodejs-typescript/`
- Exact current WordPress category: `Docs`
- Publicly visible documentation date: `Last verified: April 27, 2026`
- Original WordPress publication date: `April 15, 2026 at 01:06 UTC`
- WordPress tags: none

The replacement body must not add a second H1. WordPress should continue to render
the preserved title as the page H1.

## Search intent and cluster role

Primary intent: a developer wants working Node.js or TypeScript code for the
official DeepSeek API, using the OpenAI JavaScript/TypeScript client as the
transport.

Primary query family:

- DeepSeek Node.js
- DeepSeek TypeScript
- DeepSeek API Node.js
- DeepSeek Node SDK
- DeepSeek TypeScript streaming
- DeepSeek JSON output TypeScript
- DeepSeek tool calls Node.js
- DeepSeek thinking mode Node.js

Cluster role: this is the Node.js implementation page under the broader DeepSeek
API cluster. It should support, not compete with:

- `/docs/api/` for the broad API overview
- `/docs/openai-sdk-to-deepseek/` for cross-language SDK migration
- `/docs/deepseek-python-sdk/` for Python
- `/docs/deepseek-thinking-mode/` for reasoning behavior
- `/docs/json-output/` for a full JSON Output study
- `/docs/deepseek-tool-calls/` for the complete tool-calling lifecycle
- `/docs/deepseek-error-codes/` for provider error diagnosis

The Node.js page should win on compile-safe TypeScript, provider-specific field
typing, streaming assembly, cancellation, timeout and retry boundaries, and a
reproducible Node-only test matrix.

## Current public page audit

### What is already useful

- It preserves the correct developer intent and explains that DeepSeek's
  documented Node.js route uses the `openai` package configured for DeepSeek.
- It uses the documented public origin, `https://api.deepseek.com`.
- It uses the current public model IDs `deepseek-v4-flash` and
  `deepseek-v4-pro`.
- It keeps the API key server-side and explains the `baseURL` and `apiKey`
  JavaScript spellings.
- It covers non-streaming chat, streaming, multi-turn history, JSON Output, tool
  calls, thinking mode, error handling, usage, and context caching.
- It validates JSON and tool arguments instead of treating model output as
  trusted application data.

### What must change

1. The last-verified date is stale. The page still describes the July 24, 2026
   alias cutoff as a future event even though that UTC cutoff has passed.
2. The page contains no bounded original test evidence, package pin, request
   ledger, or screenshot plan.
3. Several examples use `process.env.DEEPSEEK_API_KEY` without a fail-fast
   runtime check.
4. The tool example uses `as never` for messages and tools. That removes the
   exact TypeScript safety the page should teach.
5. The page does not clearly distinguish the Node request shape from the Python
   SDK pattern. DeepSeek's current Node quick start sends `thinking` at the top
   level. Python's `extra_body` example must not be copied literally into Node.
6. The OpenAI Node SDK is typed for OpenAI fields. DeepSeek-only request and
   response fields need narrow local extensions rather than broad `any` casts.
7. Streaming guidance does not fully explain the final usage-only chunk, whose
   `choices` array is empty when `stream_options.include_usage` is enabled.
8. Thinking streaming needs separate accumulation of `delta.reasoning_content`
   and `delta.content`. Hidden reasoning must not be shown or stored as ordinary
   user-facing content.
9. Thinking-mode tool loops must replay the assistant message, including
   `reasoning_content`, before the matching tool result.
10. Error handling does not distinguish provider status errors, network errors,
    SDK timeouts, and user cancellation.
11. The page does not explain the OpenAI Node SDK's default retry behavior or
    the interaction between retries and timeouts.
12. It does not document DeepSeek's provider-specific
    `insufficient_system_resource` finish reason.
13. It does not explain that the OpenAI SDK preserves provider-only response
    properties at runtime even when its TypeScript declarations omit them.
14. The Next.js example returns raw usage and logs a raw caught error. The
    replacement should return a narrow response and log only allowlisted
    metadata.
15. The page needs a visible evidence boundary: no credentials, raw prompts,
    generated text, reasoning, provider IDs, account data, or raw errors in the
    public benchmark.

## Current DeepSeek contract

### API origin and endpoint

DeepSeek's current quick start lists:

- OpenAI-format base URL: `https://api.deepseek.com`
- Chat Completions resource: `/chat/completions`
- Node client options: `baseURL` and `apiKey`

Use the documented base URL without appending `/v1` in the primary example.
The OpenAI Node client appends `/chat/completions`.

### Current public model IDs

The current Models and Pricing page lists:

- `deepseek-v4-flash`
- `deepseek-v4-pro`

Both are documented with:

- thinking and non-thinking modes, with thinking enabled by default
- 1M context
- maximum output of 384K
- JSON Output
- Tool Calls

The page should not copy a fixed price table. Pricing can change and has a
dedicated site page. Link to the official pricing page and the site's pricing
guide.

### Alias status

DeepSeek's V4 release notice stated that `deepseek-chat` and
`deepseek-reasoner` would become inaccessible after July 24, 2026 at 15:59 UTC.
That cutoff is now in the past.

The article may state that the announced cutoff has passed. It must not state
the current live HTTP outcome until the dated alias probes have run and their
sanitized result is available.

### Message and request fields

The current Chat Completion reference documents:

- roles: `system`, `user`, `assistant`, and `tool`
- models: `deepseek-v4-flash` and `deepseek-v4-pro`
- `thinking.type`: `enabled` or `disabled`; default `enabled`
- `reasoning_effort`: `high` or `max`
- `max_tokens`
- `response_format: { "type": "json_object" }`
- `stop`, up to 16 sequences
- `stream` and `stream_options.include_usage`
- `tools` and `tool_choice`
- `user_id`

Use `system`, not OpenAI's newer `developer` role, in portable DeepSeek
examples. Use `max_tokens`, not `max_completion_tokens`.

### Thinking mode

DeepSeek documents:

- thinking defaults to enabled for current V4 models
- `reasoning_effort` supports `high` and `max`
- `low` and `medium` map to `high`; `xhigh` maps to `max`
- `temperature`, `top_p`, `presence_penalty`, and `frequency_penalty` have no
  effect in thinking mode
- reasoning is returned in `reasoning_content`, separate from final `content`
- previous reasoning need not be replayed for ordinary multi-turn chat
- reasoning must be replayed in an active thinking-mode tool-call loop

DeepSeek's current Node quick start sends `thinking` directly in the request
object. Its Python example uses `extra_body`. The article must show the Node
shape.

### JSON Output

DeepSeek requires all of the following:

- `response_format: { type: "json_object" }`
- the word `json` in a system or user message
- an example or clear target shape
- a reasonable `max_tokens` value

The official guide warns that content can occasionally be empty. The
application must therefore check for empty content, parse JSON, validate the
runtime shape, and reject truncated output when `finish_reason` is `length`.

### Tool Calls

The model requests a tool; the application executes it. The safe loop is:

1. send the tool schema;
2. require a tool-call finish state or inspect `tool_calls`;
3. allowlist the function name;
4. parse and validate the JSON arguments;
5. enforce authorization separately from schema validity;
6. run a local adapter;
7. append the full assistant message;
8. append one `tool` message per call with the matching `tool_call_id`;
9. request the final answer.

Thinking-mode loops must retain `reasoning_content` in the assistant message.
Strict Tool Calls are beta and use `https://api.deepseek.com/beta`; they should
remain a clearly labeled optional subsection rather than changing the main
client origin.

### Streaming and usage

DeepSeek streams data-only SSE events and terminates with `data: [DONE]`.
When `stream_options.include_usage` is true, an additional usage chunk arrives
before `[DONE]`; that chunk has an empty `choices` array. Other chunks may have
`usage: null`.

A correct consumer must:

- guard `chunk.choices[0]`
- append `delta.content`
- separately count or handle `delta.reasoning_content`
- assemble tool-call argument fragments by index before parsing
- capture final usage from the usage-only chunk
- honor cancellation

Usage can include:

- `prompt_tokens`
- `completion_tokens`
- `total_tokens`
- `prompt_cache_hit_tokens`
- `prompt_cache_miss_tokens`
- `completion_tokens_details.reasoning_tokens`

The OpenAI Node types do not necessarily expose every DeepSeek usage field, so
use a narrow provider response extension.

### Context caching

DeepSeek context caching is enabled by default. Cache hits require a matching
persisted prefix unit and are best effort, not guaranteed. The application
should report returned cache-hit and cache-miss token counts rather than infer
hits from latency or repeated text.

### Provider errors

DeepSeek documents:

- 400 invalid format
- 401 authentication failure
- 402 insufficient balance
- 422 invalid parameters
- 429 rate limit reached
- 500 server error
- 503 server overloaded

Do not attempt to create a live 402 or 429 condition. Test those transport
classes against a localhost mock and keep the live invalid-model request as the
bounded provider error control.

## Current OpenAI Node SDK behavior

The official repository's current package metadata was version `6.49.0` when
reviewed on 2026-07-27. The article must label any version as the tested
snapshot, not as a permanent latest version.

The current official README and source establish:

- install with `npm install openai`
- Node.js 20 LTS or later
- TypeScript 4.9 or later
- `client.chat.completions.create(...)` remains supported
- streamed Chat Completions are async iterable
- undocumented top-level request fields are sent as-is at runtime
- undocumented response fields are not stripped
- request options accept `signal`, `timeout`, and `maxRetries`
- default timeout is 10 minutes
- default `maxRetries` is 2
- connection failures, 408, 409, 429, and status 500 or higher are retried
- timeout failures are retried by default
- an explicit user abort maps to `APIUserAbortError`
- a terminal timeout maps to `APIConnectionTimeoutError`
- non-success HTTP responses map to `APIError` subclasses

The resource source constructs the POST request from the first `body` argument.
Do not place a partial DeepSeek request under the second options object's
`body`, because that option can replace the resource body rather than merge
provider fields into it.

## Recommended TypeScript compatibility layer

Use the SDK's exported Chat Completion types plus small DeepSeek extensions:

```ts
import OpenAI from "openai";

type DeepSeekFields = {
  thinking?: { type: "enabled" | "disabled" };
  user_id?: string;
};

type DeepSeekNonStreamingParams =
  OpenAI.ChatCompletionCreateParamsNonStreaming & DeepSeekFields;

type DeepSeekStreamingParams =
  OpenAI.ChatCompletionCreateParamsStreaming & DeepSeekFields;

type DeepSeekMessage = OpenAI.ChatCompletionMessage & {
  reasoning_content?: string | null;
};

type DeepSeekUsage = NonNullable<OpenAI.ChatCompletion["usage"]> & {
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
};
```

This avoids `any` and `as never`, keeps OpenAI-typed standard fields, and makes
only the documented provider additions explicit.

## Final test evidence

The preregistered provider run started on 2026-07-27 at 18:59:14 UTC and
completed at 18:59:23 UTC. It issued all nine planned requests serially with
concurrency 1, automatic retries 0, no skipped cases, and no requests above the
nine-request cap. The 9.029-second total is study duration, not a latency,
throughput, or service-level benchmark.

The live cases were:

1. ordinary `deepseek-v4-flash` chat;
2. `deepseek-v4-flash` streaming;
3. `deepseek-v4-flash` JSON Output;
4. `deepseek-v4-flash` tool-call request;
5. conditional tool-result continuation;
6. `deepseek-v4-pro` thinking metadata;
7. dated `deepseek-chat` alias probe;
8. dated `deepseek-reasoner` alias probe;
9. invalid-model error control.

Sanitized provider observations:

- Ordinary chat returned HTTP 200, one choice, nonempty content, and
  `finish_reason: stop`.
- Streaming returned HTTP 200 across seven events. A content delta and a
  separate usage chunk were observed, and the terminal finish reason was
  `stop`.
- JSON Output returned HTTP 200 with nonempty content. Parsing passed, the
  runtime schema passed, and two fields were validated.
- The initial tool case returned HTTP 200 with `finish_reason: tool_calls`,
  exactly one call, an allowlisted tool name, and schema-valid arguments.
- The guarded continuation returned HTTP 200 with nonempty content,
  `finish_reason: stop`, and sanitized replay alias `T1`.
- The `deepseek-v4-pro` thinking case returned HTTP 200 and nonempty
  `reasoning_content`, but it ended at `finish_reason: length` with empty final
  `content`. It is an incomplete result under the article's terminal checks.
- On July 27, 2026, both `deepseek-chat` and `deepseek-reasoner` returned HTTP
  200 and the model ID `deepseek-v4-flash`; both ended at `length`. These are
  dated observations only, not future-availability or permanent-support
  claims.
- The synthetic impossible model produced the expected HTTP 400. The Node SDK
  exposed `BadRequestError` with code `invalid_request_error`.

The recorded environment was Node.js `v24.14.0`, `openai` `6.49.0`, and
TypeScript `7.0.2`. Strict typechecking passed. An independently rerun offline
suite passed 14/14 tests. Using the full OpenAI Node SDK against localhost
fixtures, it confirmed:

- correct top-level `thinking` serialization;
- parsing of the final usage-only stream chunk;
- one total attempt for a controlled HTTP 500 when `maxRetries` was 0;
- one total attempt for a controlled timeout when `maxRetries` was 0;
- one total attempt for an `AbortController` cancellation;
- two total attempts for HTTP 429 with the test-only `maxRetries: 1` client;
- one total attempt for HTTP 400 with that same retry setting.

The final sanitized evidence privacy audit passed. It reported zero forbidden
result fields, zero secret findings, zero non-ASCII characters, and zero
mojibake matches.

## Evidence and privacy boundary

Public evidence may contain:

- package and runtime versions
- public model names and API origin
- case aliases and feature labels
- status classes and exception class names
- elapsed milliseconds
- counts, booleans, finish states, and validation outcomes
- dated alias return model or status

Public evidence must not contain:

- API keys or Authorization headers
- account identifiers or balances
- raw prompts or generated answers
- `reasoning_content`
- raw tool arguments or results
- provider request IDs or tool-call IDs
- raw error messages or response bodies
- local usernames or absolute paths

## Editorial decisions

- Keep the exact H1, slug, and canonical.
- Use no WordPress tags.
- Use the first architecture visual as the featured image.
- Label official documentation as `Documented contract`.
- Label harness observations as `Dated test observation`.
- Do not claim complete OpenAI API compatibility.
- State that this guide covers Chat Completions, not the Responses API.
- Do not publish static prices in this page.
- Update the visible verification date only after source and test QA is
  complete.
