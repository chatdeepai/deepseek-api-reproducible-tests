# Factual Delta for the Existing DeepSeek Evaluation Framework Page

Checked: 2026-07-27 UTC

Existing page audited: https://chat-deep.ai/docs/deepseek-evaluation-framework/

This file identifies claims and implementation patterns that must change before the page can be treated as current, source-led, and reproducible.

## Blocking Corrections

### 1. The legacy-alias deadline is no longer in the future

- Existing treatment: The introduction and later integration note say `deepseek-chat` and `deepseek-reasoner` are "scheduled" to retire after 2026-07-24 15:59 UTC.
- Verdict: Stale on 2026-07-27.
- Required correction:
  - Use `deepseek-v4-flash` and `deepseek-v4-pro` in all runnable examples and fixtures.
  - If the aliases are mentioned, write that DeepSeek scheduled them for retirement at 2026-07-24 15:59 UTC and that the deadline has passed.
  - Do not claim current alias behavior without a dated live request.
- Primary evidence:
  - https://api-docs.deepseek.com/news/news260424/
  - https://api-docs.deepseek.com/updates/
  - https://api-docs.deepseek.com/quick_start/pricing/
  - https://api-docs.deepseek.com/api/list-models/

### 2. "As of June 2026" is an obsolete freshness marker

- Existing treatment: The page anchors current model availability to June 2026.
- Verdict: Stale.
- Required correction:
  - Replace it with a clearly dated source audit and live preflight: 2026-07-27 UTC.
  - Record the result of `GET /models` in the reproducibility package.
- Primary evidence:
  - https://api-docs.deepseek.com/api/list-models/

### 3. `reasoning_content` is returned, not hidden

- Existing treatment: The implementation section calls it "hidden reasoning."
- Verdict: Inaccurate terminology.
- Required correction:
  - Describe it as provider-returned chain-of-thought data in the `reasoning_content` field.
  - Evaluate final `content`, reasoning token count, and required field-handling behavior.
  - Do not publish or persist raw reasoning text in public results.
- Primary evidence:
  - https://api-docs.deepseek.com/guides/thinking_mode/
  - https://api-docs.deepseek.com/api/create-chat-completion/

### 4. The CAISI result needs deployment and methodology qualifiers

- Existing treatment: The page presents CAISI's V4 Pro finding as broad independent model context.
- Verdict: The core claim exists, but the current wording is too easy to read as a hosted-API or universal-capability result.
- Required correction:
  - State that CAISI evaluated the open-weight model in April 2026, served on cloud H200 and B200 GPUs.
  - State that the approximately eight-month lag is an aggregate IRT-inspired estimate across CAISI's benchmark design, not a claim about every task.
  - State that the detailed table covered nine benchmarks across five domains and that the aggregate figure used a wider model/benchmark set.
  - Do not use this result to validate the site's own application.
- Primary evidence:
  - https://www.nist.gov/news-events/news/2026/05/caisi-evaluation-deepseek-v4-pro

### 5. The CAISI cost finding is historical, not a current price comparison

- Existing treatment: The page says CAISI reported strong cost efficiency, without noting the price basis.
- Verdict: Incomplete and potentially misleading after DeepSeek price changes.
- Required correction:
  - Tie the finding to CAISI's selected benchmarks and May 2026 assumptions.
  - Note that CAISI used V4 Pro prices of $1.74 uncached input, $0.0145 cached input, and $3.48 output per 1M tokens.
  - For the article's own cost calculations, use the current July 27 official prices: $0.435 uncached input, $0.003625 cached input, and $0.87 output per 1M tokens for Pro.
  - Never combine a historical benchmark's token usage with current prices without explicitly labeling the counterfactual calculation.
- Primary evidence:
  - https://www.nist.gov/news-events/news/2026/05/caisi-evaluation-deepseek-v4-pro
  - https://api-docs.deepseek.com/quick_start/pricing/

## Major Technical Corrections

### 6. The JSON example does not enforce an exact schema

- Existing treatment:
  - The prose says the output should use exactly three keys.
  - The Python code checks missing keys but does not reject extra keys.
  - The shown JSON Schema does not set `additionalProperties` to `false`.
- Verdict: The code and claim do not match.
- Required correction:
  - Require non-empty output.
  - Reject `finish_reason="length"` for a complete structured result.
  - Parse JSON.
  - Require the exact key set, not only a subset.
  - Validate types and set `additionalProperties: false`.
  - Add a fixture proving that an extra key fails.
- Primary evidence:
  - https://api-docs.deepseek.com/guides/json_mode/
  - https://api-docs.deepseek.com/api/create-chat-completion/

### 7. JSON validity, schema validity, and factual quality must be separate results

