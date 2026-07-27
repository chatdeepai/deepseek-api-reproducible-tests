# OpenAI SDK with DeepSeek Reproducibility Harness

This folder contains an English-only, dependency-minimal test harness for a dated compatibility study of the current official OpenAI Python and Node SDKs with DeepSeek's OpenAI-format Chat Completions API.

Status: dated live run completed on 2026-07-27 UTC. All 20 preregistered provider requests were issued serially with zero retries, and the temporary credential was revoked after the run.

## Dated result snapshot

- HTTP 200 parsed by the SDKs: 18
- HTTP 400 typed invalid-model outcomes: 2
- requests skipped: 0
- unexpected client failures: 0
- JSON Output valid: 2 of 2
- streams completed with terminal `stop`: 2 of 2
- valid initial tool calls: 2 of 2
- complete tool round trips: 2 of 2
- both dated alias probes returned `deepseek-v4-flash`

The two basic cases omitted `thinking`. Both returned HTTP 200 with nonempty reasoning and `finish_reason=length`, but no final content under the deliberately small 64-token cap. This is a documented-default-thinking and output-budget observation, not an SDK transport failure. Explicitly disabled thinking produced final content through both SDKs.

See [LIVE_RUN.md](LIVE_RUN.md) and [results/combined-live-findings.json](results/combined-live-findings.json) for the complete sanitized evidence.

## What this harness tests

The preregistered matrix contains exactly 20 possible provider HTTP requests:

- 10 requests through OpenAI Python `2.48.0`
- 10 requests through OpenAI Node `6.49.0`
- concurrency: 1
- automatic retries: 0
- hard provider request cap: 20
- generation caps: 16 to 96 tokens

Each SDK covers:

1. `GET /models`
2. basic Chat Completions with the `thinking` field omitted
3. explicit non-thinking mode
4. explicit thinking mode with `deepseek-v4-pro`
5. streaming
6. JSON Output
7. a compact initial tool call
8. the matching tool-result continuation
9. invalid-model error mapping
10. one dated legacy-alias probe

The Python alias probe uses `deepseek-chat`; the Node probe uses `deepseek-reasoner`. These are observational cases. The plan does not assume that either alias will resolve, fail, or map to a particular current model.

The OpenAI Responses API is intentionally out of scope. It belongs to a separate compatibility study and must not be inferred from Chat Completions transport success.

## Current documented configuration

DeepSeek's official documentation uses the OpenAI SDK with the public API origin below:

```text
https://api.deepseek.com
```

Do not append `/v1` in this harness. The official DeepSeek samples use:

```python
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["DEEPSEEK_API_KEY"],
    base_url="https://api.deepseek.com",
    max_retries=0,
)
```

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
  maxRetries: 0,
});
```

DeepSeek-specific request fields require deliberate serialization:

- Python places `thinking` under `extra_body`.
- Node sends `thinking` as an additional Chat Completions body property, matching DeepSeek's current Node sample and the OpenAI Node SDK's documented pass-through behavior for extra request properties.
- Thinking-enabled cases send `reasoning_effort: "high"`.
- DeepSeek JSON Output uses `response_format: {"type":"json_object"}` and a prompt that explicitly requests JSON.
- The tool continuation preserves the assistant tool-call message and sends the matching tool result. Provider-generated tool-call IDs remain in memory and are replaced by a synthetic alias in persisted evidence.

## Folder map

```text
bin/                         Guarded Node entry points
fixtures/request-plan.json   Frozen 20-request plan
results/                     Sanitized live summaries only
src/node-live.mjs            Guarded Node live runner
src/python_live.py           Guarded Python live runner
src/plan.mjs                 Plan validation
src/security.mjs             Result allowlist and secret scan
tests/                       Contract and localhost SDK tests
official-sources.md          First-party source register
TEST_PLAN.md                 Detailed preregistration
SECURITY.md                  Credential and evidence controls
```

The pre-existing `visual-plan/` folder is independent of this harness and was not modified.

## Install dependencies

The only runtime package added for each language is the official OpenAI SDK.

```bash
npm install
python -m venv .venv
python -m pip install -e .
```

Package versions are pinned to the official repository metadata reviewed on 2026-07-27. Recheck the official repositories before a later dated rerun and record any intentional version change.

## Offline verification

These tests never contact DeepSeek. The SDK tests start a temporary server bound to `127.0.0.1`, send ten synthetic requests per language, verify the serialized paths and bodies, parse regular and streaming fixtures, and verify typed 404 error mapping.

```bash
npm run test:contract
npm run test:node-sdk
python -m unittest discover -s tests -p "test_python_sdk_offline.py"
```

Localhost mock requests do not count toward the 20-request provider cap.

## Guarded provider run

Do not run either command until the offline suite passes, the official sources are rechecked, and an authorized test key is available. Each runner refuses to proceed unless `ALLOW_PROVIDER_REQUESTS=1` is set. Both clients set retries to zero and execute cases serially.

Node:

```bash
ALLOW_PROVIDER_REQUESTS=1 DEEPSEEK_API_KEY="set-outside-source-control" npm run live:node
```

Python:

```bash
ALLOW_PROVIDER_REQUESTS=1 DEEPSEEK_API_KEY="set-outside-source-control" python src/python_live.py
```

Run each provider runner at most once for one complete dated experiment. The static plan contains ten cases per SDK and cannot exceed 20 requests if each runner is invoked once. A safety-gated tool continuation may be skipped if the initial tool call is absent or invalid, reducing the actual total.

## Evidence boundary

Persisted results contain allowlisted metadata only:

- case ID, SDK, scenario, elapsed milliseconds, and HTTP status
- parsed choice, finish, stream, JSON, or tool-validation flags
- returned public model string for the dated alias probes
- typed SDK exception class and sanitized error code
- request and skip counts

The runners do not persist prompts, generated content, reasoning text, request or response headers, provider request IDs, provider tool-call IDs, raw arguments, API keys, account identifiers, balances, or raw error messages.

## Interpretation

Passing the offline suite proves that the pinned SDK can serialize the intended request shapes and parse controlled OpenAI-format fixtures. It does not prove that DeepSeek accepts those requests.

A later live HTTP 200 proves only that one dated request reached and was accepted by the tested DeepSeek surface. It does not establish complete OpenAI API compatibility, long-term alias policy, model equivalence, service reliability, or support for untested endpoints.

See [official-sources.md](official-sources.md), [TEST_PLAN.md](TEST_PLAN.md), and [SECURITY.md](SECURITY.md) before running the experiment.
