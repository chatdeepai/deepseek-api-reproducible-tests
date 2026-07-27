# DeepSeek Tool Calls Live Run

Test date: 2026-07-27
Evidence scope: one authorized account and one network environment
Models: `deepseek-v4-flash` and `deepseek-v4-pro`
Maximum application concurrency: 1
Automatic retries: 0
Maximum `max_tokens` in any request: 96

## Executive result

The primary plan contained 30 case records. It issued 26 HTTP requests and safety-skipped four dependent continuation cases after their initial tool arguments failed JSON validation.

A separate one-time diagnostic issued four additional requests with compact empty-argument tools. Both the single-tool and two-tool round trips completed.

Combined actual HTTP requests: **30**.

| Metric | Result |
|---|---:|
| Primary case records | 30 |
| Primary HTTP requests | 26 |
| Primary safety-skipped continuations | 4 |
| Diagnostic HTTP requests | 4 |
| Combined actual HTTP requests | 30 |
| Combined HTTP 200 | 25 |
| Combined HTTP 400 | 5 |
| Combined tokens | 9,058 |
| Latency samples | 30 |
| Latency minimum | 277 ms |
| Latency median | 296 ms |
| Latency p95 | 440 ms |
| Latency maximum | 549 ms |
| Observed peak application concurrency | 1 |
| Automatic retries | 0 |

The primary expectation score was 10/30. That is a case-contract score, not a model-quality percentage. It includes deliberately invalid controls, strict-schema hypotheses, truncated calls, and four safety skips. The diagnostic score was 4/4.

## Most important finding

HTTP 200 did not mean that a tool call was executable.

Sixteen primary HTTP 200 responses ended with `finish_reason: length` and incomplete argument JSON. The safety boundary correctly refused to execute those calls or construct dependent continuation requests.

A production tool loop should require all of the following before execution:

1. a complete response or completed stream;
2. the expected finish condition;
3. a recognized allowlisted tool name;
4. unique call IDs;
5. parseable argument JSON;
6. schema-valid arguments;
7. authorization for the specific local action.

## `tool_choice` observations

The 16 first-turn rows covered both models.

For each model, non-thinking mode tested omitted choice without tools, omitted choice with tools, explicit `none`, `auto`, `required`, and a named function. Thinking mode tested `required` and named forcing.

| Case | Flash | Pro | Interpretation |
|---|---|---|---|
| Omitted, no tools | HTTP 200, no call, non-empty text | HTTP 200, no call, non-empty text | Matches the documented no-tools default in this run. |
| Omitted, tools present | HTTP 200, one call started, truncated arguments | HTTP 200, one call started, truncated arguments | Tool selection occurred, but the 48-token cap prevented an executable call. |
| Explicit `none` | HTTP 200, no call, non-empty text | HTTP 200, no call, non-empty text | No tool call was observed. |
| Explicit `auto` | HTTP 200, one call started, truncated arguments | HTTP 200, one call started, truncated arguments | Selection occurred; argument validation failed after truncation. |
| Explicit `required`, non-thinking | HTTP 200, one truncated call | HTTP 200, one truncated call | A call was started, but local execution remained unsafe. |
| Named function, non-thinking | HTTP 200, one truncated named call | HTTP 200, one truncated named call | Named selection started but did not yield complete JSON. |
| `required`, thinking | HTTP 400 | HTTP 400 | Dated payload/provider observation; not proof that all thinking tool use is unsupported. |
| Named function, thinking | HTTP 400 | HTTP 400 | Dated payload/provider observation; investigate compatibility before relying on forcing. |

The official Chat Completion reference documents `none`, `auto`, `required`, and the named function object. The table above records this run's behavior, not a replacement for the official contract.

## Single and multiple calls in the primary plan

The primary single-call initial request returned HTTP 200, started one call, and ended at the 64-token cap with invalid argument JSON. Its continuation was not issued.

The primary multiple-call initial request returned HTTP 200, started two calls with two unique IDs, and ended at the 96-token cap with invalid argument JSON. Its continuation was not issued.

These two skipped continuations account for two of the four primary safety skips.

## Strict-mode acceptance matrix

Five strict cases separated server request acceptance from generated-argument completeness.

| Case | Route | Status | What can be concluded |
|---|---|---:|---|
| Valid strict schema | Beta | 200 | The server accepted the request. The 64-token cap still produced incomplete arguments. |
| Missing `additionalProperties: false` | Beta | 200 | The server accepted this dated payload. Do not treat permissive acceptance as a portable contract. |
| Same strict tool | Standard | 200 | The request was accepted in this run. Official documentation still requires the Beta route for strict mode. |
| One property omitted from `required` | Beta | 400 | This invalid strict schema was rejected. |
| Documented unsupported `minLength` | Beta | 200 | The server accepted this dated payload, but generated arguments were incomplete. Do not rely on undocumented permissiveness. |

