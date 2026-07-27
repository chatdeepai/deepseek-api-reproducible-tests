# Dated Live Run

Run status: completed  
Evidence date: 2026-07-27 UTC  
Provider requests issued: 20 of 20  
Requests skipped: 0  
Concurrency: 1  
Automatic retries: 0  
Credential status after the run: revoked

This file summarizes sanitized result metadata from the frozen 20-case plan. No raw prompt, generated answer, reasoning text, request or response header, provider request ID, provider tool-call ID, account identifier, balance, or credential is retained.

## Tested environments

| Client | SDK version | Runtime | Cases | Started UTC | Completed UTC |
|---|---:|---:|---:|---|---|
| Python | OpenAI 2.48.0 | Python 3.12.13 | 10 | 2026-07-27 14:39:35.771177 | 2026-07-27 14:39:48.343998 |
| Node | OpenAI 6.49.0 | Node v24.14.0 | 10 | 2026-07-27 14:39:48.985 | 2026-07-27 14:39:59.575 |

Both runners used `https://api.deepseek.com`, serial execution, no retry wrapper, and SDK retry settings of zero.

## Plan integrity

The two summaries contain all 20 frozen case IDs in their preregistered order:

- 10 Python cases and 10 Node cases
- no missing or unexpected cases
- SDK, scenario, and requested-model fields match the frozen plan
- 20 requests were issued and none were safety-skipped
- the hard cap was not exceeded

## HTTP outcomes

| Outcome | Python | Node | Total |
|---|---:|---:|---:|
| HTTP 200 parsed by the SDK | 9 | 9 | 18 |
| HTTP 400 mapped to `BadRequestError` | 1 | 1 | 2 |
| Request skipped | 0 | 0 | 0 |
| Unexpected client failure | 0 | 0 | 0 |

The two HTTP 400 responses were the preregistered impossible-model cases. Both SDKs exposed `BadRequestError` with the sanitized code `invalid_request_error`. This validates typed status mapping for the observed response; it does not mean every invalid model must always produce the same provider status.

## Feature findings

| Scenario | Python | Node | Combined interpretation |
|---|---|---|---|
| Models list | HTTP 200; two models; Flash and Pro present | Same | Both SDKs parsed the current two-model list. |
| Basic chat, thinking omitted | HTTP 200; `length`; reasoning nonempty; final content empty | Same | Parsed successfully; see the default-thinking nuance below. |
| Thinking disabled | HTTP 200; content present; no reasoning field; `length` | HTTP 200; content present; no reasoning field; `stop` | Provider-specific disabled toggle serialized through both SDKs. |
| Thinking enabled on V4 Pro | HTTP 200; content and reasoning present; `stop` | Same | Enabled toggle and `reasoning_effort=high` produced the expected response fields. |
| Streaming | Four events; content delta; terminal `stop` | Same | Both SDKs iterated the stream to a terminal finish state. |
| JSON Output | HTTP 200; nonempty; valid JSON | Same | Both SDKs serialized `json_object` and parsed valid output. |
| Tool initial | One valid call; `tool_calls` | Same | Compact tool definitions and call parsing worked. |
| Tool continuation | HTTP 200; final content present; `stop` | Same | Both one-tool round trips completed with matching in-memory call IDs. |
| Invalid model | HTTP 400; typed `BadRequestError` | Same | Typed error mapping worked without retries. |

## Default-thinking nuance

The basic cases deliberately omitted the `thinking` field. DeepSeek's current documentation says thinking defaults to enabled. Both SDKs received and parsed HTTP 200 responses with a nonempty `reasoning_content` field. Under the deliberately small 64-token output cap, both reached `finish_reason=length` before final `content` appeared.

This is not an SDK transport failure. It is a reproducible low-cap output-shape observation: an omitted thinking toggle can spend the available output budget on reasoning. Applications that require a short final answer should explicitly disable thinking, while applications that want reasoning should allocate a suitable output budget and treat `length` as incomplete generation.

The explicit disabled cases support that interpretation: both returned nonempty final content and no reasoning field. The Python disabled case still reached `length`, while the Node disabled case reached `stop`.

## Dated alias observations

| SDK | Requested alias | HTTP | Returned model | Finish | Reasoning field |
|---|---|---:|---|---|---|
| Python | `deepseek-chat` | 200 | `deepseek-v4-flash` | `stop` | absent |
| Node | `deepseek-reasoner` | 200 | `deepseek-v4-flash` | `length` | present |

These rows show what one authorized account observed on 2026-07-27. They do not establish a permanent alias contract, model equivalence, or future availability. The Node alias case explicitly enabled thinking, which explains why its reasoning field observation is not directly comparable to the Python disabled alias case.

## Timing

Across 20 serial requests:

- minimum: 284 ms
- median: 1,151 ms
- average: 1,157.3 ms
- nearest-rank p95: 1,969 ms
- maximum: 2,453 ms
- sum of recorded per-request elapsed times: 23,146 ms

This small, serial, single-account run is not a service-level latency benchmark. Timings are retained only to describe the bounded experiment.

## Evidence files

- `results/python-live-summary.json`: sanitized Python case evidence
- `results/node-live-summary.json`: sanitized Node case evidence
- `results/combined-live-findings.json`: aggregate counts and interpretations
- `results/live-case-summary.csv`: concise case-level table
- `results/postrun-audit-summary.json`: plan, format, privacy, and language audit counts
- `fixtures/request-plan.json`: frozen preregistration

## Scope and limitations

The run establishes dated compatibility for the tested Models and Chat Completions request shapes only. It does not establish full OpenAI API parity, permanent alias behavior, production reliability, performance under concurrency, or support for the OpenAI Responses API. The Responses API remains deliberately outside this page.
