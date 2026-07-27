# DeepSeek API Reproducible Tests

This public evidence repository contains bounded, reproducible live tests used by [Chat-Deep.ai](https://chat-deep.ai/) to verify its independent DeepSeek API guides.

## Current test suite

- [DeepSeek Context Caching](./context-caching/)
  - exact-extension cold/warm control;
  - stable versus volatile prefix comparison;
  - `user_id` isolation control;
  - prefix-length matrix;
  - mutation controls;
  - redacted JSON and CSV result summaries.
- [DeepSeek Thinking Mode](./thinking-mode/)
  - default, enabled, and disabled controls on V4 Flash and V4 Pro;
  - bounded `high` versus `max` reasoning-effort evidence;
  - output-budget exhaustion controls;
  - ordinary and tool-call history compatibility probes;
  - separate streaming `reasoning_content` and `content` measurements;
  - JSON Output and model-routing checks;
  - redacted JSON and CSV result summaries plus editable visuals.
- [DeepSeek API Error Codes](./error-codes/)
  - bounded 200, 400, and 401 controls against the current Chat Completions endpoint;
  - observed 404, 405, and 415 route, method, and media-type responses;
  - dated invalid-model, message-shape, temperature, and `user_id` validation evidence;
  - explicit separation between official definitions, live observations, and local simulations;
  - deterministic offline retry-policy fixtures for 400, 401, 402, 422, 429, 500, 503, and timeouts;
  - redacted JSON and CSV summaries with a hard live-request ceiling.
- [DeepSeek API Rate Limits](./api-rate-limits/)
  - one authenticated model inventory and exactly 12 bounded live completions;
  - a hard application-side concurrency cap of four and zero automatic live retries;
  - dated sequential, concurrent, non-streaming, and streaming observations;
  - deterministic 24-job queue benchmarks at worker caps of 1, 2, 4, and 8;
  - local retry-policy fixtures for 429, 500, 503, 400, timeout, and cancellation;
  - redacted JSON and CSV summaries plus an English-only reproduction harness.
- [DeepSeek JSON Output](./json-output/)
  - one authenticated model inventory and exactly 20 sequential completions;
  - V4 Flash and V4 Pro with thinking enabled and disabled;
  - prompt-requirement, truncation, escaping, null, and synthetic injection controls;
  - complete SSE assembly followed by JSON parsing and exact local-schema validation;
  - deterministic offline parser, schema, stream, and redaction fixtures;
  - audited, redacted JSON and CSV summaries plus editable English-only visuals.
- [DeepSeek API Key](./api-key/)
  - 12 serial live authentication and credential-lifecycle cases with zero generic retries;
  - valid model-list, minimal completion, and balance-availability probes;
  - missing, empty-Bearer, wrong-scheme, synthetic-invalid, and revoked-key controls;
  - two-key overlap, replacement continuity, and confirmed cleanup;
  - deterministic environment, redaction, secret-scan, and rotation-state checks;
  - sanitized JSON and CSV summaries with no key value, fragment, header, amount, or account identifier.

## Evidence policy

- Tests use synthetic English data only.
- API keys, Authorization headers, account balances, personal data, prompt text, and response text are excluded from published result files.
- A result describes one account, endpoint, model, payload set, and time window. It is not a service-level guarantee.
- Provider behavior, model IDs, and prices can change. Each suite records its test date and links to the relevant official documentation.

Chat-Deep.ai is an independent publication and is not affiliated with DeepSeek.