Three lessons follow:

- request acceptance and argument correctness are separate checks;
- one rejected invalid schema does not prove that every documented constraint is server-enforced identically;
- application preflight should remain conservative even when a dated server response is permissive.

The official Tool Calls guide remains the source of truth for the Beta route, `strict: true`, required object properties, `additionalProperties: false`, and supported or unsupported schema features.

## Thinking replay branch

The thinking replay initial request returned HTTP 200 with:

- `reasoning_content` present;
- one tool call;
- `finish_reason: length`;
- invalid argument JSON.

The safety gate therefore did not execute the tool. It also did not issue either dependent branch:

- full assistant replay;
- missing-`reasoning_content` negative control.

This live run did **not** test the continuation comparison. It must not be cited as evidence that missing reasoning replay succeeded or failed.

The official Thinking Mode guide says that after a thinking-mode tool call, the complete `reasoning_content` must be passed back and that incorrect replay returns HTTP 400. That remains the production rule.

## Streaming assembly

| Case | Status | SSE events | `[DONE]` | Finish reason | Calls | Arguments valid |
|---|---:|---:|---|---|---:|---|
| Flash, non-thinking, named | 200 | 31 | Yes | `tool_calls` | 1 | Yes |
| Pro, thinking, `auto` | 200 | 55 | Yes | `length` | 1 | No |

No local tool executed before the complete stream had been assembled and validated.

The Flash stream demonstrated a complete, valid streamed call. The Pro thinking stream demonstrated the opposite boundary: transport completion and `[DONE]` were not enough when the assembled argument JSON was incomplete.

## Compact-schema diagnostic follow-up

The one-time follow-up used `deepseek-v4-flash`, thinking disabled, the standard route, `max_tokens: 96`, and fixed read-only tools with empty restrictive object schemas.

It was not an automatic retry loop. It was a separately bounded diagnostic with a hard four-request allowance.

| Scenario | Initial | Validation | Continuation | Result |
|---|---|---|---|---|
| One tool | HTTP 200, `tool_calls`, one unique ID | Arguments parsed and passed | HTTP 200, `stop`, non-empty content | Round trip completed |
| Two tools | HTTP 200, `tool_calls`, two unique IDs | Both argument objects parsed and passed | HTTP 200, `stop`, non-empty content | Round trip completed |

The result does not prove that empty schemas are appropriate for production tools. It shows that the earlier failures were consistent with output-budget and payload-size pressure rather than a universal inability to complete a tool loop.

## Offline validation

The final deterministic suite passed 20/20 tests with zero network requests.

It covers:

- `tool_choice` contract handling;
- strict-schema preflight;
- argument parsing and validation;
- full thinking replay preservation;
- multiple-tool orchestration;
- unknown-tool rejection;
- duplicate call-ID defense;
- maximum-iteration termination;
- live-runner request budgets;
- the mocked 30-request primary transport;
- the mocked four-request follow-up;
- redaction and static secret scanning.

## Privacy boundary

The public artifacts contain no:

- API key or key fragment;
- Authorization header;
- account identifier;
- raw prompt;
- raw reasoning;
- raw argument string or parsed argument object;
- raw tool result;
- provider request ID;
- provider tool-call ID;
- raw provider error body.

Only allowlisted case metadata, statuses, timings, counts, validation booleans, and token counters are published.

## Reproducibility files

- `results/live-results-summary.json` contains the 30 primary case records.
- `results/live-followup-summary.json` contains the four diagnostic records.
- `results/combined-live-findings.json` contains the combined interpretation.
- `results/live-case-summary.csv` contains 34 sanitized rows: 30 primary records, including four skips, plus four follow-up records.
- `results/offline-results-summary.json` records the 20/20 deterministic result.
- `src/live-runner.mjs` defines the primary bounded plan.
- `src/live-followup.mjs` defines the separate one-time diagnostic.
- `TEST_PLAN.md`, `SECURITY.md`, and `official-sources.md` define the method and evidence boundaries.

## How to reproduce safely

1. Use Node.js 20 or newer.
2. Run `npm test`. This performs offline work only.
3. Review the official source register and current DeepSeek documentation.
4. Review the fixed plans and their budgets before any authorized live run.
5. Supply a temporary key only as an in-memory function argument.
6. Preserve concurrency one and zero automatic retries.
7. Revoke temporary credentials after the authorized run.
8. Publish only sanitized returned objects after static and manual inspection.

There is intentionally no shell command that accepts a key and no `npm run live` script.

## Limitations

- This was one account, one network environment, and one date.
- Low output caps were deliberate and materially affected outcomes.
- HTTP 400 observations do not reveal a raw provider error because error bodies were intentionally excluded.
- The thinking replay comparison was safety-skipped and remains unmeasured here.
- Strict-mode permissiveness may change and should not override documented requirements.
- Latency values describe these 30 requests only and are not a performance benchmark.
