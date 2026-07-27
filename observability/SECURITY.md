# Security and Privacy Boundary

## Offline default

- Offline tests use no credential and no remote network.
- Mock provider tests inject an in-memory `fetch` implementation.
- The package has no telemetry exporter and sends no evidence elsewhere.
- Test prompts and outputs are synthetic fixtures and are discarded before
  evidence is built.

## Completed live boundary

- The dated study used a temporary credential held only in memory.
- The live origin is hardcoded to `https://api.deepseek.com`.
- Eight requests were issued serially, and provider retries were zero.
- The credential was revoked after the run and is absent from every artifact.
- The live command is locked; reproducing the method requires a new,
  separately authorized plan and a new credential.

## Correlation and provider identifiers

Internally generated correlation identifiers may connect lifecycle, stream,
and tool events in process memory. They are private class state and are
represented in public summaries only by `correlation_linked: true`.

Provider request IDs, response IDs, and tool-call IDs remain in process memory
only when protocol replay requires them. They are never persisted.

## Telemetry allowlist

Publishable telemetry may contain:

- public route and model aliases;
- normalized lifecycle event names;
- status, attempt, retry, and terminal-state categories;
- bounded durations and streaming counts;
- token counts returned by the provider;
- a dated price-snapshot identifier and estimated USD amount;
- validation, authorization, and completion booleans;
- aggregate dashboard and SLO values.

Publishable telemetry must not contain:

- API keys, Authorization values, cookies, or headers;
- prompts, message arrays, output, chunks, or hidden reasoning;
- raw tool arguments, tool results, or retrieved context;
- provider request, response, trace, run, or tool-call identifiers;
- internal correlation identifiers;
- account identifiers, balances, email addresses, or user identifiers;
- raw errors, error messages, stack traces, or local paths;
- non-ASCII text or mojibake.

The normal telemetry path uses an allowlist. Text redaction is a secondary
defense for local diagnostics, not permission to publish arbitrary strings.
