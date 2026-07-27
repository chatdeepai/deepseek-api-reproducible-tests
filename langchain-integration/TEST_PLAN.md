# Test Plan

## Evidence boundary

Offline tests establish wrapper and application behavior against deterministic
localhost fixtures. They do not establish provider availability, model quality,
semantic correctness, latency, throughput, or a service-level commitment.

The live plan is frozen in `fixtures/request-plan.json`. It contains exactly 16
planned cases, a hard cap of 16 provider requests, concurrency 1, and automatic
transport retries 0.

## Offline Python coverage

1. Exact plan shape, dependency pins, request cap, and alias inventory.
2. Request-budget refusal for duplicates and a seventeenth reservation.
3. Result allowlisting and privacy scans.
4. Live-coordinator refusal without explicit opt-in.
5. Sync and async invocation.
6. Sync and async streaming.
7. Model, base URL, thinking, and reasoning-effort pass-through.
8. Pydantic validation through JSON mode.
9. Strict tool-schema serialization and normalized tool-call parsing.
10. Deterministic one-record local-context RAG composition.
11. Typed 5xx and timeout exceptions with zero transport retries.
12. An explicit Runnable retry layer separate from transport retries.
13. Async cancellation propagation without retry.

## Offline JavaScript coverage

1. Exact package versions.
2. Async invoke, async stream, model, base URL, and thinking pass-through.
3. Structured-output and bound-tool schema serialization and parsing.
4. Typed 5xx handling, zero retries, and AbortSignal cancellation.

## Frozen provider matrix

- Python current-model paths: sync invoke, async invoke, sync stream, async
  stream, thinking mode, JSON-mode structured output, strict tool request,
  validated tool continuation, and local-context RAG.
- Python dated controls: `deepseek-chat` alias probe and invalid-model error.
- JavaScript current-model paths: invoke, stream, and structured output.
- JavaScript dated controls: `deepseek-reasoner` alias probe and invalid-model
  error.

The tool continuation is safety-skipped without a provider request if the
initial call does not produce exactly one schema-valid call. This can make the
actual request count lower than 16; it can never make it higher.

## Acceptance rules

- Every result appears once and in frozen sequence order.
- Every issued request has exactly one prior budget reservation.
- Total issued requests never exceed 16.
- No automatic SDK retry is configured in the live plan.
- No concurrent provider request is issued.
- Alias outcomes are observations, not predetermined pass or fail states.
- Structured-output validity is kept separate from factual correctness.
- Tool orchestration success is kept separate from safe side-effect execution.
- The postrun privacy audit must pass before any result is publishable.

