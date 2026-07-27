# DeepSeek Node.js and TypeScript Reproducibility Harness

This package is a bounded, English-only test harness for DeepSeek's
OpenAI-compatible Chat Completions API through the official OpenAI Node SDK.
It separates deterministic localhost verification from an explicitly gated,
single-run provider study.

Live status: completed and independently audited.

The frozen provider study ran once on July 27, 2026 from 18:59:14 UTC to
18:59:23 UTC. It issued all nine planned requests, skipped none, used
concurrency one, and configured zero automatic retries. The 9.029-second study
duration is not a latency benchmark or service-level result.

## Frozen environment

- Node.js 20 or newer
- `openai==6.49.0`
- `typescript==7.0.2`
- `@types/node==24.13.3`

The official OpenAI Node repository identified 6.49.0 as the current release
when this plan was frozen on July 27, 2026. Recheck the primary sources before
any later dated run, and change the plan before sending traffic if a deliberate
upgrade is required.

## What is covered

The completed provider matrix had nine requests and a hard cap of nine:

1. ordinary non-streaming chat;
2. streaming Chat Completions;
3. JSON mode plus local schema validation;
4. one schema-constrained synthetic tool-call request;
5. one safety-gated tool-result continuation;
6. thinking mode and reasoning-field presence;
7. a dated `deepseek-chat` alias probe;
8. a dated `deepseek-reasoner` alias probe;
9. typed invalid-model error handling.

AbortController cancellation, retry behavior, timeout propagation, request
serialization, and serial concurrency are tested only against an ephemeral
server bound to `127.0.0.1`. They do not consume the provider budget.
The streaming case requests `stream_options.include_usage=true` and retains
only whether the terminal usage chunk was observed.

## Safety properties

- Provider requests require `ALLOW_PROVIDER_REQUESTS=1`.
- The credential is read only from `DEEPSEEK_API_KEY`.
- The provider origin is fixed in code and in the frozen plan.
- `maxRetries` is zero and no retry wrapper exists.
- Cases execute with concurrency one.
- A persistent run ledger reserves every attempted provider request.
- Existing run state blocks ambiguous reruns.
- The tool continuation is skipped unless exactly one allowlisted call has
  schema-valid arguments.
- The final summary is recursively checked against a field denylist, secret
  patterns, ASCII-only evidence, case order, ledger accounting, and the cap.

## Install

```text
pnpm install --frozen-lockfile
```

## Offline verification

```text
pnpm run typecheck
pnpm test
```

The offline suite compiles the TypeScript source and uses only localhost
fixtures. It verifies the real SDK's serialized request bodies and parsed
responses without contacting DeepSeek.

## Completed live evidence

The final sanitized summary records:

- ordinary chat: HTTP 200, one choice, nonempty content, and `stop`;
- streaming: HTTP 200, seven events, content deltas, a usage chunk, and
  terminal `stop`;
- JSON mode: HTTP 200, nonempty content, valid JSON, and a schema-valid
  two-field object;
- initial tool request: HTTP 200, `tool_calls`, one valid allowlisted call, and
  schema-valid arguments;
- tool continuation: HTTP 200, nonempty content, `stop`, and sanitized replay
  alias `T1`;
- V4 Pro thinking: HTTP 200 and nonempty reasoning, but empty final content
  with `length`;
- both legacy alias probes: HTTP 200, returned model
  `deepseek-v4-flash`, and `length`;
- invalid-model control: HTTP 400 with `BadRequestError` and
  `invalid_request_error`.

Alias results are dated observations only. The thinking result was incomplete
under the article's final-content and terminal-state checks.

The completed ledger and result files intentionally block an ambiguous rerun.
Do not delete them to repeat the study.

## Generated evidence

The completed live run created:

- `results/run-ledger.json`
- `results/live-summary.json`
- `results/offline-summary.json`
- `results/privacy-audit.json`

The summary retains allowlisted metadata only. It never stores prompts,
generated text, reasoning text, request or response headers, provider request
IDs, provider tool-call IDs, raw tool arguments, API keys, account identifiers,
balances, raw errors, or stack traces.

## Interpretation limit

Passing localhost tests proves serialization and parsing behavior for the
pinned SDK and controlled fixtures. Each recorded live HTTP success is a dated
observation for one request shape and account only. It does not establish
complete API compatibility, long-term alias availability, model equivalence,
service reliability, or support for untested endpoints.
