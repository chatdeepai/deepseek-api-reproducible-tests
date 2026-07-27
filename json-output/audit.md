# DeepSeek JSON Output Page Audit and Original-Test Plan

- Audit date: July 27, 2026 UTC
- Existing URL: <https://chat-deep.ai/docs/json-output/>
- Scope: current public page, current official DeepSeek V4 documentation, SEO intent, bounded original testing, visuals, and reproducibility
- Excluded: live API calls, WordPress changes, balance checks, and legacy-alias probes

## Executive decision

**Keep this page as a standalone Docs-cluster asset. Do not merge it.**

The page serves a distinct implementation and troubleshooting intent: developers want to enable `response_format: {"type":"json_object"}`, obtain parseable JSON, validate a schema, handle empty or truncated content, and understand the boundary with Tool Calls. That intent is narrower than the general API guide and materially different from the Tool Calls, Thinking Mode, SDK, and Error Codes pages.

Recommended publishing controls:

- Keep the existing URL and slug: `/docs/json-output/`.
- Keep only the Docs category.
- Use no WordPress tags.
- Preserve the canonical URL.
- Rewrite around current official facts plus dated original evidence.
- Remove stale legacy-alias material instead of expanding it.

The current page is directionally useful and already covers most of the right concepts, but it is too repetitive, contains post-deadline model text, relies on editorial recommendations that are not clearly labeled, and has no original live evidence or screenshots.

## Current official DeepSeek V4 contract

The rewritten page should state these as official facts and cite the linked primary sources:

