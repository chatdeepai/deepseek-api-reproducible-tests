# Live Run Record

Status: completed and locked.

- Plan frozen: 2026-07-27T19:51:36Z
- Provider run: 2026-07-27T19:52:17.278Z to 2026-07-27T19:54:06.051Z
- Planned and observed cases: 8
- Concurrency: 1
- Provider retries: 0
- Per-request timeout: 30 seconds
- Expected outcomes observed: 8 of 8
- HTTP accounting: 7 expected HTTP 200 responses and 1 expected HTTP 400
- Token accounting: 10,036 prompt, 98 completion, 10,134 total
- Estimated cost: USD 0.000808071 using the official 2026-07-27 price snapshot
- Privacy audit: pass
- Temporary credential: revoked after the run and never persisted

The streaming case produced a normal terminal state and final usage but
returned five words against a six-word contract. The quality monitor caught
that miss. The repeated-prefix case returned 4,736 cache-hit and 74 cache-miss
input tokens on the immediate repeat. These are individual dated observations,
not provider latency, quality, cache-persistence, billing, or SLA claims.

The frozen plan is `fixtures/live-plan-frozen.json`. The sanitized result is
`results/live-summary.json`, and its independent post-run validation is
`results/live-privacy-audit.json`. The live command deliberately fails closed
because this study is complete.
