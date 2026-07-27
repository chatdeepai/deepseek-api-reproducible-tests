# Security and Privacy Boundary

## Credential handling

- The package contains no API key.
- A live run reads `DEEPSEEK_API_KEY` from the process environment only.
- The key is never printed, logged, returned, transformed, or persisted.
- The live client is constructed only after explicit authorization, plan
  validation, dependency-pin validation, and the rerun guard.
- Browser-side SDK use is out of scope because it can expose credentials.

Localhost tests use the fixed string `offline-only-not-a-credential`.

## Network boundary

- Offline tests bind only to an ephemeral `127.0.0.1` port.
- Live execution requires `ALLOW_PROVIDER_REQUESTS=1`.
- Live execution uses the hardcoded origin `https://api.deepseek.com`.
- No command-line argument or environment variable can change the live origin.

## Request controls

- Planned requests: 9
- Hard cap: 9
- Concurrency: 1
- SDK retries: 0
- Generic retries: none
- Generation limits: 16 to 96 tokens

Every provider attempt requires a prior atomic reservation in
`results/run-ledger.json`. The ledger remains after success or interruption and
blocks an ambiguous rerun. The tool continuation can be skipped, reducing the
actual count.

## Tool boundary

Model-produced tool arguments are untrusted. The harness accepts exactly one
function and one nonempty string field, rejects extra fields, performs no
external action, uses a fixed local result, and retains the provider call
identifier only in process memory. Persisted evidence uses the synthetic alias
`T1`.

## Public evidence boundary

Allowed evidence is limited to safe metadata, counts, booleans, narrow status
values, public model names, safe exception classes, safe error codes, and
aggregate request accounting.

Forbidden evidence includes:

- API keys, authorization values, cookies, or headers;
- prompts, message arrays, generations, chunks, or reasoning text;
- provider request, response, or tool-call identifiers;
- raw tool arguments, tool results, or external context;
- raw errors, error messages, stack traces, or local paths;
- account identifiers, balances, billing, or profile data;
- non-ASCII text or mojibake.

The postrun audit recursively checks field names and the final serialized text
before the summary is considered publishable.

## Errors, retries, and cancellation

The official SDK retries selected errors by default, so this harness sets
`maxRetries: 0` explicitly. The localhost suite proves that a synthetic 500
causes one request. AbortController behavior is tested only against a local
slow fixture; no provider cancellation experiment is planned because aborted
transport accounting can be ambiguous.

## Operational review

Before a live run:

- recheck every primary source in `official-sources.md`;
- confirm installed versions match the frozen plan;
- run type checking and the complete offline suite;
- confirm `results/` contains no prior ledger or summary;
- confirm the authorized key exists only in the environment.

Completed-run handling:

- verify ledger and summary request counts agree;
- run the independent audit command;
- publish only evidence whose audit status is `pass`;
- describe alias outcomes as dated observations only.
