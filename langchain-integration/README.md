# DeepSeek LangChain Integration Reproducibility Harness

This package supports a dated, reproducible review of the dedicated DeepSeek
integrations for LangChain Python and LangChain.js. It separates deterministic
localhost tests from a guarded provider run.

A single bounded provider run completed on July 27, 2026 at 16:54 UTC. It
issued all 16 preregistered requests with concurrency 1 and zero automatic
retries. The independent postrun privacy audit passed.

## Dated live findings

- Current-model Python sync and async calls, Python sync and async streams,
  JavaScript invoke and stream, structured-output cases, strict tool cases,
  and the synthetic local-context RAG case reached HTTP 200.
- Python JSON mode and JavaScript function calling both returned schema-valid
  objects.
- V4 Pro thinking preserved non-empty reasoning metadata, but the 96-token cap
  ended with `length` before final text.
- The strict tool continuation reached HTTP 200 but produced no final text
  while tool selection remained forced.
- The two retired-alias probes returned HTTP 200 on the test date. This is an
  observation, not a recommendation or future-availability guarantee.
- Python and JavaScript invalid-model controls both produced typed HTTP 400
  errors.
- The 18-case offline suite passed, and the publishable evidence contained no
  credentials, raw prompts, outputs, reasoning text, provider IDs, non-ASCII
  characters, or mojibake.

## What is covered

- Python `ChatDeepSeek`: sync invoke, async invoke, sync stream, async stream,
  JSON-mode structured output, strict tool binding and replay, typed errors,
  explicit retry layering, timeouts, cancellation, and a local-context Runnable.
- JavaScript `ChatDeepSeek`: async invoke, async streaming, structured output,
  tool-schema serialization, typed errors, zero-retry behavior, and cancellation.
- Configuration pass-through for model, base URL, thinking mode, reasoning
  effort where used, timeout, and retry count.
- A frozen 16-case provider plan: 11 Python cases and five JavaScript cases,
  including two dated probes for the retired aliases.
- A cross-process request ledger, sanitized summary, and postrun privacy audit.

## Pinned environment

Python:

- `langchain==1.3.14`
- `langchain-deepseek==1.1.0`
- `langchain-openai==1.4.1`
- `langchain-core==1.5.1`
- `openai==2.48.0`
- `pydantic==2.13.4`

JavaScript:

- `@langchain/deepseek==1.1.5`
- `@langchain/core==1.2.3`
- `zod==4.4.3`
- Node.js 20 or newer

## Run the offline tests

Portable Python:

```text
PYTHONPATH=.python-deps python -m unittest discover -s tests -v
```

Windows with an explicit runtime:

```powershell
$env:PYTHONPATH="$PWD\.python-deps"
& "<python-executable>" -m unittest discover -s tests -v
```

Portable JavaScript:

```text
node --test js-tests/*.test.mjs
```

Windows with an explicit runtime:

```powershell
& "<node-executable>" --test js-tests/*.test.mjs
```

All offline network activity is restricted by construction to an ephemeral
HTTP server bound to `127.0.0.1`.

## Run the frozen live plan

Read `LIVE_RUN.md` and the frozen `fixtures/request-plan.json` first. Then
supply the credential through the process environment only:

```text
ALLOW_PROVIDER_REQUESTS=1 DEEPSEEK_API_KEY=<environment-only> PYTHONPATH=.python-deps python -m src.live_runner
```

PowerShell:

```powershell
$env:PYTHONPATH="$PWD\.python-deps"
$env:ALLOW_PROVIDER_REQUESTS="1"
$env:DEEPSEEK_API_KEY="<set outside source control>"
$env:NODE_BINARY="<node-executable>"
& "<python-executable>" -m src.live_runner
```

The Python coordinator runs all 11 Python cases serially, starts the pinned
Node runner for the final five JavaScript cases, and enforces one shared cap.
It refuses to run without explicit opt-in, an environment credential, or when
prior result state could make accounting ambiguous.

## Live account requirements

Only one DeepSeek Platform API account is required, with:

- one active API key supplied through `DEEPSEEK_API_KEY`;
- enough available API credit for at most 16 small, serial requests;
- access to the currently documented V4 models.

No ChatDeepSeek web account, GitHub account, OpenAI account, LangSmith account,
external vector database, tracing service, or additional SaaS account is
required. The two retired-alias probes do not require a separate account.

## Evidence written after a live run

- `results/run-ledger.json`: case IDs and the number of reserved requests only.
- `results/js-partial.json`: sanitized JavaScript case metadata only.
- `results/live-summary.json`: the combined allowlisted result.
- `results/privacy-audit.json`: independent checks for case order, request cap,
  forbidden fields, secrets, non-ASCII characters, and mojibake.

The evidence never stores prompts, generated text, reasoning text, headers,
credentials, provider request IDs, tool-call IDs, tool arguments, retrieved
context, balances, or account data.
