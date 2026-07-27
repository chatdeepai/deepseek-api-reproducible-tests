# DeepSeek Evaluation Framework: Official Source Ledger

Checked: 2026-07-27 UTC

Scope: Primary English-language sources only. DeepSeek documentation is authoritative for the hosted DeepSeek API. OpenAI and NIST sources are used only for general evaluation-method guidance or for the specific CAISI study they describe. No third-party framework claim is treated as a DeepSeek platform fact.

## DeepSeek API Sources

### DS-01: Models and Pricing

- URL: https://api-docs.deepseek.com/quick_start/pricing/
- Publisher: DeepSeek
- Checked: 2026-07-27 UTC
- Supports:
  - The current documented model IDs are `deepseek-v4-flash` and `deepseek-v4-pro`.
  - Both models support thinking and non-thinking modes; thinking is the documented default.
  - Both models have a 1M-token context length and a documented maximum output of 384K tokens.
  - Both models support JSON Output and Tool Calls.
  - Current prices per 1M tokens are:
    - `deepseek-v4-flash`: $0.0028 cache-hit input, $0.14 cache-miss input, $0.28 output.
    - `deepseek-v4-pro`: $0.003625 cache-hit input, $0.435 cache-miss input, $0.87 output.
  - Documented account concurrency limits are 2,500 for Flash and 500 for Pro.
- Cautions:
  - Prices and availability can change. Every published cost observation needs a checked date and the exact formula used.
  - A context-window specification is not evidence that an application retrieves, attends to, or cites the correct evidence.
  - Do not copy older price tables from model reports or historical evaluations into a current API cost section.

### DS-02: List Models

- URL: https://api-docs.deepseek.com/api/list-models/
- Publisher: DeepSeek
- Checked: 2026-07-27 UTC
- Supports:
  - `GET /models` is the documented availability-discovery endpoint.
  - The current response example lists `deepseek-v4-flash` and `deepseek-v4-pro`.
- Cautions:
  - The documentation example is not a substitute for a dated live `GET /models` preflight.
  - A reproducible evaluation run should store the returned model IDs, but should not publish account data or credentials.

### DS-03: DeepSeek V4 Preview Release

- URL: https://api-docs.deepseek.com/news/news260424/
- Publisher: DeepSeek
- Checked: 2026-07-27 UTC
- Supports:
  - DeepSeek announced that `deepseek-chat` and `deepseek-reasoner` would be fully retired after 2026-07-24 15:59 UTC.
  - Before that cutoff, those names routed to the non-thinking and thinking modes of `deepseek-v4-flash`.
  - The replacement IDs announced by DeepSeek were `deepseek-v4-pro` and `deepseek-v4-flash`.
- Cautions:
  - The retirement deadline is in the past as of this audit. It must not be described as an upcoming event.
  - This is a historical release notice, not proof that a legacy alias still works after the cutoff.
  - Marketing benchmark claims on this page are self-reported and should not be treated as application-level evaluation evidence.

### DS-04: Change Log

- URL: https://api-docs.deepseek.com/updates/
- Publisher: DeepSeek
- Checked: 2026-07-27 UTC
- Supports:
  - The 2026-04-24 entry introduced V4 Pro and V4 Flash for OpenAI Chat Completions and the Anthropic interface.
  - The entry records the planned discontinuation of the two legacy aliases on 2026-07-24.
- Cautions:
  - The wording is a historical announcement written before the deadline. The rewrite must use past tense and should use current model discovery for present availability.

### DS-05: Create Chat Completion API Reference

- URL: https://api-docs.deepseek.com/api/create-chat-completion/
- Publisher: DeepSeek
- Checked: 2026-07-27 UTC
- Supports:
  - The accepted model enum is `deepseek-v4-flash` or `deepseek-v4-pro`.
  - `thinking.type` accepts `enabled` or `disabled` and defaults to `enabled`.
  - `reasoning_effort` supports `high` and `max`; compatibility mappings are documented for other effort labels.
  - `response_format={"type":"json_object"}` enables JSON Output, but the prompt must explicitly request JSON.
  - Streaming uses SSE and can include terminal usage when `stream_options.include_usage` is enabled.
  - The documented finish reasons include `stop`, `length`, `content_filter`, `tool_calls`, and `insufficient_system_resource`.
  - Tool-call arguments are model-generated JSON strings and may be invalid or contain hallucinated parameters; the application must validate them.
  - The response schema documents `model`, `system_fingerprint`, prompt tokens, completion tokens, cache-hit tokens, cache-miss tokens, total tokens, and reasoning tokens.
  - `frequency_penalty` and `presence_penalty` are deprecated and have no effect.
  - `user_id` must not contain private information.
