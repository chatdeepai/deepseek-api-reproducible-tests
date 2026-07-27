# Preregistered Test Plan

Plan date: 2026-07-27
Live status: completed and independently audited
Provider request cap: 9
Planned provider requests: 9
Concurrency: 1
Automatic retries: 0

## Research question

Can the pinned official OpenAI Node SDK serialize and parse DeepSeek's
OpenAI-compatible Chat Completions shapes for ordinary chat, streaming, JSON
mode, a guarded tool round trip, thinking metadata, alias probes, and typed
errors?

This is not a claim of complete OpenAI API compatibility. The Responses API,
Batch API, files, fine-tuning, images, audio, and every unlisted endpoint are
out of scope.

## Fixed environment

| Component | Pinned version |
|---|---:|
| OpenAI Node SDK | 6.49.0 |
| TypeScript | 7.0.2 |
| Node declarations | 24.13.3 |
| Minimum Node.js | 20 |

## Frozen provider matrix

| Sequence | Scenario | Model | Maximum tokens |
|---:|---|---|---:|
| 1 | Ordinary chat | `deepseek-v4-flash` | 32 |
| 2 | Streaming | `deepseek-v4-flash` | 32 |
| 3 | JSON Output | `deepseek-v4-flash` | 64 |
| 4 | Tool call, initial | `deepseek-v4-flash` | 64 |
| 5 | Tool result, continuation | `deepseek-v4-flash` | 48 |
| 6 | Thinking metadata | `deepseek-v4-pro` | 96 |
| 7 | Alias probe | `deepseek-chat` | 16 |
| 8 | Alias probe | `deepseek-reasoner` | 32 |
| 9 | Invalid-model control | synthetic impossible model | 16 |

## Request rules

- Provider origin: `https://api.deepseek.com`
- Chat Completions only
- SDK retries: `maxRetries: 0`
- Serial loop only
- No generic retry wrapper
- Timeout: 30 seconds
- `thinking.type` is explicit in every generation case
- Thinking mode uses `reasoning_effort: "high"`
- Streaming requests use `stream_options.include_usage=true`; only a terminal
  usage-presence boolean is retained
- JSON mode uses `response_format: {"type":"json_object"}` and a prompt that
  explicitly requests JSON
- Tools are synthetic, local, allowlisted, and side-effect free

## Tool safety gate

The only tool is `lookup_synthetic_record`, with one required string property
named `key` and no additional properties.

The continuation request is reserved and sent only when:

1. exactly one tool call exists;
2. its type is `function`;
3. its function name matches the allowlist;
4. its arguments parse as JSON;
5. the object contains only a nonempty `key` string;
6. the provider call identifier remains in memory for matching only.

The local tool returns one fixed synthetic value. No file, network, account, or
external system is read or changed. If validation fails, the continuation is
skipped and the provider total is at most eight.

## Offline coverage

Before any provider run, the suite must:

- compile all TypeScript source under strict settings;
- verify exact dependency pins;
- validate the nine-case plan, order, models, and cap;
- prove the live runner fails closed without explicit opt-in;
- prove an existing ledger or result blocks a rerun;
- prove duplicate and tenth reservations fail;
- capture all nine matrix requests through the real SDK on localhost;
- verify thinking, streaming, JSON, tool, and continuation serialization;
- validate controlled response parsing and sanitization;
- verify `maxRetries: 0` causes one request for a synthetic 500;
- verify AbortController cancels one slow localhost request;
- verify serial execution never exceeds one active request;
- verify privacy auditing rejects forbidden fields, secrets, non-ASCII text,
  mismatched case order, and inconsistent ledger accounting.

Localhost requests do not count against the provider cap.

## Completed provider result

The frozen plan ran once on July 27, 2026 from 18:59:14 UTC to 18:59:23 UTC.
All nine requests were issued in plan order, none were skipped, concurrency was
one, and automatic retries were zero.

Measured outcomes:

- ordinary chat: HTTP 200, one choice, nonempty content, `stop`;
- stream: HTTP 200, seven events, content delta present, usage chunk present,
  terminal `stop`;
- JSON mode: HTTP 200, valid JSON, schema valid, two fields validated;
- initial tool call: HTTP 200, one valid allowlisted call with schema-valid
  arguments;
- tool continuation: HTTP 200, nonempty content, `stop`, replay alias `T1`;
- V4 Pro thinking: HTTP 200, reasoning present and nonempty, final content
  empty, `length`;
- `deepseek-chat`: HTTP 200, returned model `deepseek-v4-flash`, `length`;
- `deepseek-reasoner`: HTTP 200, returned model `deepseek-v4-flash`, `length`;
- invalid model: HTTP 400, `BadRequestError`, `invalid_request_error`.

The independent audit passed all checks. Alias observations are dated only, and
the thinking case is incomplete under final-content validation.

## Result allowlist

Results may contain:

- case identity, scenario, requested public model, and request-issued flag;
- elapsed milliseconds and HTTP status;
- safe SDK exception class and narrow error code;
- counts, booleans, safe finish states, and validation outcomes;
- a public returned model string for dated alias observations;
- the synthetic continuation alias `T1`;
- a fixed safety skip code.

Raw prompts, generated text, reasoning, headers, provider identifiers, tool
arguments, tool results, raw errors, and account data are forbidden.

## Stop conditions

Stop before sending or publishing if:

- the plan or dependency pins differ;
- the origin, cap, retry count, or concurrency differs;
- prior run state exists;
- request accounting becomes ambiguous;
- the tool call fails validation;
- the privacy audit fails;
- any credential-like or non-ASCII text appears in evidence.
