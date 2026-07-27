# Dated Live Run

Run status: completed  
Evidence date: 2026-07-27 UTC  
Provider requests issued: 14 of 14  
Requests skipped: 0  
Concurrency: 1  
Automatic retries: 0  
Configured timeout: 30 seconds  
Credential status after the run: revoked and cleared

This document summarizes allowlisted metadata only. It contains no key, header, prompt, output text, reasoning text, provider request ID, provider tool-call ID, raw argument, balance, account identifier, or raw error message.

## Environment

| Component | Measured value |
|---|---|
| OpenAI Python SDK | 2.48.0 |
| Python runtime | 3.12.13 |
| Provider origin | `https://api.deepseek.com` |
| Started | 2026-07-27 15:32:26.094972 UTC |
| Completed | 2026-07-27 15:32:44.465991 UTC |
| Wall window | 18,371.019 ms |

The six synchronous cases completed before the eight asynchronous cases. Every request was serial and both clients used `max_retries=0`.

## Plan integrity

- frozen plan cases: 14
- result cases: 14
- case ID, order, client, scenario, requested model, and thinking-mode mismatches: 0
- requests issued: 14
- requests skipped: 0
- provider cap exceeded: no

## HTTP outcomes

| Outcome | Sync | Async | Total |
|---|---:|---:|---:|
| HTTP 200 parsed by the SDK | 5 | 7 | 12 |
| HTTP 400 mapped to `BadRequestError` | 1 | 1 | 2 |
| Safety-skipped | 0 | 0 | 0 |
| Unexpected client failure | 0 | 0 | 0 |

Both impossible-model controls produced HTTP 400, `BadRequestError`, and the allowlisted code `invalid_request_error`. This is a dated error-mapping observation, not a promise that every invalid model will always use the same status.

## Standard Chat Completions

| Client | Thinking | Model | HTTP | Finish | Final content | Reasoning |
|---|---|---|---:|---|---|---|
| Sync | disabled | V4 Flash | 200 | `stop` | present | absent |
| Async | disabled | V4 Flash | 200 | `stop` | present | absent |
| Sync | enabled, high | V4 Pro | 200 | `length` | absent | present |
| Async | enabled, high | V4 Pro | 200 | `length` | absent | present |

The two thinking-enabled results are successful typed transports with bounded incomplete generation. Under the deliberately small 96-token cap, both returned reasoning but reached `length` before final content. Applications must treat `length` as incomplete and allocate output budget according to the chosen thinking mode.

## Streaming Chat Completions

| Client | Thinking | Events | Content deltas | Reasoning deltas | Terminal finish |
|---|---|---:|---|---|---|
| Sync | disabled | 34 | present | absent | `length` |
| Async | disabled | 13 | present | absent | `stop` |
| Sync | enabled, high | 98 | absent | present | `length` |
| Async | enabled, high | 98 | absent | present | `length` |

Both iterator styles reached a terminal finish state. Event counts describe this bounded run only; they are not a performance or chunk-size guarantee.

## JSON Output

Both sync and async V4 Flash requests used explicit non-thinking mode and `response_format.type=json_object`:

- HTTP 200: 2 of 2
- nonempty content: 2 of 2
- valid JSON parsing: 2 of 2

The raw JSON values were discarded.

## Safe asynchronous tool round trip

- initial request: HTTP 200
- finish reason: `tool_calls`
- tool calls returned: 1
- allowlisted name and compact arguments valid: yes
- continuation request issued: yes
- continuation HTTP: 200
- continuation finish: `stop`
- final content present: yes
- safety skips: 0

The provider tool-call ID and raw arguments stayed in process memory. Persisted evidence uses only the synthetic alias `T1`.

## Typed invalid-model errors

| Client | HTTP | SDK exception | Sanitized code |
|---|---:|---|---|
| Sync | 400 | `BadRequestError` | `invalid_request_error` |
| Async | 400 | `BadRequestError` | `invalid_request_error` |

Automatic retries were disabled, so each control used one provider request.

## Timing

Across 14 serial requests:

- minimum: 266 ms
- median: 1,031 ms
- average: 1,301.4 ms
- nearest-rank p95: 2,406 ms
- maximum: 2,406 ms
- sum of recorded request times: 18,219 ms

This one-account serial sample is not a service-level benchmark.

## Evidence files

- `fixtures/request-plan.json`: frozen preregistration
- `results/live-summary.json`: sanitized case records
- `results/live-case-summary.csv`: 17-column allowlisted case table
- `results/postrun-audit-summary.json`: plan, request, format, privacy, and language audit

## Scope

These findings apply to one date, SDK version, Python runtime, authorized account, network environment, and request set. They do not establish future model behavior, production reliability, concurrent performance, full OpenAI API parity, Node compatibility, alias policy, or Responses API support.