- Cautions:
  - Record the mode, model, prompt version, tool schema version, and returned fingerprint when available. A model name alone is not a complete run identity.
  - Do not log raw request IDs, tool-call IDs, user content, retrieved documents, or reasoning text in a public artifact.
  - Examples in the reference are illustrative; response fields should be checked against the actual live response.

### DS-06: JSON Output

- URL: https://api-docs.deepseek.com/guides/json_mode/
- Publisher: DeepSeek
- Checked: 2026-07-27 UTC
- Supports:
  - JSON Output requires the `json_object` response format.
  - The prompt should include the word `json` and an example of the required structure.
  - `max_tokens` must be high enough to avoid truncating the JSON.
  - The API may occasionally return empty content.
- Cautions:
  - A pass must require non-empty content, an acceptable finish reason, successful parsing, exact required keys, no forbidden extra keys, and type/schema validation.
  - "Valid JSON" is not the same as factually correct or schema-correct output.

### DS-07: Tool Calls

- URL: https://api-docs.deepseek.com/guides/tool_calls/
- Publisher: DeepSeek
- Checked: 2026-07-27 UTC
- Supports:
  - The application, not the model, supplies and executes tool functionality.
  - Thinking and non-thinking modes support tool calls.
  - Strict mode is Beta, requires `https://api.deepseek.com/beta`, and requires every function to use `strict: true`.
  - Strict mode supports a constrained JSON Schema subset. All properties of an object must be required, and `additionalProperties` must be `false`.
- Cautions:
  - Non-strict tool arguments still need application-side JSON parsing, allowlisting, schema checks, authorization, and safe execution controls.
  - Even strict schema conformance does not prove correct tool selection, correct values, safe side effects, or task success.
  - The evaluation harness should never execute a destructive tool during a public reproducibility run.

### DS-08: Thinking Mode

- URL: https://api-docs.deepseek.com/guides/thinking_mode/
- Publisher: DeepSeek
- Checked: 2026-07-27 UTC
- Supports:
  - Thinking mode defaults to enabled.
  - The API returns reasoning in `reasoning_content`, alongside final `content`.
  - In thinking mode, `temperature`, `top_p`, `presence_penalty`, and `frequency_penalty` do not take effect.
  - When a thinking-mode turn performs tool calls, its `reasoning_content` must be passed back in subsequent requests; omitting it can produce HTTP 400.
  - For ordinary multi-turn exchanges without tool calls, previous reasoning content does not need to be returned.
- Cautions:
  - `reasoning_content` is provider-returned chain-of-thought data; it is inaccurate to call it "hidden reasoning."
  - Score the final user-visible answer and tool outcomes. Treat raw reasoning text as sensitive operational data and omit it from public fixtures and screenshots.
  - A sampling A/B test is invalid if it varies parameters that the selected thinking mode ignores.

### DS-09: Context Caching

- URL: https://api-docs.deepseek.com/guides/kv_cache/
- Publisher: DeepSeek
- Checked: 2026-07-27 UTC
- Supports:
  - Disk context caching is enabled by default.
  - Cache matching is prefix-based.
  - `prompt_cache_hit_tokens` and `prompt_cache_miss_tokens` report cache behavior.
  - Cache behavior is best-effort and does not guarantee a hit.
  - The output is still generated; caching does not make the output deterministic.
  - Cache construction takes time, and cached material is cleared after it is no longer used.
- Cautions:
  - A cache test should use an identical persisted prefix and report observed hit and miss tokens rather than claiming a guaranteed hit.
  - Cache-hit cost must be calculated separately from cache-miss input and output cost.

### DS-10: Rate Limit and Isolation

- URL: https://api-docs.deepseek.com/quick_start/rate_limit/
- Publisher: DeepSeek
- Checked: 2026-07-27 UTC
- Supports:
  - The documented limits are account-level concurrency limits: 500 for Pro and 2,500 for Flash.
  - All API keys under an account share the account limit.
  - Exceeding the concurrency limit produces HTTP 429.
  - `user_id` can provide content-safety, KV-cache, and scheduling isolation, but regular users still share the account concurrency calculation.
  - `user_id` must match the documented character set and must not include private user information.
  - Requests can receive keep-alive empty lines or SSE comments, and a request that has not started inference after ten minutes is closed.
