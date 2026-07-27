# DeepSeek Tool Calls Offline Harness

This dependency-free Node.js 20+ suite validates application-side Tool Calls logic without creating a DeepSeek API key and without making any network request.

It converts the current official DeepSeek contract into deterministic local checks for:

- `tool_choice` values `none`, `auto`, `required`, and a named function;
- thinking and non-thinking request policies;
- preservation of `reasoning_content` after a thinking-mode tool call;
- single-tool, multiple-tool, and multiple-turn orchestration;
- strict-mode Beta schema requirements;
- known unsupported strict-schema keywords;
- malformed or schema-invalid arguments;
- unknown tool names;
- duplicate `tool_call_id` values;
- maximum-iteration termination;
- public-result redaction and static secret scanning;
- token and timing summaries.

## Important evidence boundary

This is an offline application-safety harness. It does not claim that a particular model accepted a request or selected a tool. Provider compatibility, latency, token usage, status codes, and model behavior require a separate dated live run.

The offline suite establishes that the local implementation:

1. builds documented choice shapes;
2. rejects unsafe or inconsistent tool calls before execution;
3. preserves the documented thinking replay field;
4. enforces a bounded loop;
5. produces sanitized aggregate evidence.

## No-network contract

Offline validation remains the default and never contacts DeepSeek. An opt-in `src/live-runner.mjs` is included for a separately authorized dated reproduction. It has no CLI command and cannot load a credential from the environment or filesystem.

The suite does not read:

- an API key;
- environment variables;
- command-line credentials;
- browser or clipboard data;
- account, balance, billing, or provider data.

Running `npm test` performs syntax checks and deterministic local tests only.

## Opt-in live plan

The live runner accepts an API key only as the `apiKey` in-memory function argument to `runBoundedLiveSuite`. It never logs, writes, stores in a session object, or returns the credential.

The static plan contains exactly 30 planned requests:

- 16 first-turn cases: for each model, six non-thinking cases (omitted choice without tools, omitted choice with tools, `none`, `auto`, `required`, and named) plus thinking `required` and named;
- 4 requests for one complete single-tool loop and one complete multiple-tool loop;
- 5 strict cases: valid Beta, missing `additionalProperties`, normal-route strict, property omitted from `required`, and unsupported `minLength`;
- 3 thinking replay requests: initial tool turn, full replay, and missing-`reasoning_content` control;
- 2 streaming tool-call assembly requests.

Hard limits:

- fixed URLs only: `https://api.deepseek.com/chat/completions` and `https://api.deepseek.com/beta/chat/completions`;
- process-wide network budget: 30;
- planned suite budget: 30;
- application concurrency: 1;
- generic retries: 0;
- maximum output tokens per request: 96;
- maximum theoretical output-token allowance across the plan: 1,792;
- synthetic read-only local tools only.

The runner may execute fewer than 30 requests after an unsafe or unusable intermediate tool response. It never substitutes a guessed replay merely to reach the planned count.

There is intentionally no `npm run live` command. A trusted controller must import the function and supply the credential without placing it in source, shell arguments, an environment variable, or a file.

### One-time round-trip diagnostic

`src/live-followup.mjs` is separate from the 30-request suite and does not reset or edit its result. It exists only to diagnose argument truncation observed at lower output caps.

Its export is `runSingleAndMultiToolFollowup({ apiKey, fetchImpl?, timeoutMs? })`.

The follow-up permits at most four standard-route Flash, non-thinking requests:

1. one empty-argument read-only tool call;
2. its continuation, only after the call and ID validate;
3. two empty-argument read-only tool calls;
4. their continuation, only after both calls and IDs validate.

It has an independent hard budget of four, concurrency one, zero automatic retries, and `max_tokens: 96`. This is a one-time diagnostic sequence, not a retry loop.

## Dated 2026-07-27 live result

The primary plan issued 26 requests and safety-skipped four dependent continuations after argument validation failed. The separate compact-schema diagnostic then issued four requests. Combined actual HTTP requests were 30, with concurrency one and zero automatic retries.

Headline observations:

- 16 primary HTTP 200 responses ended at a token cap with invalid argument JSON;
- thinking `required` and named forcing returned HTTP 400 on both tested models;
- the strict matrix returned HTTP 200 for the valid Beta schema, the same strict tool on the standard route, the missing-`additionalProperties` control, and the `minLength` control; omitting one property from `required` returned HTTP 400;
- both thinking replay continuation branches were safety-skipped because the initial arguments were incomplete;
- the Flash non-thinking stream assembled one valid call;
- the Pro thinking stream reached `[DONE]` but ended with `finish_reason: length` and invalid arguments;
- the four-request diagnostic completed one single-tool and one two-tool round trip.

The final offline suite passed 20/20 tests. Read [`LIVE_RUN.md`](./LIVE_RUN.md) before interpreting or reproducing the live evidence.

## Local tools

Fixtures use synthetic read-only functions such as inventory and shipping lookups. The model does not execute a tool. The application:

1. receives a proposed call;
2. checks the choice policy;
3. rejects duplicate IDs and unknown names;
4. parses arguments;
5. validates arguments against the allowlisted schema;
6. executes a local function;
7. associates the result with the matching `tool_call_id`;
8. preserves the complete thinking assistant message for the next request;
9. stops at a final answer or the maximum-iteration guard.

Raw arguments, reasoning text, tool results, prompts, and call IDs do not enter the public run summary.

## Run offline validation

```text
npm test
```

The test runner performs no network setup and has no live script.

## Strict mode scope

`validateStrictToolDefinition` implements the first-party constraints needed for a conservative preflight:

- Beta base URL required;
- `strict: true` required;
- supported primitive and composite schema types;
- every object property listed in `required`;
- `additionalProperties: false` on every object;
- supported string `pattern` and documented formats;
- supported numeric constraints;
- arrays with validated item schemas;
- `enum`, `anyOf`, and local `$ref`/`$def`;
- rejection of the documented unsupported `minLength`, `maxLength`, `minItems`, and `maxItems`.

Passing local preflight does not guarantee server acceptance. It prevents known-invalid schemas and documents the exact local subset.

## Public evidence

Publish only the result of `summarizeTurns`, the sanitized orchestration report, and a clean static scan. Do not publish raw thinking text or arbitrary tool results even when the fixture is synthetic; preserving that boundary makes the same code safe to reuse around real responses.

See:

- `TEST_PLAN.md` for the deterministic case matrix;
- `SECURITY.md` for the execution boundary and failure policy;
- `official-sources.md` for first-party sources;
- `LIVE_RUN.md` for the dated run, interpretation, and limitations;
- `fixtures/scenarios.mjs` for synthetic scripted turns;
- `src/live-runner.mjs` for the opt-in bounded live suite;
- `src/live-followup.mjs` for the separate four-request round-trip diagnostic;
- `src/env-guard.mjs` for in-memory credential enforcement;
- `tests/offline.test.mjs` for the executable assertions.
