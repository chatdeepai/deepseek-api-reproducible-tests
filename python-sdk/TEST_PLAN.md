# Preregistered Test Plan

Plan date: 2026-07-27  
Live status: not run  
Pinned SDK: OpenAI Python 2.48.0  
Provider request cap: 14  
Planned requests: 14  
Concurrency: 1  
Automatic retries: 0  
Default live timeout: 30 seconds

## Research question

Does the pinned OpenAI Python SDK preserve the documented DeepSeek Chat Completions request and response contract across synchronous and asynchronous production paths, including standard responses, streams, explicit thinking controls, JSON Output, one safe tool round trip, and typed errors?

This plan does not test the Node SDK, legacy aliases, model inventory, or the OpenAI Responses API.

## Exact provider matrix

| # | Case ID | Client | Feature | Model | Thinking | `max_tokens` |
|---:|---|---|---|---|---|---:|
| 1 | `sync-standard-disabled` | Sync | Standard chat | `deepseek-v4-flash` | disabled | 32 |
| 2 | `sync-standard-enabled` | Sync | Standard chat | `deepseek-v4-pro` | enabled, high | 96 |
| 3 | `sync-stream-disabled` | Sync | Streaming chat | `deepseek-v4-flash` | disabled | 32 |
| 4 | `sync-stream-enabled` | Sync | Streaming chat | `deepseek-v4-pro` | enabled, high | 96 |
| 5 | `sync-json-output` | Sync | JSON Output | `deepseek-v4-flash` | disabled | 64 |
| 6 | `sync-invalid-model` | Sync | Typed error | synthetic impossible model | disabled | 16 |
| 7 | `async-standard-disabled` | Async | Standard chat | `deepseek-v4-flash` | disabled | 32 |
| 8 | `async-standard-enabled` | Async | Standard chat | `deepseek-v4-pro` | enabled, high | 96 |
| 9 | `async-stream-disabled` | Async | Streaming chat | `deepseek-v4-flash` | disabled | 32 |
| 10 | `async-stream-enabled` | Async | Streaming chat | `deepseek-v4-pro` | enabled, high | 96 |
| 11 | `async-json-output` | Async | JSON Output | `deepseek-v4-flash` | disabled | 64 |
| 12 | `async-tool-initial` | Async | Initial tool request | `deepseek-v4-flash` | disabled | 64 |
| 13 | `async-tool-continuation` | Async | Tool-result continuation | `deepseek-v4-flash` | disabled | 48 |
| 14 | `async-invalid-model` | Async | Typed error | synthetic impossible model | disabled | 16 |

Cases execute in this exact order. Async calls are awaited one at a time; the runner never uses `gather()` or a task pool.

## Fixed request rules

- API origin is exactly `https://api.deepseek.com`.
- The installed SDK version must equal `2.48.0`.
- Both clients set retries to zero.
- The live timeout is 30 seconds.
- Every generation case has an explicit thinking toggle.
- Thinking enabled uses V4 Pro plus `reasoning_effort="high"`.
- Thinking disabled uses V4 Flash.
- DeepSeek's `thinking` object is supplied through Python `extra_body`.
- JSON Output includes `response_format={"type":"json_object"}` and an explicit JSON instruction.
- Prompts and synthetic tool results are fixed English fixtures.
- No case is repeated automatically.

## Tool safety gate

The only tool is `get_temperature`. Its schema accepts exactly one nonempty string named `city` and rejects extra properties.

The continuation request is sent only when:

1. exactly one function call is present;
2. its name matches the allowlist;
3. arguments parse as JSON;
4. the object contains only a nonempty `city` string of at most 80 characters;
5. the assistant message is reconstructed from allowlisted fields;
6. the matching provider call ID remains in process memory only.

The local tool result is a fixed synthetic value and has no side effect. A failed gate produces a safety skip and reduces the actual provider request count.

## Outcome categories

- **Parsed success:** the SDK returns a typed completion or iterable.
- **Feature-valid success:** JSON, stream, or tool-specific checks pass.
- **Typed provider error:** a non-2xx is exposed as `APIStatusError` or a documented subclass with exact status.
- **Timeout mapping:** deterministic localhost tests expose `APITimeoutError`.
- **Safety-skipped:** the tool continuation is not sent because validation failed.
- **Unexpected client failure:** no typed status exists or parsing fails before an accepted outcome.

Empty content or `finish_reason=length` is recorded as an output-shape observation. It is not automatically an SDK transport failure.

## Offline preregistration

The localhost suite must pass before live execution. It mirrors all 14 request shapes with synthetic responses, then runs separate deterministic controls for:

- one 500 attempt with `max_retries=0`;
- two 500 responses followed by success with `max_retries=2`, for three attempts total;
- sync timeout with retries disabled;
- async timeout with retries disabled.

Offline localhost requests are not provider requests.

## Stop conditions

Stop before or during a live run if:

- the SDK version differs from the pin;
- the frozen plan changes;
- retries are nonzero;
- concurrency exceeds one;
- request accounting could exceed 14;
- the API origin differs;
- the tool safety gate fails, except for safely skipping its continuation;
- a writer attempts to persist a forbidden field;
- any credential, Arabic-script, or mojibake finding appears.