1. The current [JSON Output guide](https://api-docs.deepseek.com/guides/json_mode/) says JSON Output is intended to produce valid JSON strings for structured output.
2. Set `response_format` to `{"type":"json_object"}`.
3. Include the word `json` in a system or user prompt.
4. Provide an example of the desired JSON format.
5. Set `max_tokens` reasonably so the JSON string is not truncated.
6. DeepSeek says the API may occasionally return empty content and recommends modifying the prompt to mitigate it.
7. The current [Chat Completion reference](https://api-docs.deepseek.com/api/create-chat-completion/) says `response_format.type` accepts `text` or `json_object`, with `text` as the default.
8. The same reference warns that omitting a JSON instruction can produce whitespace until the output limit, making the request appear stuck.
9. `finish_reason: "length"` can mean generation reached `max_tokens` or the conversation reached the model context limit; content may be partially cut off.
10. The current official model enum and [model inventory reference](https://api-docs.deepseek.com/api/list-models/) identify `deepseek-v4-flash` and `deepseek-v4-pro`.
11. The current [Models & Pricing page](https://api-docs.deepseek.com/quick_start/pricing/) says both V4 models support JSON Output and both support thinking and non-thinking modes.
12. Thinking defaults to enabled. The [Thinking Mode guide](https://api-docs.deepseek.com/guides/thinking_mode/) places intermediate reasoning in `reasoning_content` and the final answer in `content`.
13. The API reference describes JSON validity, not conformance to an application-specific schema. Required keys, types, enums, ranges, null behavior, and business rules still require local validation.
14. JSON Output returns structured final content. Tool Calls are a different API behavior whose generated arguments must also be validated before executing a function.

The article must not blur the following qualifications:

- “Valid JSON” does not mean “matches our exact schema.”
- Empty content contains no JSON value to parse.
- A response ending at `length` can be incomplete even if the HTTP status is 200.
- A successful one-time result is a dated observation, not a permanent model guarantee.

## Current-page audit

### Critical or time-sensitive corrections

| Current material | Problem | Required action |
|---|---|---|
| “Last verified: April 27, 2026” | The page predates the July 24 model-alias deadline and the current July 27 documentation snapshot. | Replace with the actual documentation and live-test date. |
| The legacy section says `deepseek-chat` and `deepseek-reasoner` are scheduled to retire after July 24, 2026. | The date has passed. Future-tense copy is objectively stale. | Delete the scheduled-retirement wording. |
| The page describes old names as active compatibility aliases “during the transition.” | Current pricing, model inventory, and Chat Completion pages list only explicit V4 IDs. Historical transition text is not current support evidence. | Do not claim current alias availability or routing without a dated live probe. This JSON study should not probe aliases; use explicit V4 IDs. |
| The migration example maps `deepseek-reasoner` to V4 Pro while the same section says the transition alias represented thinking-mode V4 Flash. | It can be read as a one-to-one replacement even though model choice is a workload decision. | Remove the legacy mapping table. Link to the dedicated V4 migration page if a short note is necessary. |
| No body screenshots, live-test table, or reproducible results are present. | The page restates documentation but does not add first-party experience. | Make the original V4 matrix the article’s main differentiator. |

### Unsupported or insufficiently qualified claims

| Current claim or pattern | Assessment | Rewrite rule |
|---|---|---|
| Flash is “best” for classification, extraction, high-volume output; Pro is “best” for complex structured decisions. | Reasonable editorial guidance, but the JSON Output contract itself does not define those use cases. | Present as a recommended starting point, not an official guarantee. Attribute official support only: both models support JSON Output. |
| Thinking disabled is the default recommendation for simple tasks and Pro thinking is recommended for complex work. | Editorial configuration advice. | Label it as the site’s starting configuration and support it with the live 2×2 model/mode matrix. |
| “Most JSON Output failures” come from a fixed list. | No evidence establishes prevalence. | Change to “Common client-side failure modes include…” |
| A vague prompt causes empty content. | The official guide says empty content may occur and prompt modification may mitigate it, but it does not identify one exclusive cause. | Do not assign a definitive cause. Record the exact prompt and outcome in live tests. |
| Markdown wrappers cause parse failures. | Plausible and testable, but not an official DeepSeek guarantee. | Either demonstrate it in an original control or phrase it as defensive parsing guidance. |
| SDK-specific typing behavior around `thinking`. | Version-dependent and outside the core JSON contract. | Move details to the Node.js/TypeScript and OpenAI SDK pages. Use raw HTTPS in the reproducibility harness. |
| Context caching is discussed as part of the JSON workflow. | True but peripheral to JSON correctness. | Keep one contextual link at most; the Context Caching page owns cache behavior and cost. |

### Duplicate and overextended sections

The same instructions are repeated in:

- the opening answer;
- “Official Requirements”;
- the copy-paste prompt;
- the cURL example;
- the Python example;
- the TypeScript example;
- troubleshooting;
- the production checklist;
- the FAQ.

Consolidate the article around one requirements table and one production implementation. Recommended removals or reductions:

- Keep one concise cURL request.
- Use one complete, tested Node.js example tied to the public harness.
- Link to dedicated Python and Node SDK pages instead of retaining two long duplicate clients.
- Reduce Thinking Mode to the tested response-shape and empty-content findings; the Thinking Mode page owns the complete feature.
- Reduce JSON Output versus Tool Calls to one compact decision table; the Tool Calls page owns function execution.
- Remove the full token-usage object and caching explanation; retain one observability paragraph.
- Remove the large “Official Sources” and related-links dump. Cite primary sources next to claims.
- Keep six to eight FAQ questions that answer distinct long-tail searches rather than repeating the introduction.
- Let the site’s table-of-contents component generate navigation if available; do not maintain a second manual outline.

## SEO intent

### Primary intent

Implementation plus troubleshooting:

- how to make DeepSeek return JSON;
- how to use `response_format: {"type":"json_object"}`;
- DeepSeek JSON mode examples;
- valid JSON versus schema-valid data;
- why JSON Output is empty or appears stuck;
- how to parse and validate output;
- whether V4 Flash and V4 Pro support JSON Output;
- JSON Output with Thinking Mode and streaming.

### Proposed SEO fields

- **Focus keyword:** `DeepSeek JSON Output`
- **H1:** `DeepSeek JSON Output: Live V4 Tests for Valid JSON, Schema Validation, and Empty Content`
- **SEO title:** `DeepSeek JSON Output: Live V4 Tests & Validation`
- **Meta description:** `Test DeepSeek JSON Output with V4 Flash and Pro. See response_format examples, parse and schema checks, empty-content controls, streaming, and safe retries.`
- **Canonical:** `https://chat-deep.ai/docs/json-output/`
- **Category:** Docs
- **Tags:** none

Secondary phrases to use naturally:

- DeepSeek JSON mode
- DeepSeek `response_format`
- `json_object`
- return valid JSON
- JSON schema validation
- DeepSeek empty content
- DeepSeek JSON streaming
- V4 Flash JSON Output
- V4 Pro JSON Output

## Recommended article structure

1. Short answer, test date, and independent-site disclosure
2. Official JSON Output requirements
3. What valid JSON does and does not guarantee
4. Original test methodology and safety limits
5. V4 Flash/Pro × thinking enabled/disabled result matrix
6. Prompt ablation: JSON word, example object, and missing instruction
7. Parse success versus exact schema and reference-fact accuracy
8. Empty content, whitespace, and `finish_reason: "length"`
9. Unicode, escaping, nulls, and prompt-injection edge cases
10. Streaming JSON assembly and validation after `[DONE]`
11. Production Node.js parsing and schema-validation example
12. JSON Output versus Tool Calls
13. Troubleshooting decision table
14. Reproducibility, limitations, and update policy
15. Distinct FAQ

Target approximately 2,800–3,500 useful words excluding code. Avoid a long generic list of JSON use cases; original evidence should appear near the top.

## Bounded original live-test matrix

### Safety contract

- Use only the existing temporary DeepSeek Platform key.
- Read the key from `DEEPSEEK_API_KEY` only in explicit live mode.
- Make one authenticated `GET /models` inventory request.
- Hard ceiling: **20 Chat Completions requests**.
- Maximum simultaneous live requests: **1**. Run every completion sequentially.
- Automatic live retries: **0**.
- Fixed origin: `https://api.deepseek.com`.
- Fixed completion endpoint: `/chat/completions`.
- Allowed models: `deepseek-v4-flash`, `deepseek-v4-pro`.
- Do not test `deepseek-chat`, `deepseek-reasoner`, a balance endpoint, billing, key management, or account information.
- Use synthetic English-only inputs.
- Stop the entire plan after any unexpected non-2xx response, transport failure, 402, 429, 500, or 503.
- Per-request timeout: 60 seconds.
- Maximum `max_tokens` in any request: 512.
- Maximum theoretical generated-token allowance across the 20 calls: 5,704 tokens.
- Do not persist or print the key, authorization header, balance, provider request ID, system fingerprint, raw reasoning, or private identifiers.
- Do not treat a timeout as proof that the provider performed no work.

### Shared exact-object task

Use a synthetic ticket whose facts can be validated mechanically:

```text
Ticket T-204: The customer cannot sign in after three failed password resets.
No order ID was provided.
```

Expected object contract:

```json
{
  "ticket_id": "T-204",
  "issue": "account_access",
  "reset_attempts": 3,
  "order_id": null,
  "urgent": true
}
```

Rules:

- exactly the five keys shown;
- `issue` must be one of `account_access`, `billing`, or `technical`;
- `reset_attempts` must be an integer or `null`;
- `order_id` must be a string or `null`;
- `urgent` must be boolean and true when failed resets are three or more.

The validator should separately score:

1. non-empty content;
2. parseable JSON;
3. top-level non-array object;
4. exact key set;
5. correct types and enum;
6. exact reference facts;
7. no extra keys;
8. suitable finish reason.

### Group A — core V4 model and thinking matrix: 8 calls

Use the strong prompt, example object, `response_format: {"type":"json_object"}`, and `max_tokens: 512`.

| ID | Model | Thinking | Repetition |
|---|---|---|---:|
| A1 | `deepseek-v4-flash` | disabled | 1 |
| A2 | `deepseek-v4-flash` | disabled | 2 |
| A3 | `deepseek-v4-flash` | enabled, effort high | 1 |
| A4 | `deepseek-v4-flash` | enabled, effort high | 2 |
| A5 | `deepseek-v4-pro` | disabled | 1 |
| A6 | `deepseek-v4-pro` | disabled | 2 |
| A7 | `deepseek-v4-pro` | enabled, effort high | 1 |
| A8 | `deepseek-v4-pro` | enabled, effort high | 2 |

Purpose:

- observe JSON parsing and exact-schema success on both current models;
- compare final-content availability with thinking on and off;
- record reasoning presence and token counts without storing reasoning text;
- detect empty-content cases rather than assuming they occur or do not occur.

Two repetitions are descriptive only and must not be presented as a statistically reliable model ranking.

### Group B — official prompt requirements: 3 calls

Use V4 Flash with thinking disabled.

| ID | `response_format` | Prompt contains word `json` | Example object | `max_tokens` |
|---|---|---:|---:|---:|
| B1 | `json_object` | yes | no | 128 |
| B2 | `json_object` | no | yes | 32 |
| B3 | `json_object` | no | no | 32 |

The strong A1/A2 prompt is the control containing both the word and the example.

The plan validator must scan the exact system and user prompts case-insensitively so B2 and B3 genuinely omit the token `json`. The low output allowance bounds the official whitespace-risk condition. Record whitespace-only content, empty content, finish reason, output tokens, elapsed time, and parse result. Do not hard-code an expected failure.

### Group C — structured-output edge cases: 5 calls

| ID | Model/mode | Test | Output cap |
|---|---|---|---:|
| C1 | Flash, disabled | Deliberate truncation control requesting a large object | 8 |
| C2 | Flash, disabled | Quotes, backslashes, a newline, and English punctuation that require escaping | 128 |
| C3 | Pro, disabled | Same escaping task for model comparison | 128 |
| C4 | Flash, disabled | Synthetic input says to ignore the schema and produce Markdown | 128 |
| C5 | Pro, disabled | Missing facts that must become explicit `null` values | 128 |

For C1, the purpose is to observe `finish_reason`, parseability, and content length under an intentionally insufficient budget—not to make a universal claim about the model.

For C4, treat schema compliance as a local validator result. Do not describe one synthetic injection as a security benchmark.

### Group D — streaming assembly: 2 calls

| ID | Model/mode | Stream | Output cap |
|---|---|---:|---:|
| D1 | Flash, disabled | true | 128 |
| D2 | Pro, enabled, effort high | true | 512 |

Record:

- time to response headers;
- time to first SSE data event;
- total duration;
- data-event count;
- keep-alive-comment count;
- whether `[DONE]` appeared;
- usage-only event behavior when `include_usage` is enabled;
- assembled final-content length and hash;
- JSON parse and schema validation only after stream completion;
- reasoning event count and reasoning length/hash, never raw reasoning.

### Group E — prompt-only controls without JSON mode: 2 calls

| ID | Model/mode | `response_format` | Prompt | Output cap |
|---|---|---|---|---:|
| E1 | Flash, disabled | omitted | strong JSON-only prompt and exact example | 128 |
| E2 | Pro, disabled | omitted | strong JSON-only prompt and exact example | 128 |

Purpose: compare a clear prompt alone with the explicit API control. A parseable result here would not make `response_format` unnecessary; it would be a dated observation from two calls.

### Total live budget

- Group A: 8
- Group B: 3
- Group C: 5
- Group D: 2
- Group E: 2
- Chat Completions total: **20**
- Model inventory: **1**
- Maximum concurrency: **1**
- Automatic retries: **0**

## Evidence fields and evaluation

Persist only sanitized evidence:

- test ID and group;
- UTC timestamp;
- requested public model and returned public model;
- thinking and stream settings;
- output-token cap;
- HTTP status and content type;
- elapsed time and streaming timing;
- finish reason;
- content presence, whitespace-only flag, byte/character length, and SHA-256;
- `JSON.parse` success;
- top-level value type;
- sorted key names or hashes for unexpected keys;
- missing and extra-key counts;
- type, enum, and exact-reference validation flags;
- a whitelisted normalized object for the fully synthetic expected fields;
- prompt, completion, reasoning, cache-hit, cache-miss, and total token counts;
- reasoning presence, length, and hash only;
- SSE event counters and `[DONE]`;
- whether a retry-related header was present, without assuming it is part of JSON Output behavior.

Do not persist:

- API key or any derivative of it;
- Authorization header;
- balance or account information;
- provider completion ID;
- system fingerprint;
- raw response headers;
- raw reasoning;
- arbitrary raw model output from a failed or unexpected case;
- stack traces containing environment paths.

Report exact denominators. Examples:

- `7/8 core responses contained non-empty final content`;
- `6/8 parsed as JSON`;
- `5/8 passed the exact local schema`;
- `2/2 streams produced [DONE]`.

Never convert a two-repetition result into a general model reliability percentage.

## Reproducible Node harness outline

Directory:

```text
json-output/
  README.md
  package.json
  run-json-output.mjs
  audit.md
  results/                 # ignored by Git
  visuals/
```

Recommended commands:

```text
npm run check
npm run validate
npm run test:offline
npm run plan
npm run live
```

Implementation modules inside one dependency-free Node.js file:

1. **Constants and allow-lists**
   - fixed official origin and endpoints;
   - exact model allow-list;
   - request budget 20 plus one inventory;
   - concurrency one;
   - automatic retries zero;
   - maximum output cap 512.

2. **Plan definitions**
   - immutable A1–E2 cases;
   - shared synthetic inputs;
   - explicit expected schemas;
   - exact prompt variants.

3. **Plan validator**
   - verifies exact call counts;
   - rejects unapproved endpoints and models;
   - verifies every input is synthetic and English-only;
   - asserts B1 contains `json` and B2/B3 do not;
   - confirms maximum token allowance and sequential execution;
   - rejects balance, alias, load, or credential tests.

4. **Raw HTTPS executor**
   - built-in `fetch`;
   - `redirect: "manual"`;
   - `AbortSignal.timeout(60_000)`;
   - no SDK-version dependency;
   - no automatic retry;
   - stop-state propagation.

5. **Non-streaming parser**
   - records body size and hash;
   - distinguishes empty, whitespace-only, and non-empty content;
   - parses only assistant `content`;
   - never publishes `reasoning_content`.

6. **SSE parser**
   - handles arbitrary chunk boundaries;
   - ignores colon-prefixed comments;
   - separates reasoning and final-content deltas;
   - handles an empty `choices` array on the usage event;
   - requires `[DONE]` before final JSON validation.

7. **Local validators**
   - top-level object test;
   - exact-key comparison;
   - primitive type and null checks;
   - enum validation;
   - reference-fact assertions;
   - Markdown-fence and leading/trailing whitespace flags.

8. **Offline unit fixtures**
   - valid object;
   - valid JSON with wrong schema;
   - invalid JSON;
   - empty and whitespace-only content;
   - truncated content;
   - SSE fragments split across chunks;
   - keep-alive comments;
   - usage-only event;
   - synthetic reasoning data that is reduced to a hash and length.

9. **Sanitized artifact writer**
   - timestamped JSON and CSV;
   - separate live and offline evidence labels;
   - no credential, raw reasoning, provider ID, or arbitrary failure body;
   - deterministic summary suitable for generating screenshots.

The script must be safe by default: no argument prints usage; validation and offline tests cannot read the key or access the network; only `--execute` may call DeepSeek.

## Visual and screenshot plan

Use seven or eight visuals. Every chart must identify whether its data is official, live, or simulated.

1. **Featured workflow graphic**
   - request with `response_format`;
   - model final `content`;
   - `JSON.parse`;
   - local schema and business-rule validation.

2. **Official requirements screenshot**
   - current official JSON Output notice;
   - include `response_format`, prompt word, example, `max_tokens`, and empty-content warning;
   - visible access date in the caption.

3. **Core V4 live matrix**
   - Flash/Pro × thinking enabled/disabled;
   - two repetitions;
   - non-empty, parse, schema, reference-fact, and finish-reason fields.

4. **Prompt ablation visual**
   - strong control;
   - word without example;
   - example without the word;
   - neither;
   - output tokens, whitespace/empty status, parse result, and elapsed time.

5. **Parse-valid versus schema-valid diagram**
   - show how syntactically valid JSON can fail exact keys, type, enum, null, or business-rule checks.

6. **Edge-case result matrix**
   - truncation;
   - escaping;
   - synthetic injection;
   - missing/null facts.

7. **Streaming timeline**
   - headers;
   - first SSE event;
   - reasoning events if present;
   - final-content events;
   - usage event;
   - `[DONE]`;
   - final parse and validation.

8. **Reproducibility screenshot**
   - sanitized local HTML report or public GitHub harness;
   - show request ceiling, model allow-list, zero retries, and redaction policy.

Screenshot rules:

- Use the in-app browser for the official documentation capture.
- Render live results into a sanitized local HTML report and screenshot that report.
- Do not screenshot the DeepSeek Platform key page, account dashboard, balance, authorization header, raw terminal environment, browser developer tools containing headers, provider IDs, or raw reasoning.
- Use synthetic final JSON only.
- Give every image a descriptive English filename, alt text, and evidence-aware caption.

## Internal-link boundaries

Use contextual links without duplicating those pages:

- `/docs/api/` — owns endpoint and general request lifecycle.
- `/docs/deepseek-api-key/` — owns key creation, storage, and rotation.
- `/docs/deepseek-thinking-mode/` — owns reasoning fields, effort, and history behavior.
- `/docs/deepseek-tool-calls/` — owns function schemas, arguments, and execution.
- `/docs/deepseek-error-codes/` — owns the complete HTTP error taxonomy.
- `/docs/deepseek-observability/` — owns logging, metrics, tracing, and alerts.
- `/docs/deepseek-nodejs-typescript/` — owns SDK installation and TypeScript compatibility.
- `/docs/deepseek-python-sdk/` — owns Python environment and SDK setup.
- `/models/` — owns model-selection overview.
- `/pricing/` — owns current copied pricing context.

This JSON Output page should own:

- `response_format: json_object`;
- the official prompt requirements;
- final-content parsing;
- parse validity versus schema validity;
- empty/whitespace/truncation handling;
- the original model/mode and prompt-ablation tests;
- streaming JSON assembly;
- bounded recovery.

## Claims that must remain observations

Label all of the following with the exact test date:

- IDs returned by the authenticated `/models` endpoint;
- every status, finish reason, model return value, and token count;
- empty or non-empty content;
- JSON parse success;
- exact-schema and reference-fact success;
- Markdown or whitespace behavior;
- latency, time to first event, and SSE event counts;
- whether keep-alive comments or `[DONE]` appeared;
- response behavior when the prompt omits the word `json`;
- thinking-enabled versus disabled output behavior;
- behavior without `response_format`;
- truncation outcomes;
- Unicode and escaping outcomes;
- synthetic injection outcomes.

Do not claim:

- a universal parse or schema-adherence rate from two repetitions;
- that one model is always better for JSON;
- that missing the word `json` must produce one exact failure;
- that a successful prompt-only response makes `response_format` unnecessary;
- that a 200 response is automatically complete or schema-valid;
- that aliases remain supported;
- that a timeout means no provider work occurred;
- that the synthetic injection test proves production security.

## Rewrite acceptance criteria

The final page should not be updated until:

- the official snapshot is dated;
- the 20-call plan passes offline validation;
- live results are sanitized and reviewed;
- all charts distinguish official, live, and local evidence;
- at least one body example is executed by the harness;
- every code block passes syntax validation;
- no legacy future-tense alias claim remains;
- no raw reasoning, key, balance, or provider identifier appears;
- internal links stay within their topical boundaries;
- the existing canonical, Docs category, and no-tags policy are preserved.
