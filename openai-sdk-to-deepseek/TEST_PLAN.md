# Preregistered Test Plan

Plan date: 2026-07-27  
Live status: not run  
Provider request cap: 20  
Planned requests: 20  
Concurrency: 1  
Automatic retries: 0

## Research question

Can the pinned current OpenAI Python and Node SDKs act as correct HTTP clients for the documented DeepSeek OpenAI-format Models and Chat Completions surfaces across basic chat, thinking controls, streaming, JSON Output, one compact tool round trip, and typed error handling?

This is a feature-by-feature compatibility test. It is not a claim of complete OpenAI API parity. The OpenAI Responses API and every unlisted endpoint are out of scope.

## Tested SDK snapshots

| SDK | Pinned version | Minimum runtime | Official source |
|---|---:|---:|---|
| OpenAI Python | 2.48.0 | Python 3.10 | OpenAI `openai-python` package metadata |
| OpenAI Node | 6.49.0 | Node 20 | OpenAI `openai-node` package metadata |

The versions were read from the official repositories on 2026-07-27. A future run must either use these pins or update the plan and record the new versions before any provider request.

## Request accounting

Each row below is executed once through Python and once through Node. The tool round trip occupies two rows. This produces ten possible requests per SDK and 20 total.

| Per-SDK position | Scenario | Model | `max_tokens` | Primary observation |
|---:|---|---|---:|---|
| 1 | Models list | n/a | n/a | SDK list parsing and presence of current public V4 model IDs |
| 2 | Basic chat, thinking omitted | `deepseek-v4-flash` | 64 | Parsed choice, finish reason, content presence, reasoning-field presence |
| 3 | Thinking disabled | `deepseek-v4-flash` | 32 | Provider-specific field serialization and response field presence |
| 4 | Thinking enabled | `deepseek-v4-pro` | 96 | `thinking` plus `reasoning_effort`, without persisting reasoning text |
| 5 | Streaming | `deepseek-v4-flash` | 32 | Iterable SSE parsing, event count, deltas, terminal finish state |
| 6 | JSON Output | `deepseek-v4-flash` | 64 | `json_object` serialization and JSON parse validity |
| 7 | Tool initial | `deepseek-v4-flash` | 64 | One allowlisted function call and valid compact arguments |
| 8 | Tool continuation | `deepseek-v4-flash` | 48 | Matching replay and final parsed response |
| 9 | Invalid model | synthetic impossible model | 16 | Exact status, typed SDK exception, sanitized error code |
| 10 | Dated alias probe | Python: `deepseek-chat`; Node: `deepseek-reasoner` | 32 | Exact status and returned model, or typed status error |

The generation caps are deliberately small to bound cost. A `finish_reason` of `length` is an observation, not automatically an SDK transport failure. The basic omitted-thinking case does not fail solely because content is empty under truncation; it records parsed response shape, finish state, content presence, and `reasoning_content` presence separately.

## Fixed request rules

- Public origin: `https://api.deepseek.com`
- SDK retry settings: `max_retries=0` in Python and `maxRetries=0` in Node
- Serial loop only; no parallel calls
- No generic retry wrapper
- One fixed user message per scenario
- `system` and `user` roles only; no OpenAI-specific `developer` role
- DeepSeek uses `max_tokens`, not `max_completion_tokens`
- Thinking enabled uses `deepseek-v4-pro`, `thinking.type=enabled`, and `reasoning_effort=high`
- Thinking disabled uses `thinking.type=disabled`
- JSON Output prompt contains the word `JSON` and an explicit compact example
- Tool execution is synthetic, local, allowlisted, and side-effect free

## Tool safety gate

The only tool is `get_temperature` with one required string field named `city` and no additional properties.

The continuation request is sent only if all checks pass:

1. exactly one tool call is present;
2. the function name equals the allowlisted name;
3. arguments parse as JSON;
4. the object contains only a nonempty `city` string;
5. the provider tool-call ID remains in memory and is used only to match the synthetic tool result.

If any check fails, the continuation is safety-skipped. No substitute request is sent, so the actual provider total is lower than 20.

## Alias probes

The two legacy aliases are dated observational probes. No success or failure outcome is preregistered. On success, the harness records the exact returned public model string. On failure, it records only status, typed SDK exception class, and an allowlisted error code. It does not store raw provider text.

Alias success must not be described as a permanent compatibility guarantee. Alias failure must not be generalized beyond the tested date, account, SDK version, and request.

## Offline mock tests

Before any live run:

- validate the 20-case JSON plan and contiguous sequence;
- verify ten cases per SDK and both current V4 model variants;
- verify all generation caps are between 16 and 96;
- verify live runners fail closed without explicit permission;
- start a temporary `127.0.0.1` server for each SDK;
- execute the same ten request shapes through each official SDK;
- verify `GET /models` and nine `POST /chat/completions` paths;
- verify Python `extra_body` merges `thinking` into the outgoing body;
- verify Node passes the DeepSeek `thinking` property;
- verify streaming SSE parsing and terminal state;
- verify JSON Output serialization and parsing;
- verify tool-call ID matching in the continuation;
- verify a synthetic 404 maps to the SDK's typed not-found exception;
- scan outputs for forbidden evidence fields and credential-like strings.

Localhost mock requests are not provider requests and do not consume the 20-request cap.

## Per-case result fields

Allowlisted result metadata includes:

- `case_id`, `sdk`, `scenario`
- `request_issued`, `status`, `elapsed_ms`
- `exception_class`, `error_code`
- feature-specific counts, booleans, and finish states
- `returned_model` for alias probes
- synthetic `replay_call_alias`
- safety `skip_code`

No raw request or response is public evidence.

## Acceptance categories

- **Transport parsed:** the SDK returned a typed success object or iterable.
- **Provider rejected, SDK mapped:** the SDK exposed the non-2xx status through a typed API status exception.
- **Feature valid:** feature-specific semantic checks passed, such as valid JSON or a valid tool call.
- **Safety-skipped:** a continuation was not sent because prerequisites failed.
- **Unexpected client failure:** no HTTP status was available or parsing failed before a typed provider result.

The final report must keep these categories separate. A transport success is not automatically a feature success.

## Stop conditions

Stop immediately if:

- the plan or package pins differ from this preregistration;
- either SDK has retries enabled;
- request accounting could exceed 20;
- the API origin is not exactly the documented DeepSeek origin;
- a result writer attempts to persist a forbidden field;
- any credential-like string appears in an output;
- a tool continuation cannot be validated safely;
- an unexpected client condition makes serial accounting unreliable.

