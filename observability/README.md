# DeepSeek Observability Reproducibility Harness

This package provides an offline-first, English-only observability reference
for a DeepSeek API integration. It uses only Node.js built-ins. No package
installation, account, credential, external exporter, or provider request is
required for the complete offline suite.

Live status: completed on 2026-07-27 UTC. The temporary credential was
revoked after the run.

## Covered controls

- allowlisted request-lifecycle events and terminal-state validation;
- token usage validation and dated cost estimates;
- retry and backoff classification without automatic provider retries;
- streaming counts, first-event timing, first-content timing, and terminal
  state without retaining chunks;
- tool-call phase traces without arguments, results, or provider identifiers;
- local diagnostic redaction and normal telemetry allowlisting;
- private in-process correlation identifiers that never enter public evidence;
- aggregate dashboards, SLO calculations, and threshold-based alerts;
- recursive evidence privacy auditing;
- a frozen, serial, zero-retry provider plan that fails closed by default.

## Requirements

- Node.js 20 or newer
- no external dependencies

## Run the offline suite

```text
npm test
npm run offline
```

`npm run offline` executes the complete test suite, generates a deterministic
sanitized summary, and writes an independent privacy audit under `results/`.
Every network-facing test injects an in-memory `fetch` replacement. The suite
does not contact DeepSeek or any other remote service.

## Offline evidence

- `results/offline-summary.json`
- `results/privacy-audit.json`

These files contain only synthetic aliases, counts, booleans, normalized
states, bounded timings, token totals, estimated costs, and SLO outputs. They
contain no prompt, response, reasoning, tool payload, credential, header,
account data, provider identifier, internal correlation identifier, raw error,
local path, email address, or non-ASCII text.

## Cost estimate boundary

`fixtures/pricing-snapshot.json` is a dated copy of public list prices. The
calculator distinguishes cache-hit input, cache-miss input, and output tokens.
Reasoning tokens are treated as part of completion tokens and are not added a
second time. Every result is an estimate, not a bill or balance.

Recheck the official pricing page before a later provider run.

## Frozen live plan and dated result

`fixtures/live-plan-frozen.json` records the eight cases frozen before paid
generation traffic:

1. non-streaming V4 Flash lifecycle and usage;
2. V4 Flash streaming lifecycle, timing milestones, terminal usage, and a
   six-word contract;
3. V4 Flash JSON parse and two-field schema validation;
4. one required V4 Flash tool-call proposal, validated but not executed;
5. V4 Pro thinking-mode terminal state, reasoning usage, and final-answer
   validation;
6. the first request in a repeated-prefix cache probe;
7. the immediate repeated-prefix request;
8. an expected invalid-model HTTP 400 control.

The study ran serially with concurrency one, zero provider retries, and a
30-second timeout. The sanitized result is in `results/live-summary.json`; the
independent post-run gate is in `results/live-privacy-audit.json`. Eight of
eight expected outcomes were observed: seven HTTP 200 responses and the
planned HTTP 400 control. The evidence records 10,134 total tokens and an
estimated cost of USD 0.000808071 against the dated official price snapshot.

The live command is now locked and cannot issue provider traffic. Reproduction
requires a new, separately authorized plan and a new credential; do not alter
the dated result or present a new run as the same study.

## Interpretation limit

Offline results validate application instrumentation against controlled
fixtures. The completed provider run is a small dated observation, not a
latency benchmark, reliability measurement, general quality score, billing
statement, cache-persistence test, or service-level guarantee.