- Existing treatment: The page discusses these dimensions, but the implementation can make a successful parse look like a broadly successful case.
- Verdict: Needs stricter result taxonomy.
- Required correction:
  - Report at least `nonempty`, `finish_reason_ok`, `json_parse`, `schema_exact`, `citation_ids_valid`, `claims_supported`, and `task_success` separately.
  - Do not roll them into a single "JSON passed" label.
- Primary evidence:
  - https://api-docs.deepseek.com/guides/json_mode/
  - https://developers.openai.com/api/docs/guides/evaluation-best-practices

### 8. Thinking mode changes which parameters are meaningful

- Existing treatment: The page says behavior depends on settings, but it does not clearly gate sampling tests by mode.
- Verdict: Incomplete.
- Required correction:
  - Record `thinking.type` on every case.
  - State that thinking defaults to enabled.
  - Do not treat changes in `temperature`, `top_p`, `presence_penalty`, or `frequency_penalty` as valid experimental variables in thinking mode because those settings have no effect there.
  - Note that `presence_penalty` and `frequency_penalty` are also deprecated in the current Chat Completion reference.
- Primary evidence:
  - https://api-docs.deepseek.com/guides/thinking_mode/
  - https://api-docs.deepseek.com/api/create-chat-completion/

### 9. Thinking-mode tool turns need a protocol test

- Existing treatment: The page recommends evaluating tools and reasoning, but it does not test the documented `reasoning_content` carry-forward rule.
- Verdict: Missing important DeepSeek-specific behavior.
- Required correction:
  - Add a safe, non-executing tool-call case in thinking mode.
  - Verify that a follow-up with the full assistant tool-call message, including `reasoning_content`, succeeds.
  - If testing the negative path, sanitize the 400 response and do not publish IDs or reasoning text.
- Primary evidence:
  - https://api-docs.deepseek.com/guides/thinking_mode/

### 10. Tool evaluation must distinguish schema conformance from safe execution

- Existing treatment: The page correctly says to evaluate tool selection and arguments, but the implementation is mostly conceptual.
- Verdict: Directionally correct but not experimentally sufficient.
- Required correction:
  - Test tool selection, allowlist membership, argument JSON parsing, exact schema, authorization policy, and side-effect policy as separate assertions.
  - Do not execute a real side-effecting function.
  - Label strict mode as Beta and note that it requires `/beta` plus DeepSeek's constrained JSON Schema rules.
- Primary evidence:
  - https://api-docs.deepseek.com/guides/tool_calls/
  - https://api-docs.deepseek.com/api/create-chat-completion/

### 11. Cache behavior should be measured, not assumed

- Existing treatment: Cost and performance are discussed without a concrete DeepSeek cache acceptance test.
- Verdict: Missing original evidence.
- Required correction:
  - Run a repeated-prefix pair.
  - Record `prompt_cache_hit_tokens` and `prompt_cache_miss_tokens`.
  - Calculate cache-hit and cache-miss input cost separately using the dated price table.
  - State that caching is best-effort and does not make output deterministic.
- Primary evidence:
  - https://api-docs.deepseek.com/guides/kv_cache/
  - https://api-docs.deepseek.com/quick_start/pricing/

### 12. Rate-limit terminology must use concurrency, not RPM/TPM

- Existing treatment: The page uses generic rate-limit language.
- Verdict: Too vague for a current DeepSeek implementation.
- Required correction:
  - State that the current official limits are account-level concurrency: 500 for Pro and 2,500 for Flash.
  - Record evaluation concurrency, retries, timeout, and backoff.
  - Do not present the concurrency numbers as RPM or TPM.
- Primary evidence:
  - https://api-docs.deepseek.com/quick_start/rate_limit/

### 13. Error handling needs a safe original case

- Existing treatment: Failures are discussed, but the article has no dated, privacy-safe error observation.
- Verdict: Missing original evidence.
- Required correction:
  - Add one safe invalid-model or invalid-parameter request.
  - Record the actual status, provider error type, and a sanitized message category.
  - Do not test with a bad key, publish an authentication response containing metadata, exhaust the account balance, or generate load to force 429/503.
- Primary evidence:
  - https://api-docs.deepseek.com/quick_start/error_codes/

### 14. Reproducibility metadata is incomplete without the returned backend fingerprint

- Existing treatment: The page recommends storing the model ID and prompt version.
- Verdict: Good but incomplete.
- Required correction:
  - Also store `system_fingerprint` when returned, plus mode, reasoning effort, tool schema version, dataset version, timestamp, timeout, retry count, concurrency, and evaluator version.
  - Keep request IDs and tool-call IDs out of public artifacts.
