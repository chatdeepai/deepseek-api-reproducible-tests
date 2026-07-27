# Live Run Record

Status: completed and independently audited.

The frozen plan ran once on July 27, 2026. It started at 18:59:14 UTC and
completed at 18:59:23 UTC. The 9.029-second total is study duration, not a
latency, throughput, or service-level benchmark.

## Request accounting

- Planned provider requests: 9
- Provider requests issued: 9
- Provider requests skipped: 0
- Hard cap: 9
- Concurrency: 1
- Automatic SDK retries: 0
- Generic retry wrappers: none

The initial tool call passed its safety gate, so the continuation was issued.
No substitute request was used.

## Sanitized observations

- Ordinary chat returned HTTP 200, nonempty content, and `stop`.
- Streaming returned HTTP 200 across seven events with content deltas, a usage
  chunk, and terminal `stop`.
- JSON mode returned HTTP 200, valid JSON, and a schema-valid two-field object.
- The initial tool case returned HTTP 200 with one valid allowlisted call and
  schema-valid arguments.
- Tool continuation returned HTTP 200 with nonempty content and `stop`.
- V4 Pro thinking returned HTTP 200 and nonempty reasoning, but empty final
  content with `length`.
- Both legacy aliases returned HTTP 200 and the public returned model
  `deepseek-v4-flash`; both ended with `length`.
- The invalid-model control returned HTTP 400 as `BadRequestError` with
  `invalid_request_error`.
- The privacy audit passed with nine ordered results, zero forbidden result
  fields, zero secret findings, zero non-ASCII characters, and zero mojibake
  matches.

## Rerun rule

Do not invoke the live command again. The completed ledger, summary, and audit
must remain in place. Any replacement experiment requires a separately
authorized, newly dated plan.

## Evidence boundary

The completed run wrote a sanitized ledger, summary, and privacy audit under
`results/`. These artifacts contain no credential, prompt, generated output,
reasoning text, provider identifier, raw tool data, account data, raw error, or
stack trace.
