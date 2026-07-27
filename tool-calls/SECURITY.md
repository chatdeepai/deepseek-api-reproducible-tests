# Tool Calls Security Boundary

Tool Calls are proposed by a model and executed by application code. This suite treats every proposed function name, call ID, argument string, and tool result as untrusted.

## No live credential path

Offline tests contain no live credential path. The optional live runner accepts a credential only as an in-memory function argument. It never creates, loads from environment or disk, stores in a session object, prints, writes, returns, or revokes a key.

The offline source must not:

- call `fetch`;
- import network-capable Node modules;
- import an HTTP client;
- read environment variables;
- accept a base URL;
- open sockets;
- invoke a shell command;
- write outside its result directory.

The live module is confined to the two exact Chat Completions URLs for the standard and Beta routes. It permits no caller-supplied origin or endpoint, serializes every request, performs zero generic retries, enforces a process-wide 30-request ceiling, and caps every request at 96 output tokens.

The static suite plans 30 requests, equal to the process ceiling. If a tool turn cannot be validated safely, dependent replay requests are skipped instead of using guessed messages.

The separate diagnostic follow-up has an independent one-time ceiling of four. It uses only the standard URL, Flash non-thinking mode, and two fixed read-only tools with empty restrictive object schemas. It does not reset the main suite counter or alter the main result. Its continuation requests are conditional validation steps, not retries.

## Allowlisted dispatch

Only functions registered by the application may execute. An unknown name stops the run with a normalized `unknown_tool` code. The harness never performs fuzzy matching, dynamic import, `eval`, property-path dispatch, or fallback execution.

Fixture tools are synthetic, deterministic, and read-only.

## Argument validation

The function name is checked before argument parsing. Parsed JSON is then checked against the registered schema.

The validator rejects:

- malformed JSON;
- missing required fields;
- unexpected fields when `additionalProperties` is false;
- type mismatches;
- invalid enums;
- pattern and format failures;
- values outside documented numeric constraints;
- unresolved local references.

Errors expose only a code and schema path. They do not echo the untrusted value.

## Call-ID integrity

Every tool result must reference exactly one known `tool_call_id`. Duplicate call IDs are rejected across the entire orchestration run. The public report hashes IDs so provider or application identifiers cannot leak into evidence.

## Thinking replay

When a thinking assistant turn contains tool calls, its `reasoning_content` must be retained in the internal request history. The harness verifies equality between the original field and the replayed field, then publishes only a boolean.

Raw reasoning is never returned by the orchestration report and is removed by the public redactor.

## Bounded loop

The caller supplies a maximum iteration count from 1 to 32. Once exhausted, the harness stops with `max_iterations`. It does not make another model request or execute another tool.

There are zero retries and zero repair loops.

## Tool results

Tool results remain internal to the local replay history. They are not returned in the public report. Production implementations should additionally:

- apply per-tool authorization;
- require confirmation for writes;
- use idempotency controls;
- set timeouts and output-size limits;
- remove secrets and personal data;
- treat instructions inside a tool result as data, not authority.

## Redaction and scan

`sanitizeForPublic` removes:

- credentials and Authorization headers;
- raw headers, bodies, prompts, content, arguments, and tool results;
- `reasoning_content`;
- account and user identifiers;
- stack traces and local paths.

`scanText` and `scanFiles` detect likely key material and return only rule IDs and locations, never the match.

A clean scan is necessary but not sufficient. Manual review remains required before publication.

Live per-case output additionally omits raw provider error bodies, provider IDs, raw tool-call IDs, response text, and request headers. Streaming assembly retains raw fragments only transiently in memory and publishes counts and validation booleans.

## Recorded safety behavior

The 2026-07-27 primary run safety-skipped four dependent continuations rather than executing or replaying incomplete argument JSON. No tool executed from a truncated response.

The separate diagnostic issued four requests only after using compact empty-argument schemas. Its two continuation requests were sent only after the initial call counts, unique IDs, tool allowlists, JSON parsing, and local schema checks passed.

Across the published primary and follow-up artifacts, credentials, headers, prompts, arguments, tool results, reasoning, provider IDs, error bodies, and account data remain excluded.

## Incident response

If untrusted arguments cause an unintended action, or if a secret enters an artifact:

1. stop orchestration;
2. disable the affected tool path;
3. revoke any exposed credential outside this suite;
4. preserve a sanitized event record;
5. remove the unsafe artifact from publication;
6. fix the allowlist, schema, or authorization boundary;
7. rerun deterministic tests before restoring the tool.
