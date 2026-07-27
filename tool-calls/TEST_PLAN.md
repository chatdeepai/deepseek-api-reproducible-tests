# DeepSeek Tool Calls Offline Test Plan

Version: 1.0
Design date: 2026-07-27
Runtime: Node.js 20 or newer
External dependencies: 0
Network requests: 0
API keys: 0
Local tool side effects: 0

## Objective

Build a deterministic safety and contract suite for application code that consumes DeepSeek-style Tool Calls. The suite exercises documented request and replay shapes but does not measure provider behavior.

## Official-contract matrix

The local matrix contains eight combinations:

| Thinking | `tool_choice` | Local policy |
|---|---|---|
| disabled | `none` | Reject any observed tool call. |
| disabled | `auto` | Permit zero, one, or multiple allowlisted calls. |
| disabled | `required` | Require at least one allowlisted call. |
| disabled | named function | Require every call to use the selected allowlisted function. |
| enabled | `none` | Reject any observed tool call. |
| enabled | `auto` | Permit calls and require complete thinking replay when a call occurs. |
| enabled | `required` | Require a call and complete thinking replay. |
| enabled | named function | Require the named call and complete thinking replay. |

This matrix checks local interpretation of the documented values. It is not a live compatibility matrix.

## Deterministic case groups

### A. Tool-choice contract

- A1: default with no tools resolves to `none`.
- A2: default with tools resolves to `auto`.
- A3: explicit `none`.
- A4: explicit `auto`.
- A5: explicit `required`.
- A6: named-function object.
- A7: named function absent from the allowlist is rejected.
- A8: 128 tools accepted and 129 rejected.

### B. Strict-mode schema preflight

- B1: valid nested strict schema.
- B2: missing `strict: true`.
- B3: non-Beta base URL.
- B4: missing `additionalProperties: false`.
- B5: property omitted from `required`.
- B6: unsupported `minLength`.
- B7: unsupported `maxLength`.
- B8: unsupported `minItems`.
- B9: unsupported `maxItems`.
- B10: supported `pattern`, `format`, numeric bounds, `enum`, `anyOf`, and local `$ref`.
- B11: unresolved local `$ref`.

### C. Argument boundary

- C1: valid parsed arguments.
- C2: malformed JSON.
- C3: missing required property.
- C4: unexpected property.
- C5: invalid enum.
- C6: value outside numeric range.
- C7: pattern or format mismatch.

Argument errors contain only codes and schema paths. They never echo input values.

### D. Replay and orchestration

- D1: non-thinking single-call loop.
- D2: thinking multi-tool, multi-turn loop.
- D3: full `reasoning_content` preservation after each thinking tool-call turn.
- D4: missing thinking replay field rejected before execution.
- D5: mismatched tool-result ID rejected.
- D6: unknown tool rejected.
- D7: duplicate `tool_call_id` rejected across a run.
- D8: maximum-iteration guard stops a scripted endless loop.

All functions are local, deterministic, read-only, and allowlisted.

### E. Evidence safety

- E1: redaction removes keys, Authorization headers, reasoning, arguments, raw content, and account fields.
- E2: static scan detects key-shaped tokens without returning matched text.
- E3: public source scan is clean.
- E4: source scan confirms no network-capable imports or `fetch` calls.
- E5: token totals and min/median/p95/max timing are deterministic.

## Orchestration invariants

Before a local tool executes:

1. the iteration budget is available;
2. the assistant turn has a valid Tool Calls shape;
3. the `tool_choice` policy permits the call;
4. the call ID has not appeared earlier;
5. the function name exists in the local registry;
6. arguments parse as JSON;
7. arguments pass the allowlisted schema;
8. thinking-mode `reasoning_content` is present and preserved.

Failure stops the run. The harness does not retry, repair arguments, guess a tool, or execute a fallback function.

## Public metrics

Allowed:

- case and iteration counts;
- completion state and normalized stop code;
- accepted tool names from the local allowlist;
- hashed synthetic call IDs;
- argument-validation booleans and error codes;
- replay-preservation booleans;
- token counters supplied by synthetic fixtures;
- aggregate elapsed-millisecond statistics.

Excluded:

- raw prompts;
- raw `reasoning_content`;
- raw argument strings or parsed values;
- raw tool outputs;
- raw call IDs;
- provider IDs;
- request or response headers;
- credentials and account data.

## Pass standard

The suite passes only when all deterministic tests pass, the network-request count remains zero, and the public source scan has zero secret findings.

## Optional bounded live reproduction

The live runner is tested only with an in-memory mock by this offline suite. It is not executed by `npm test`.

Exact planned request count: **30**.

| Group | Planned requests |
|---|---:|
| Per model: six non-thinking omitted/explicit choice cases plus thinking `required` and named | 16 |
| Single-tool initial and final turns | 2 |
| Multiple-tool initial and final turns | 2 |
| Strict valid plus four route/schema controls | 5 |
| Thinking initial, full replay, and missing-reasoning control | 3 |
| Flash non-thinking and Pro thinking streaming assembly | 2 |
| **Total** | **30** |

The process-wide hard network budget is 30. Every request is serialized, generic retries are zero, and `max_tokens` cannot exceed 96. The plan's maximum theoretical output-token allowance is 1,792.

Live output permits only case labels, public model/mode settings, status, normalized finish/status classes, elapsed time, boolean validation results, call counts, unique-ID counts, SSE counters, reasoning character counts, and numeric usage. It excludes raw prompts, reasoning, arguments, tool results, IDs, headers, error bodies, credentials, and account data.

## Separate one-time diagnostic follow-up

The follow-up is not part of the 30-request suite and does not modify its result. It has its own hard allowance of four requests:

| Diagnostic phase | Maximum requests |
|---|---:|
| Single empty-argument tool proposal | 1 |
| Single-tool continuation after validation | 1 |
| Two empty-argument tool proposals | 1 |
| Multiple-tool continuation after validation | 1 |
| **Total** | **4** |

Every request uses the standard Chat Completions URL, `deepseek-v4-flash`, thinking disabled, `max_tokens: 96`, concurrency one, and zero automatic retries. A continuation is skipped when JSON arguments, the exact allowlisted tool set, call count, or unique IDs fail validation.

## Recorded execution

The completed primary run issued 26 of its 30 planned requests. Four continuations were not sent:

- single-tool final after truncated arguments;
- multiple-tool final after truncated arguments;
- full thinking replay after truncated arguments;
- missing-reasoning control after truncated arguments.

The one-time compact-schema diagnostic issued all four of its allowed requests. Combined actual HTTP requests were therefore 30.

Primary status counts were 21 HTTP 200, five HTTP 400, and four safety skips. The diagnostic added four HTTP 200 results. Sixteen primary HTTP 200 responses contained truncated, invalid argument JSON. Both compact-schema round trips passed.

The recorded live result did not execute either thinking replay continuation branch. The official replay requirement remains the implementation contract.
