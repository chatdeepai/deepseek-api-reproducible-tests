# Frozen test plan

Status: offline complete; live provider study completed and audited.

## Controls

- Plan file: `fixtures/request-plan.json`
- Planned provider requests: 16
- Provider request cap: 16
- Concurrency: 1
- Automatic retries: 0
- Timeout per request: 30 seconds
- Explicit LlamaIndex context window: 1,000,000 tokens
- Output cap: 32 tokens except 256 for the V4 Pro thinking case
- Inputs: synthetic English only
- Tools: read-only synthetic lookup only
- Retrieval: one local synthetic record with `MockEmbedding`
- Output: allowlisted structural metadata only

## Offline result

On July 27, 2026, 22 of 22 deterministic tests passed against the pinned
packages and an ephemeral localhost fixture.

The suite verifies chat and completion methods, both stream families,
`extra_body` thinking serialization, reasoning conversion, structured
prediction, tools, continuation, local RAG, typed errors, zero retries,
timeouts, cancellation, package pins, request accounting, and privacy policy.

## Live result

The frozen live plan ran once on July 27, 2026 at 17:57 UTC. All 16 request
slots were issued serially with zero automatic retries. The study completed in
21.992 seconds, which is not a latency benchmark.

The independent audit passed. The sanitized summary records successful chat,
completion, stream, thinking, tool continuation, and local RAG paths; a local
structured-prediction `ValueError`; an initial tool call with arguments that
failed the registered schema check; two dated alias acceptances; and the
expected typed HTTP 400 invalid-model control.

## Frozen live cases

| # | Case ID | Purpose | Expected evidence fields |
| --- | --- | --- | --- |
| 1 | `py-chat-sync-v4-flash` | Sync chat on current Flash ID | response class, nonempty flag, finish reason, reasoning presence |
| 2 | `py-chat-async-v4-flash` | Async chat on current Flash ID | response class, nonempty flag, finish reason, reasoning presence |
| 3 | `py-complete-sync-v4-flash` | Sync completion helper over the chat model | response class, nonempty flag, finish reason |
| 4 | `py-complete-async-v4-flash` | Async completion helper over the chat model | response class, nonempty flag, finish reason |
| 5 | `py-chat-stream-sync-v4-flash` | Sync chat stream | chunk count, content delta, reasoning delta, terminal finish |
| 6 | `py-chat-stream-async-v4-flash` | Async chat stream | chunk count, content delta, reasoning delta, terminal finish |
| 7 | `py-complete-stream-sync-v4-flash` | Sync completion stream helper | chunk count, content delta, terminal finish |
| 8 | `py-complete-stream-async-v4-flash` | Async completion stream helper | chunk count, content delta, terminal finish |
| 9 | `py-chat-v4-pro-thinking` | V4 Pro with thinking enabled through `extra_body` | response class, content flag, finish reason, reasoning presence |
| 10 | `py-structured-predict-v4-flash` | Pydantic structured prediction with explicit function-calling metadata | schema validity, field count, steering method |
| 11 | `py-tool-call-initial-v4-flash` | One required read-only synthetic tool call | call count, tool-name validity, argument-schema validity |
| 12 | `py-tool-call-continuation-v4-flash` | Replay the matching call identifier and synthetic tool result | identifier replay flag, final-content flag |
| 13 | `py-local-rag-query-engine-v4-flash` | Local one-record query engine with mock embeddings | retriever type, selected count, source-node count, content flag |
| 14 | `py-alias-deepseek-chat-probe` | Dated legacy alias probe | response class, content flag, finish reason, reasoning presence |
| 15 | `py-alias-deepseek-reasoner-probe` | Dated legacy reasoning alias probe | response class, content flag, finish reason, reasoning presence |
| 16 | `py-invalid-model-error` | Expected invalid-model control | typed exception, safe error code, HTTP status, expected flag |

## Interpretation rules

- A localhost pass is not a provider-support claim.
- A wrapper metadata override is not a provider-support claim.
- An HTTP success is not a quality, latency, or service-level claim.
- Alias acceptance, if observed, is dated and is not a recommendation.
- Tool-call validity does not authorize tool execution.
- Schema validity does not establish factual correctness.
- RAG output does not establish retrieval quality beyond the recorded local
  structural facts.
- Study elapsed time is not a latency benchmark.
- Any failed or unexpected case remains in its original slot and is reported
  with safe error metadata. It is not silently retried or replaced.
- If the initial tool case yields no usable call, the dependent continuation
  is recorded as skipped and does not reserve or issue a provider request.
