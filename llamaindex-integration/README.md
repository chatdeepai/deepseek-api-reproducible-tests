# DeepSeek LlamaIndex integration reproducibility harness

This package tests the current official LlamaIndex DeepSeek wrapper through a
localhost OpenAI-compatible fixture, then freezes a separate opt-in live plan.
The offline suite makes no provider requests and needs no real credential.

Current status:

- Offline suite: 22 of 22 tests passed.
- Provider study: completed on July 27, 2026 at 17:57 UTC.
- Frozen provider plan: 16 ordered requests, cap 16.
- Provider requests issued: 16 of 16.
- Concurrency: 1.
- Automatic wrapper and OpenAI client retries: 0.
- Independent privacy audit: pass.
- Default request timeout: 30 seconds.
- Public results: structural allowlisted metadata only.

## Exact tested package set

The dependency set was resolved and tested on July 27, 2026:

| Package | Pinned version |
| --- | --- |
| `llama-index-core` | `0.14.23` |
| `llama-index-llms-deepseek` | `0.3.0` |
| `llama-index-llms-openai-like` | `0.5.3` |
| `llama-index-llms-openai` | `0.6.26` |
| `openai` | `2.48.0` |
| `pydantic` | `2.13.4` |

Python 3.12.13 was used for the offline run. The project requires Python 3.10
or newer and lower than Python 4.

## What the offline suite proves

The suite sends synthetic English-only inputs to an ephemeral loopback server
and exercises the real pinned `DeepSeek` wrapper. It covers:

- sync and async `chat`;
- sync and async `complete`;
- sync and async chat streaming;
- sync and async completion streaming;
- request serialization through the OpenAI-compatible client;
- thinking configuration through `extra_body`;
- non-streaming reasoning conversion into a `ThinkingBlock`;
- Pydantic structured prediction through function calling;
- typed tool-call extraction and argument validation;
- tool-result continuation with a matching in-memory call identifier;
- a local `VectorStoreIndex` and query engine using `MockEmbedding`;
- typed HTTP 400 and 500 errors;
- zero-retry timeout and async cancellation behavior;
- exact package pins, request budget, result-field allowlist, and privacy scans;
- an inert live coordinator when explicit provider opt-in is absent.

These tests prove wrapper and orchestration behavior against the controlled
fixture. They do not prove that the deployed provider accepts a current model,
thinking request, structured-output schema, tool schema, alias, or response
shape.

## Important wrapper findings

The pinned DeepSeek integration subclasses `OpenAILike`. Its model metadata
contains explicit context-window entries only for `deepseek-chat` and
`deepseek-reasoner`, and its default function-calling allowlist contains only
`deepseek-chat`.

The current OpenAI client does not accept `thinking` as a direct method keyword.
The tested path is:

```python
DeepSeek(
    model="deepseek-v4-pro",
    context_window=1_000_000,
    additional_kwargs={
        "extra_body": {
            "thinking": {"type": "enabled"}
        }
    },
)
```

The localhost fixture confirmed that this becomes a top-level `thinking`
object in the JSON request. The live plan still treats provider acceptance as
unmeasured.

The factory sets `context_window=1_000_000` explicitly because the pinned
wrapper otherwise falls back to its internal 64,000-token default for model IDs
that are absent from its small metadata table. This setting affects LlamaIndex
prompt budgeting; it does not send a request field or guarantee usable context.
The live V4 Pro thinking case uses a 256-token output cap so its trivial prompt
has room for both reasoning and final text. Other live cases remain capped at
32 output tokens.

Current V4 tool and structured-output cases set
`is_function_calling_model=True` explicitly so the live study can test the
actual provider boundary. That override changes LlamaIndex metadata and helper
behavior; it is not evidence that the provider supports the request.

## Install the pinned dependencies

Install into an isolated directory:

```text
python -m pip install --target .python-deps \
  llama-index-core==0.14.23 \
  llama-index-llms-deepseek==0.3.0 \
  openai==2.48.0 \
  pydantic==2.13.4
```

The DeepSeek integration resolves the exact transitive wrapper packages listed
above. Verify the installed set with the offline contract tests.

