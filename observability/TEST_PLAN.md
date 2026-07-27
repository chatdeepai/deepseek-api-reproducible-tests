# DeepSeek Observability Offline Test Plan

Plan date: 2026-07-27
Offline status: ready
Live status: completed and locked

## Research question

Can an application record useful DeepSeek request, stream, usage, retry, tool,
dashboard, and alert signals without retaining credentials, payloads, hidden
reasoning, provider identifiers, or internal correlation identifiers?

## Offline matrix

The deterministic suite must verify:

1. lifecycle transitions are ordered and terminal;
2. internal correlation identifiers never serialize;
3. usage components reconcile before a cost is estimated;
4. cache-hit, cache-miss, and output rates are calculated separately;
5. reasoning tokens are not double-counted;
6. retry classification respects status, idempotency, side-effect state, and
   retry budget;
7. backoff is bounded and deterministic for a supplied jitter sample;
8. streaming metrics retain counts and durations but not chunks;
9. tool traces retain safe phase outcomes but not tool payloads or IDs;
10. allowlisted log records discard unsafe fields;
11. local diagnostic redaction removes credential, email, identifier, and path
    patterns;
12. dashboard aggregation computes request, error, incomplete, retry, stream,
    token, cost, and tool totals;
13. SLO evaluation handles insufficient samples and emits normalized alerts;
14. recursive privacy auditing rejects forbidden keys, secrets, internal IDs,
    non-ASCII text, mojibake, and local paths;
15. the frozen provider plan validates and hashes consistently;
16. live execution fails closed before any network operation;
17. a fully mocked provider run remains serial, capped, zero-retry, and
    publishable.

## Frozen live boundary

- Provider origin: `https://api.deepseek.com`
- Endpoint: `/chat/completions`
- Planned cases: 8
- Hard cap: 8
- Concurrency: 1
- Automatic retries: 0
- Timeout: 30 seconds per request
- Models for functional cases: `deepseek-v4-flash` and
  `deepseek-v4-pro`
- Invalid-model control: synthetic impossible identifier

The eight cases cover ordinary chat, streaming, JSON mode, a required
tool-call proposal without execution, thinking mode, two repeated-prefix cache
observations, and the expected invalid-model error. The tool case validates
the proposed name and arguments but performs no tool side effect.

## Stop conditions

The provider run stopped after the eighth planned case and the temporary key
was revoked. The live command is now locked. Stop publication if:

- the frozen plan, result, order, count, or execution controls disagree;
- request or token accounting is ambiguous;
- a contract or tool safety result is misrepresented;
- a privacy audit fails;
- any forbidden field, secret pattern, internal identifier, local path,
  non-ASCII text, or mojibake appears in evidence.
