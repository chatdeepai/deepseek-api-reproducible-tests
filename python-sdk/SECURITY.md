# Security and Privacy Controls

## Credential handling

- No API key is stored in this folder.
- The live runner reads `DEEPSEEK_API_KEY` from the process environment only.
- `ALLOW_PROVIDER_REQUESTS=1` is required before the SDK is imported or a client is created.
- The credential is never logged, returned, hashed, truncated, scanned into a report, or written to disk.
- `.env`, virtual environments, installed dependencies, bytecode, and generated result JSON are ignored.
- The official DeepSeek origin is hardcoded; callers cannot replace it with an arbitrary host.

Localhost tests use `offline-only-not-a-credential`, which never leaves `127.0.0.1`.

## Request controls

- Hard provider cap: 14
- Planned maximum: 14
- Concurrency: 1
- Automatic retries: 0
- Generic retry loops: none
- Output caps: 16 to 96 tokens
- Live timeout: 30 seconds

The SDK's documented default retry behavior is tested only on localhost. It is disabled for every provider request.

## Client lifecycle

The synchronous client uses a context manager. The asynchronous client uses `async with`. Calls are serialized and clients are closed before the result file is written.

## Tool boundary

Model-produced arguments are untrusted. The harness parses and validates one allowlisted schema before using a fixed synthetic result. It performs no network lookup, file mutation, subprocess invocation, database write, or external side effect. Raw arguments and provider IDs remain in memory only.

## Public result allowlist

Permitted fields include:

- case ID, client kind, scenario, requested public model, and explicit thinking mode;
- request-issued flag, HTTP status, elapsed milliseconds;
- typed exception class and narrow error code;
- finish state, event count, choice count;
- content or reasoning field-presence booleans;
- JSON or tool-validation booleans;
- synthetic replay alias and safety skip code;
- aggregate request, status, retry, concurrency, and scan counts.

## Forbidden persisted evidence

- API keys or fragments
- Authorization or other raw headers
- prompts or message arrays
- generated outputs
- reasoning text
- raw stream events
- provider request IDs
- provider tool-call IDs
- raw tool arguments or results
- raw error messages or stack traces
- account identifiers, balances, billing, or personal data

The result writer rejects forbidden field names recursively. The post-run process runs a credential scan before converting evidence.

## Timeout and retry tests

Resilience tests use a temporary localhost server:

- a delayed response maps to `APITimeoutError`;
- a 500 response is attempted once when retries are disabled;
- two synthetic 500s followed by success produce three attempts when retries are explicitly set to two.

These controls make no provider request and should never be described as observed DeepSeek retry timing.

## Post-run sequence

1. Revoke the temporary provider key.
2. Run `python -m src.postrun`.
3. Confirm all result cases match the frozen plan.
4. Confirm issued requests do not exceed 14.
5. Confirm secret, Arabic-script, and mojibake findings are zero.
6. Review only allowlisted JSON and CSV.
7. Keep raw terminal output private and ephemeral.