- Cautions:
  - Do not restate these concurrency numbers as RPM or TPM limits.
  - Evaluation concurrency, retry count, timeout, and backoff policy must be recorded because they affect reliability and latency results.

### DS-11: Error Codes

- URL: https://api-docs.deepseek.com/quick_start/error_codes/
- Publisher: DeepSeek
- Checked: 2026-07-27 UTC
- Supports:
  - The documented classes are 400 invalid format, 401 authentication failure, 402 insufficient balance, 422 invalid parameters, 429 rate limit, 500 server error, and 503 overloaded.
- Cautions:
  - Error bodies and the exact status for a particular malformed request must be observed in the live run; the overview table is not a complete error contract.
  - A public test should use a safe invalid-model or invalid-parameter case. It should not expose a key, force an insufficient-balance event, or create load to provoke 429/503.

### DS-12: Token and Token Usage

- URL: https://api-docs.deepseek.com/quick_start/token_usage/
- Publisher: DeepSeek
- Checked: 2026-07-27 UTC
- Supports:
  - Billing uses tokens.
  - Character-to-token ratios are approximate.
  - The response usage fields are the authoritative count for a request.
- Cautions:
  - Never calculate final cost from character estimates when the API returned usage.
  - Store aggregated usage in public results, not raw prompts or responses.

### DS-13: Multi-round Conversation

- URL: https://api-docs.deepseek.com/guides/multi_round_chat/
- Publisher: DeepSeek
- Checked: 2026-07-27 UTC
- Supports:
  - `/chat/completions` is stateless.
  - The caller must send the conversation history needed for each turn.
- Cautions:
  - A multi-turn evaluation case must version and store the exact message sequence used.
  - Do not describe server-side chat memory as part of the hosted API behavior.

## Primary Evaluation-Method Sources

### EV-01: OpenAI Evaluation Best Practices

- URL: https://developers.openai.com/api/docs/guides/evaluation-best-practices
- Publisher: OpenAI
- Checked: 2026-07-27 UTC
- Supports:
  - Evals should be task-specific structured tests, not "vibe-based" review.
  - A practical process defines the objective, collects a representative dataset, defines metrics, runs comparisons, and evaluates continuously.
  - Test data should include typical, edge, and adversarial cases.
  - Automated scoring should be calibrated against human feedback.
  - Pairwise comparisons, classification, and pass/fail judgments are generally easier for model judges than unconstrained open-ended grading.
- Cautions:
  - OpenAI-specific model recommendations and hosted-product instructions are not DeepSeek facts.
  - Example thresholds in this guide are examples for the stated task, not universal release standards.
  - The hosted OpenAI Evals platform is deprecated; use this page for methodology, not as a long-term DeepSeek dependency.

### EV-02: OpenAI Graders

- URL: https://developers.openai.com/api/docs/guides/graders
- Publisher: OpenAI
- Checked: 2026-07-27 UTC
- Supports:
  - Deterministic and model-based graders serve different purposes.
  - Model graders can return scores or labels.
  - Grader or reward hacking can be detected by comparing automated grader results with expert human evaluation.
- Cautions:
  - The API examples and grader types are OpenAI platform features, not features of the DeepSeek API.
  - The transferable lesson is to calibrate and audit judges; do not imply that a DeepSeek evaluation requires OpenAI.

### EV-03: OpenAI Evals Documentation and Deprecation

- URLs:
  - https://developers.openai.com/api/docs/guides/evals
  - https://developers.openai.com/api/docs/deprecations
- Publisher: OpenAI
- Checked: 2026-07-27 UTC
- Supports:
  - The Evals workflow describes a task, runs it on test inputs, analyzes the results, and iterates.
  - OpenAI announced deprecation of the hosted Evals platform on 2026-06-03.
  - Existing evals are scheduled to become read-only on 2026-10-31, and the dashboard/API are scheduled to shut down on 2026-11-30.
- Cautions:
  - Do not make the rewritten DeepSeek guide depend on the hosted OpenAI Evals platform.
  - If OpenAI guidance is cited, cite the methodology and disclose the platform timeline.