## Run the offline tests

PowerShell:

```text
$env:PYTHONPATH=".python-deps"
$env:PYTHONDONTWRITEBYTECODE="1"
python -m unittest discover -s tests -v
```

POSIX shell:

```text
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=.python-deps \
  python -m unittest discover -s tests -v
```

All offline HTTP traffic is restricted by construction to an ephemeral
`127.0.0.1` port.

## Frozen provider plan

The canonical order and expected evidence fields are in
`fixtures/request-plan.json`. The coordinator:

1. requires `ALLOW_PROVIDER_REQUESTS=1`;
2. requires `DEEPSEEK_API_KEY` from the process environment;
3. refuses to start if a prior ledger, summary, or audit exists;
4. verifies every pinned package;
5. initializes a cap-16 ledger;
6. reserves exactly once before each provider-bound case;
7. executes cases serially;
8. configures automatic retries to zero;
9. writes only allowlisted structural metadata;
10. runs an independent postrun privacy audit.

The live coordinator completed once. It issued all 16 planned requests in the
frozen order and completed the bounded study in 21.992 seconds. That total is
study elapsed time, not a latency benchmark or service-level result.

Measured observations in the sanitized summary:

- sync and async chat returned HTTP 200, nonempty content, and `stop`;
- sync and async completion helpers returned HTTP 200, nonempty content, and
  `stop`;
- all four stream cases returned HTTP 200, content deltas, and terminal
  `stop`; their recorded chunk counts were 19, 23, 16, and 17;
- V4 Pro thinking returned HTTP 200 with both reasoning and final content;
- structured prediction ended in a local `ValueError`, so no schema-valid
  structured object was recorded;
- the initial tool case returned HTTP 200 and one correctly named call, but
  its arguments failed the registered schema check;
- tool continuation replayed the matching identifier in memory, returned HTTP
  200, and produced nonempty final content;
- local RAG selected one local record, returned one source node, and produced
  nonempty content over HTTP 200;
- both legacy aliases responded on the test date; the reasoning alias produced
  reasoning but no final content at its 32-token cap;
- the invalid-model control produced a typed `BadRequestError` with HTTP 400;
- the independent audit passed with 16 ordered results, zero forbidden fields,
  zero secret findings, zero non-ASCII characters, and zero mojibake findings.

Alias acceptance is a dated observation, not a recommendation or
future-availability guarantee. The structured and tool-argument failures must
not be described as successful provider support.

## Exact live command contract

The one-time live run is complete. The coordinator now refuses a rerun because
the ledger, summary, and audit files exist. The command contract used for the
controlled run was:

PowerShell:

```text
$env:ALLOW_PROVIDER_REQUESTS="1"
$env:PYTHONPATH=".python-deps"
python -m src.live_runner
```

POSIX shell:

```text
ALLOW_PROVIDER_REQUESTS=1 PYTHONPATH=.python-deps python -m src.live_runner
```

`DEEPSEEK_API_KEY` must already exist in the process environment through an
approved secret mechanism. Do not place a credential in a command, file,
notebook, screenshot, shell history, or published artifact.

## Result contract

Every result may contain only these common fields:

`case_id`, `runtime`, `scenario`, `execution`, `requested_model`, `thinking`,
`request_issued`, `status`, `outcome`, and `elapsed_ms`.

Scenario-specific fields are limited to:

`response_class`, `content_nonempty`, `finish_reason`,
`reasoning_field_present`, `reasoning_nonempty`, `chunk_count`,
`content_delta_seen`, `reasoning_delta_seen`, `terminal_finish_reason`,
`schema_valid`, `validated_field_count`, `steering_method`,
`tool_call_count`, `tool_name_valid`, `arguments_schema_valid`,
`matching_identifier_replayed_in_memory`, `retriever_type`,
`selected_record_count`, `source_node_count`, `exception_class`,
`error_code`, and `expected_error_observed`.

Prompts, generated text, reasoning text, raw responses, headers, credentials,
account data, retrieved context, tool arguments, and provider identifiers are
forbidden.
