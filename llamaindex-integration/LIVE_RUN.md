# Live run record

Status: completed and independently audited.

The frozen plan ran once on July 27, 2026 at 17:57 UTC. It issued 16 of 16
planned provider requests, used concurrency 1, configured zero automatic
retries, and completed in 21.992 seconds. That total is study elapsed time, not
a latency benchmark or service-level result.

## Frozen controls

- Plan: `fixtures/request-plan.json`
- Planned cases: 16
- Provider request cap: 16
- Provider requests issued: 16
- Concurrency: 1
- Automatic retries: 0
- Default timeout: 30 seconds
- Offline suite: 22 of 22 passed
- Independent privacy audit: pass

## Sanitized observations

- Chat and completion: sync and async cases returned HTTP 200 with nonempty
  content and `stop`.
- Streaming: four cases returned HTTP 200 with content deltas and terminal
  `stop`.
- Thinking: V4 Pro returned HTTP 200 with reasoning and final content.
- Structured prediction: a local `ValueError` prevented schema validation.
- Tool initial: HTTP 200, one expected tool name, argument schema invalid.
- Tool continuation: matching identifier replayed, HTTP 200, nonempty content.
- Local RAG: one local record, one source node, HTTP 200, nonempty content.
- Alias probes: both aliases responded; this is dated evidence only.
- Invalid model: typed `BadRequestError`, HTTP 400, expected control observed.
- Study elapsed: 21.992 seconds, not a service benchmark.

The privacy audit recorded 16 ordered results, zero forbidden result fields,
zero secret findings, zero non-ASCII characters, and zero mojibake findings.

## Publication rule

Publish only the fields present in `results/live-summary.json` after confirming
`results/privacy-audit.json` reports `pass`. Do not convert wrapper source,
metadata overrides, localhost fixtures, or unrecorded behavior into support
claims. Do not rerun by deleting the ledger or result files.