- Primary evidence:
  - https://api-docs.deepseek.com/api/create-chat-completion/

### 15. Multi-turn cases must include the exact history sent

- Existing treatment: The dataset schema has a single `user_input` field.
- Verdict: Insufficient for multi-turn evaluation.
- Required correction:
  - Add a `messages` array or a versioned conversation fixture for multi-turn cases.
  - State that the DeepSeek Chat Completions API is stateless and the caller sends the relevant history.
- Primary evidence:
  - https://api-docs.deepseek.com/guides/multi_round_chat/

## Methodology and Editorial Corrections

### 16. "DeepSeek Evaluation Framework" is not an official product name

- Existing treatment: The title-case phrase can be read as a named DeepSeek offering.
- Verdict: Needs an explicit editorial definition.
- Required correction:
  - Define it as this site's application-authored testing pattern for systems that call the DeepSeek API.
  - Do not imply that DeepSeek ships an evaluation SDK, hosted eval platform, golden-dataset format, hallucination metric, or release-gate standard.
- Primary evidence:
  - The audited DeepSeek API documentation describes API features, not the article's proposed framework:
    - https://api-docs.deepseek.com/

### 17. Numerical release gates are local examples, not standards

- Existing treatment: The "Recommended Scorecard and Release Gates" table includes exact percentages such as 99.9 percent JSON validity and 98 percent human approval.
- Verdict: Unsupported as universal thresholds.
- Required correction:
  - Label every number as an illustrative local policy.
  - Derive production thresholds from risk tolerance, deployment harm, baseline variance, sample size, confidence intervals, and human calibration.
  - Prefer paired comparison against the current production baseline in addition to absolute gates.
- Primary evidence:
  - https://developers.openai.com/api/docs/guides/evaluation-best-practices
  - https://airc.nist.gov/airmf-resources/airmf/5-sec-core/

### 18. Dataset-size guidance is not a universal rule

- Existing treatment: The page recommends 20-50 cases per critical workflow and growth toward hundreds or thousands.
- Verdict: Reasonable editorial advice, but not an official DeepSeek or NIST requirement.
- Required correction:
  - Present this only as a suggested starting point.
  - Emphasize coverage of deployment distribution, known failures, edge cases, and adversarial cases over an arbitrary count.
  - Publish the actual case count and limitations of this article's test set.
- Primary evidence:
  - https://developers.openai.com/api/docs/guides/evaluation-best-practices
  - https://airc.nist.gov/airmf-resources/airmf/5-sec-core/

### 19. The 0-5 hallucination rubric is an editorial rubric

- Existing treatment: The rubric is useful but can look standardized.
- Verdict: Not an official DeepSeek, OpenAI, or NIST scale.
- Required correction:
  - Label it as a local claim-support severity rubric.
  - Define annotator instructions and examples.
  - Report inter-reviewer agreement or at least dual-review disagreements for subjective cases.
  - Keep faithfulness to supplied context separate from real-world factual correctness.
- Primary evidence:
  - https://developers.openai.com/api/docs/guides/evaluation-best-practices
  - https://developers.openai.com/api/docs/guides/graders
  - https://airc.nist.gov/airmf-resources/airmf/5-sec-core/

### 20. Human review is risk-based, not automatically a legal requirement

- Existing treatment: Some wording says human review "is required" whenever cost of error is high or answers are subjective.
- Verdict: Too categorical.
- Required correction:
  - Say the framework requires it as a local release policy for defined high-risk cases.
  - Distinguish that local policy from legal or regulatory requirements.
  - Use subject-matter experts and document calibration, disagreements, and escalation.
  - If real human-subject data is collected for research, assess the applicable protection and representativeness requirements.
- Primary evidence:
  - https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
  - https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence

### 21. LLM-as-a-judge results need calibration and anti-bias checks

- Existing treatment: The page warns about nondeterminism but uses model-graded metrics with fixed thresholds.
- Verdict: Needs a concrete calibration design.
- Required correction:
  - Compare model-judge labels with blinded human labels on a calibration subset.
  - Prefer pass/fail, classification, or pairwise comparisons with specific criteria.
  - Randomize answer order in pairwise tests to measure position bias.
  - Check for verbosity bias and judge or reward hacking.
  - Version the judge prompt and judge model.
- Primary evidence:
  - https://developers.openai.com/api/docs/guides/evaluation-best-practices
  - https://developers.openai.com/api/docs/guides/graders

### 22. The DeepEval code is third-party integration guidance, not original evidence

