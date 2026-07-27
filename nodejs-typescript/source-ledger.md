# Source Ledger

Review date: 2026-07-27
Policy: official primary sources only

## DeepSeek sources

| ID | Official source | Claims supported | Use in article |
|---|---|---|---|
| DS-01 | [Your First API Call](https://api-docs.deepseek.com/) | OpenAI-format compatibility, `https://api.deepseek.com`, current public model IDs, official Node `openai` package example, top-level Node `thinking`, `reasoning_effort`, and Chat Completions syntax | Setup, minimal request, Node-versus-Python field placement |
| DS-02 | [Models and Pricing](https://api-docs.deepseek.com/quick_start/pricing/) | `deepseek-v4-flash`, `deepseek-v4-pro`, thinking default, 1M context, 384K maximum output, JSON Output, Tool Calls, current public pricing location | Model table and feature snapshot; link instead of copying prices |
| DS-03 | [DeepSeek V4 Preview Release](https://api-docs.deepseek.com/news/news260424/) | V4 release, current model IDs, OpenAI Chat Completions support, dual modes, announced retirement cutoff for `deepseek-chat` and `deepseek-reasoner` | Alias migration context |
| DS-04 | [Create Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion/) | Request roles and fields, `thinking`, `reasoning_effort`, `max_tokens`, streaming, usage-only final chunk, JSON Output, Tool Calls, `user_id`, provider finish reasons, `reasoning_content`, usage and cache fields | Request and response contract throughout |
| DS-05 | [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/) | Thinking default, effort mapping, ignored sampling controls, separate `reasoning_content`, multi-turn behavior, mandatory reasoning replay in thinking tool loops | Thinking and tool-loop sections |
| DS-06 | [JSON Output](https://api-docs.deepseek.com/guides/json_mode/) | `json_object`, prompt must mention JSON, desired shape, `max_tokens`, possible empty content | Structured-output implementation and validation |
| DS-07 | [Tool Calls](https://api-docs.deepseek.com/guides/tool_calls/) | Application executes tools, tool-result replay, strict beta origin and schema rules | Tool safety loop and beta note |
| DS-08 | [Error Codes](https://api-docs.deepseek.com/quick_start/error_codes/) | DeepSeek 400, 401, 402, 422, 429, 500, and 503 meanings | Error classification table |
| DS-09 | [Rate Limit and Isolation](https://api-docs.deepseek.com/quick_start/rate_limit/) | Current account concurrency model, 429 behavior, `user_id`, keep-alive lines/comments, ten-minute scheduling close | Retry and long-request cautions |
| DS-10 | [Context Caching](https://api-docs.deepseek.com/guides/kv_cache/) | Cache enabled by default, persisted prefix units, best-effort behavior, hit/miss usage fields | Usage and caching section |
| DS-11 | [Multi-round Conversation](https://api-docs.deepseek.com/guides/multi_round_chat/) | Chat Completions is stateless and the client resends history | Multi-turn implementation |
| DS-12 | [DeepSeek API Change Log](https://api-docs.deepseek.com/updates) | Current V4 API change context and feature changes | Last-verified/source-check section |

## OpenAI Node SDK sources

The SDK is used as the client transport. These sources do not establish that
DeepSeek supports every OpenAI endpoint or product feature.

| ID | Official source | Claims supported | Use in article |
|---|---|---|---|
| OA-01 | [Official OpenAI Node repository and README](https://github.com/openai/openai-node) | Installation, Chat Completions call, streaming, typed errors, default retries, timeouts, request IDs, unknown request and response property behavior, browser credential warning, runtime requirements | SDK setup, streaming, errors, compatibility boundary |
| OA-02 | [Official package metadata](https://raw.githubusercontent.com/openai/openai-node/main/package.json) | Package name, repository, license, current source snapshot version | Dated environment snapshot |
| OA-03 | [Chat Completions resource source](https://raw.githubusercontent.com/openai/openai-node/main/src/resources/chat/completions/completions.ts) | Overloads, POST body construction, stream selection, exported request and response types | TypeScript wrapper design and second-argument warning |
| OA-04 | [Request options source](https://raw.githubusercontent.com/openai/openai-node/main/src/internal/request-options.ts) | `signal`, `timeout`, `maxRetries`, `body`, headers, and fetch options | Cancellation, timeout, and request-option syntax |
| OA-05 | [Client source](https://raw.githubusercontent.com/openai/openai-node/main/src/client.ts) | Default ten-minute timeout, default two retries, retryable statuses, user-abort and timeout error mapping, request building | Error and retry behavior |
| OA-06 | [Chat streaming helpers](https://github.com/openai/openai-node/blob/main/helpers.md) | Async-iterable Chat Completions, breaking or aborting stream helpers, runner events | Streaming and cancellation note |

## Target page audit source

| ID | Source | Use |
|---|---|---|
| SITE-01 | [Current public Node.js and TypeScript page](https://chat-deep.ai/docs/deepseek-nodejs-typescript/) | Preserve exact H1, slug, canonical, existing search intent, and internal-link role; identify stale alias wording and evidence gaps |
| SITE-02 | [Docs archive](https://chat-deep.ai/docs/) | Confirm public Docs section placement |

## Claim controls

### Claims supported by primary sources and pre-run verification

- current documented model IDs and feature support;
- documented request and response fields;
- OpenAI Node SDK documented and source-level transport behavior;
- the announced alias cutoff date has passed;
- the test plan, package pins, provider cap, and privacy rules.

### Claims now supported only by the sanitized completed evidence

- exact installed versions used by the completed run;
- 14/14 passing offline checks;
- the recorded HTTP outcome or typed error for each live case;
- whether `thinking` appeared on the captured localhost body;
- whether reasoning or usage fields appeared live;
- exact streaming event counts or terminal state;
- JSON parse and schema-validation outcome;
- tool-call and continuation outcome;
- alias status or returned model;
- invalid-model status and SDK exception class;
- timeout, abort, and retry attempt counts;
- elapsed time or token counts.

## Source conflicts and resolutions

### Node `thinking` versus Python `extra_body`

DeepSeek's Python examples place `thinking` under `extra_body`. Its current
Node quick start sends `thinking` directly in the first request object. The
OpenAI Node README says unknown top-level request parameters are passed as-is at
runtime. Therefore:

- Node article examples use a narrow type extension and top-level `thinking`.
- They do not add a Python-style `extra_body` property.
- Offline request capture must verify the serialized wire shape before
  publication.

### `/v1` in the base URL

The current DeepSeek quick start lists `https://api.deepseek.com`. The primary
example follows that exact source. The page does not teach `/v1` as the default
or as a model version.

### Legacy aliases

The pricing page can retain transitional wording while the V4 release notice
sets a cutoff. Because the announced cutoff has passed, the final page must use
the dated live alias probes for current behavior and must not repeat future
tense.

### Retry guidance

The OpenAI Node SDK retries selected failures by default. The bounded provider
study disables automatic retries for auditable request accounting. The article
can explain the documented default while clearly labeling the benchmark's
explicit `maxRetries: 0` setting.

## Recheck triggers

Recheck all official sources before publication if any of these change:

- a live run occurs on a later UTC date;
- the `openai` package pin changes;
- DeepSeek adds or removes a public model ID;
- the Chat Completion schema changes;
- the alias probes produce an outcome inconsistent with the current migration
  wording;
- the page is not published immediately after QA.
