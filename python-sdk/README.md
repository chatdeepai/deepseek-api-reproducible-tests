# DeepSeek Python SDK Reproducibility Harness

This English-only harness tests Python-specific production behavior when the official OpenAI Python SDK is used with DeepSeek's documented OpenAI-format Chat Completions API.

Status: dated live run completed once on 2026-07-27 UTC. All 14 preregistered requests were issued serially with zero automatic retries, and the temporary credential was revoked and cleared after the run.

## Dated measured findings

- HTTP 200 parsed responses: 12
- HTTP 400 typed invalid-model responses: 2
- requests skipped: 0
- unexpected client failures: 0
- sync standard thinking-disabled: `stop`, final content present, no reasoning field
- async standard thinking-disabled: `stop`, final content present, no reasoning field
- both standard thinking-enabled V4 Pro cases: reasoning present, final content absent, `length` at the 96-token cap
- sync thinking-disabled stream: 34 events, content deltas present, no reasoning deltas, terminal `length`
- async thinking-disabled stream: 13 events, content deltas present, no reasoning deltas, terminal `stop`
- both thinking-enabled streams: 98 events, reasoning deltas present, no final-content deltas, terminal `length`
- JSON Output: 2 of 2 valid
- asynchronous tool call: one valid initial call and one completed continuation
- typed invalid-model errors: sync and async both HTTP 400 `BadRequestError` with `invalid_request_error`

The thinking-enabled `length` outcomes are bounded-output observations, not SDK transport failures. Both sync and async clients parsed HTTP 200 responses; the deliberately small 96-token cap was consumed by reasoning before final content appeared.

See [LIVE_RUN.md](LIVE_RUN.md), [results/live-summary.json](results/live-summary.json), and [results/postrun-audit-summary.json](results/postrun-audit-summary.json) for sanitized evidence.

## Distinct scope

This page does not repeat the separate OpenAI Python-versus-Node compatibility study. It focuses on production decisions that matter inside a Python service:

- `OpenAI` versus `AsyncOpenAI`
- standard versus streamed Chat Completions
- explicit thinking disabled and enabled
- JSON Output parsing
- one validated, side-effect-free asynchronous tool round trip
- typed synchronous and asynchronous API status errors
- explicit timeout and retry settings
- client lifecycle and deterministic localhost tests

Model-list parity, legacy aliases, the Node SDK, and the OpenAI Responses API are out of scope.

## Frozen live matrix

The maximum live experiment contains 14 provider HTTP requests:

| Requests | Client and scenario |
|---:|---|
| 2 | Sync standard chat: thinking disabled and enabled |
| 2 | Sync stream: thinking disabled and enabled |
| 1 | Sync JSON Output |
| 1 | Sync invalid-model typed error |
| 2 | Async standard chat: thinking disabled and enabled |
| 2 | Async stream: thinking disabled and enabled |
| 1 | Async JSON Output |
| 2 | One async tool initial request plus its validated continuation |
| 1 | Async invalid-model typed error |
| **14** | **Hard provider cap** |

Live execution is serial, concurrency is one, automatic retries are zero, and generation caps range from 16 to 96 tokens. The tool continuation is skipped if the initial tool call is missing, malformed, or outside the allowlist; no replacement request is sent.

The exact plan is [fixtures/request-plan.json](fixtures/request-plan.json).

## Pinned environment

- OpenAI Python SDK: `2.48.0`
- Python: 3.10 or newer
- DeepSeek API origin: `https://api.deepseek.com`

Install the pinned dependency in an isolated environment:

```bash
python -m venv .venv
python -m pip install --upgrade pip
python -m pip install "openai==2.48.0"
```

The SDK version is checked before any live request. A mismatch fails closed.

## Production client configuration

Sync:

```python
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["DEEPSEEK_API_KEY"],
    base_url="https://api.deepseek.com",
    timeout=30.0,
    max_retries=0,
)
```

Async:

```python
from openai import AsyncOpenAI

client = AsyncOpenAI(
    api_key=os.environ["DEEPSEEK_API_KEY"],
    base_url="https://api.deepseek.com",
    timeout=30.0,
    max_retries=0,
)
```

Use a context manager or call `close()` / `await close()` so connections are released predictably. Reuse a client for related requests instead of constructing one per request.

DeepSeek's current documentation requires the provider-specific thinking toggle under `extra_body`:

```python
response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=[{"role": "user", "content": "Synthetic example."}],
    max_tokens=96,
    reasoning_effort="high",
    extra_body={"thinking": {"type": "enabled"}},
)
```

This plan always sets thinking explicitly. It does not depend on DeepSeek's documented enabled-by-default behavior.

## Offline test suite

The tests use the pinned SDK against a temporary server bound to `127.0.0.1`. No provider host or credential is involved.

```bash
python -m unittest discover -s tests -p "test_*.py" -v
```

The suite verifies:

- the frozen 14-case, serial, zero-retry contract;
- sync and async body serialization;
- DeepSeek `thinking` merge through `extra_body`;
- standard and SSE response parsing;
- separate content and reasoning delta handling;
- JSON Output parsing;
- tool-call validation and matching continuation IDs;
- sync and async typed HTTP 400 errors;
- one attempt when `max_retries=0`;
- three total attempts when `max_retries=2` and two synthetic 500s precede success;
- sync and async `APITimeoutError` mapping with retries disabled;
- result-field, credential, language, and encoding controls.

Localhost requests do not consume the provider request cap.

## Exact live entrypoint

The dated experiment has already run once. Do not repeat this command unless starting a separately authorized, newly dated experiment.

```bash
ALLOW_PROVIDER_REQUESTS=1 DEEPSEEK_API_KEY="set-outside-source-control" python -m src.live_runner
```

PowerShell:

```powershell
$env:ALLOW_PROVIDER_REQUESTS = "1"
$env:DEEPSEEK_API_KEY = "set-outside-source-control"
python -m src.live_runner
```

The runner refuses missing permission, missing credentials, SDK-version drift, plan mutations, retry changes, or a request count above 14. Run it at most once for one dated experiment.

## Post-run sanitizer

After the temporary key has been revoked:

```bash
python -m src.postrun
```

The sanitizer validates all 14 result records against the frozen plan, writes a concise allowlisted CSV, checks request accounting, and scans publishable text files for credentials, Arabic-script text, and common mojibake. It fails instead of publishing a suspicious artifact.

## Evidence boundary

Persisted result files may contain only case metadata, HTTP status, typed exception class, allowlisted error code, elapsed time, finish state, counts, and boolean field-presence or validation outcomes.

They must not contain API keys, Authorization headers, prompts, generated outputs, reasoning text, provider request IDs, provider tool-call IDs, raw tool arguments, account identifiers, balances, or raw error messages.

See [TEST_PLAN.md](TEST_PLAN.md), [SECURITY.md](SECURITY.md), [LIVE_RUN.md](LIVE_RUN.md), and [official-sources.md](official-sources.md).