- Existing treatment: A "DeepEval-style" implementation occupies a central part of the article and uses fixed thresholds.
- Verdict: Useful as an optional example, but not sufficient for this rewrite's source and originality standard.
- Required correction:
  - Make the privacy-safe local deterministic harness the primary reproducible implementation.
  - Keep any DeepEval section optional and clearly versioned.
  - Do not claim that an integration works with current DeepSeek IDs unless the exact installed version is tested.
  - Do not rely on a third-party metric name as proof of factual quality.
- Primary evidence:
  - DeepSeek behavior must come from https://api-docs.deepseek.com/
  - General method may be supported by https://developers.openai.com/api/docs/guides/evaluation-best-practices

### 23. Do not introduce a dependency on the hosted OpenAI Evals platform

- Existing treatment: The current page does not depend on OpenAI Evals, but a rewrite based on primary eval guidance could accidentally do so.
- Verdict: Guardrail for the rewrite.
- Required correction:
  - Use OpenAI's evaluation pages only for transferable design principles.
  - If the open-source `openai/evals` repository is mentioned, label it as an optional implementation reference.
  - Disclose that the hosted OpenAI Evals platform is scheduled to become read-only on 2026-10-31 and shut down on 2026-11-30.
- Primary evidence:
  - https://developers.openai.com/api/docs/deprecations
  - https://developers.openai.com/api/docs/guides/evals
  - https://github.com/openai/evals

### 24. A single successful run is not a benchmark

- Existing treatment: The page is conceptual and does not yet distinguish one dated live observation from a benchmark.
- Verdict: Needs an explicit evidence rule before original tests are added.
- Required correction:
  - Call small runs "dated live observations" or "acceptance tests."
  - For variable outputs, run repeated trials or paired variants and disclose sample size.
  - Do not publish latency as an SLA.
  - Record failures as well as successes.
- Primary evidence:
  - https://developers.openai.com/api/docs/guides/evaluation-best-practices
  - https://airc.nist.gov/airmf-resources/airmf/5-sec-core/

## Required Current API Facts for the Rewrite

Use this dated snapshot only with the label "checked 2026-07-27 UTC":

| Item | Current documented value |
| --- | --- |
| Model IDs | `deepseek-v4-flash`, `deepseek-v4-pro` |
| Context | 1M tokens |
| Maximum output | 384K tokens |
| Default mode | Thinking enabled |
| Thinking effort | `high` or `max` |
| Flash price per 1M | $0.0028 hit input, $0.14 miss input, $0.28 output |
| Pro price per 1M | $0.003625 hit input, $0.435 miss input, $0.87 output |
| Account concurrency | Flash 2,500; Pro 500 |
| Cache | Enabled by default, prefix-based, best-effort |
| Cache telemetry | `prompt_cache_hit_tokens`, `prompt_cache_miss_tokens` |
| Reasoning telemetry | `reasoning_content`, `completion_tokens_details.reasoning_tokens` |
| Backend identity | `system_fingerprint` when returned |
| Structured output warning | Empty content and truncation still need handling |
| Tool strict mode | Beta, `/beta`, constrained JSON Schema |
| Legacy alias deadline | Passed: 2026-07-24 15:59 UTC |

Primary sources:

- https://api-docs.deepseek.com/quick_start/pricing/
- https://api-docs.deepseek.com/api/list-models/
- https://api-docs.deepseek.com/api/create-chat-completion/
- https://api-docs.deepseek.com/guides/json_mode/
- https://api-docs.deepseek.com/guides/tool_calls/
- https://api-docs.deepseek.com/guides/thinking_mode/
- https://api-docs.deepseek.com/guides/kv_cache/
- https://api-docs.deepseek.com/quick_start/rate_limit/

## Minimum Original Evidence the New Page Should Add

1. A dated `GET /models` preflight.
2. A deterministic plain-text case with exact expected output.
3. A JSON case with non-empty, parse, exact-schema, and factual assertions.
4. A safe non-executing tool-selection and argument-validation case.
5. A thinking-mode case that reports reasoning tokens without storing reasoning text.
6. A repeated-prefix cache case with hit/miss tokens and cost math.
7. A safe invalid-model or invalid-parameter case with a sanitized error.
8. A repeated or paired case showing output variability and the stated sample size.
9. A privacy audit proving no key, balance, request ID, tool-call ID, raw personal data, raw document content, or raw reasoning content is present.
10. A fully local offline replay with frozen sanitized fixtures and deterministic tests.

## Recommended Claim Labels in the Final Article

- **Official documentation:** A current DeepSeek API fact linked to an official page.
- **Live observation:** A dated result from this site's controlled run, with sample size and configuration.
- **Local policy:** A release gate, rubric, or threshold chosen for the example application.
- **External benchmark context:** A precisely scoped CAISI or other primary evaluation result that does not validate this application.
- **Limitation:** Anything not tested, not observable, or not supported by the current source set.
