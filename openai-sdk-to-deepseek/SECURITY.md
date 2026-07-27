# Security and Privacy Controls

This harness is designed for a bounded compatibility experiment, not for production traffic.

## Credential rules

- No API key is present in the repository.
- A later provider run reads `DEEPSEEK_API_KEY` from the process environment only.
- Both live runners validate the explicit `ALLOW_PROVIDER_REQUESTS=1` gate before importing the official SDK or constructing a client.
- The key is never printed, returned, serialized, hashed, truncated, or written to a file.
- `.env`, virtual environments, dependencies, and generated result JSON are excluded by `.gitignore`.
- Browser-side SDK use is out of scope because it can expose credentials.

The string used by localhost tests is an explicit offline placeholder and is never sent outside `127.0.0.1`.

## Network boundary

Scaffold creation performs no provider request. Offline SDK tests bind a temporary HTTP server to `127.0.0.1` and point the SDK at that local origin.

The guarded live runners hardcode the documented origin:

```text
https://api.deepseek.com
```

They do not accept an arbitrary origin from an environment variable or command-line option. This prevents accidental use of a different host during the dated experiment.

## Request budget

- Hard provider plan cap: 20
- Planned Python requests: 10
- Planned Node requests: 10
- Concurrency: 1
- Automatic retries: 0
- Generic retry loops: none
- Generation caps: 16 to 96 tokens

Each runner validates the frozen plan before use. Run each runner at most once for one experiment. A failed tool safety gate skips its continuation and reduces the actual total.

## Tool-call boundary

Model-produced tool arguments are untrusted input. The harness:

1. requires exactly one allowlisted function;
2. parses argument JSON;
3. enforces one nonempty string field and rejects additional fields;
4. executes no external tool or side effect;
5. uses a fixed synthetic result;
6. keeps the provider tool-call ID only in process memory;
7. persists only the alias `T1`.

Malformed, unexpected, or incomplete tool calls are not executed or replayed.

## Public evidence allowlist

The result files may contain only:

- case identity and SDK name;
- scenario and request-issued flag;
- elapsed milliseconds and HTTP status;
- typed exception class and sanitized error code;
- model-list counts and public-model presence flags;
- choice, stream-event, tool-call, and validation counts;
- finish states and field-presence booleans;
- public returned model string for the dated alias probes;
- a synthetic tool-call alias or safety skip code;
- aggregate request, skip, retry, and concurrency counts.

Returned model strings and error codes must match narrow character allowlists before persistence.

## Forbidden evidence

The runners reject result objects containing keys associated with:

- raw prompts or message arrays;
- generated text;
- `reasoning_content`;
- raw tool arguments or tool results;
- request or response headers;
- authorization values;
- provider request IDs;
- provider tool-call IDs;
- raw responses or error messages;
- API keys or credential fragments;
- account identifiers, balances, billing details, or user data.

A final string-level credential scan runs before any live summary is written.

## Errors and retries

The official SDKs retry some statuses by default. This harness explicitly disables SDK retries and adds no retry wrapper. The invalid-model and alias cases record status, typed SDK class, and a narrow error code only. Raw provider messages and stack traces are excluded because they may expose request details or local paths.

## Reasoning privacy

Thinking tests record only whether a `reasoning_content` field exists and whether it is nonempty. The field value is never persisted. Streaming tests follow the same rule for reasoning deltas.

## Review checklist

Before a live run:

- recheck all links in `official-sources.md`;
- confirm installed SDK versions match the pins;
- run both localhost SDK suites;
- verify the request plan contains exactly 20 ordered cases;
- verify the provider origin and retry settings;
- confirm `results/` contains no stale summary from an earlier experiment;
- confirm the authorized key is provided only through the environment.

After a live run:

- verify the actual request count does not exceed 20;
- run secret and forbidden-field scans;
- confirm no Arabic-script text appears in public artifacts;
- inspect alias claims for date and scope;
- publish only the sanitized summaries.