### EV-04: OpenAI Evals Open-source Repository

- URL: https://github.com/openai/evals
- Publisher: OpenAI
- Checked: 2026-07-27 UTC
- Supports:
  - The repository is a first-party implementation reference for custom datasets, basic deterministic matchers, model-graded evaluations, and reusable eval definitions.
- Cautions:
  - It is not a DeepSeek integration guarantee.
  - Its examples and dependencies may change independently from the DeepSeek API.
  - Use it as a design reference only unless the exact current version is installed and tested.

### EV-05: NIST AI RMF Core, Measure Function

- URL: https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
- Publisher: NIST AI Resource Center
- Checked: 2026-07-27 UTC
- Supports:
  - Test before deployment and regularly during operation.
  - Document test sets, metrics, tools, methods, uncertainty, and results.
  - Evaluate under conditions similar to the deployment setting.
  - Involve independent assessors, domain experts, users, and affected parties according to organizational risk tolerance.
  - Monitor system components in production and reassess metric effectiveness.
- Cautions:
  - The AI RMF is voluntary, risk-based guidance, not a DeepSeek-specific certification or a universal numerical scorecard.
  - Human-subject evaluations may create legal, ethical, and representativeness obligations that synthetic fixture tests do not.

### EV-06: NIST Generative AI Profile

- URL: https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence
- DOI: https://doi.org/10.6028/NIST.AI.600-1
- Publisher: NIST
- Checked: 2026-07-27 UTC
- Supports:
  - NIST AI 600-1 is a cross-sectoral, voluntary companion to AI RMF 1.0 for generative AI risk management across design, development, use, and evaluation.
- Cautions:
  - It supplies risk-management context, not DeepSeek API behavior and not fixed pass/fail thresholds.

### EV-07: CAISI Evaluation of DeepSeek V4 Pro

- URL: https://www.nist.gov/news-events/news/2026/05/caisi-evaluation-deepseek-v4-pro
- Publisher: NIST / Center for AI Standards and Innovation
- Released: 2026-05-01; updated 2026-05-02
- Checked: 2026-07-27 UTC
- Supports:
  - CAISI evaluated the open-weight DeepSeek V4 Pro model in April 2026.
  - CAISI reported that it was the most capable PRC model CAISI had evaluated at that time across the tested domains.
  - CAISI's aggregate IRT-style analysis estimated an approximately eight-month capability lag relative to the leading U.S. frontier.
  - CAISI reported lower end-to-end cost than GPT-5.4 mini on five of seven included cost comparisons, with a range from 53 percent less expensive to 41 percent more expensive.
  - The detailed capability table covers nine benchmarks across cyber, software engineering, natural sciences, abstract reasoning, and mathematics.
  - CAISI served the open-weight model on cloud H200 and B200 GPUs and used developer-recommended settings.
- Cautions:
  - This was an evaluation of an open-weight deployment, not a test of the hosted `api.deepseek.com` service.
  - The "eight months" statement is an aggregate result from CAISI's selected benchmarks and IRT-inspired methodology. It is not a claim about every task or application.
  - Some benchmarks were non-public, one cyber score was imputed, and CAISI used its own agent scaffold and token budgets.
  - The cost comparison used then-reported V4 Pro prices of $1.74 uncached input, $0.0145 cached input, and $3.48 output per 1M tokens. Those are not the current July 27 API prices.
  - This source does not validate a site's RAG pipeline, prompts, JSON schema, tool execution, safety policy, latency, or production reliability.

## Editorial Source Rules for the Rewrite

1. Use DeepSeek sources for every DeepSeek model, parameter, price, limit, feature, and error claim.
2. Label the proposed "DeepSeek Evaluation Framework" as an application-authored testing pattern, not an official DeepSeek product.
3. Separate:
   - official API behavior,
   - dated live observations,
   - local editorial recommendations,
   - third-party or government benchmark context.
4. Date all live measurements and all price calculations.
5. Never call a single run a benchmark or SLA.
6. Do not publish credentials, balances, request IDs, tool-call IDs, raw user content, raw retrieved documents, or raw `reasoning_content`.
7. Use current model IDs in runnable examples. Mention legacy aliases only in a short historical migration note written in past tense.
8. Present release thresholds as project-specific examples that require calibration, never as DeepSeek, OpenAI, or NIST standards.
