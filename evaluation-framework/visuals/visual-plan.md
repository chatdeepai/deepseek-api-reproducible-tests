# DeepSeek Evaluation Framework: Original Visual Plan

Research date: 2026-07-27
Target page: https://chat-deep.ai/docs/deepseek-evaluation-framework/
Status: Production plan only. No image, article, or WordPress change is authorized by this file.

## Global Production Rules

- Produce exactly eight original visuals.
- Export each visual as a 1600 x 900 PNG plus an editable SVG.
- Use English-only visible text, filenames, metadata, alt text, and captions.
- Use one consistent Chat-Deep.ai visual system across the set.
- Keep all labels legible at article width; avoid dense paragraphs inside images.
- Add an SVG `<title>` and `<desc>` to every editable source.
- Pair color with text or shape so meaning never depends on color alone.
- Do not imitate a vendor dashboard or create a fake product screenshot.
- Do not show API keys, prompts, raw outputs, reasoning content, tool payloads, provider IDs, private trace IDs, account data, or local paths.
- Visuals 01-07 are conceptual and must include this footer: `Conceptual evaluation diagram | no live-result claims`.
- Visual 08 is live evidence and must render only from a sanitized live summary plus a passing privacy audit.
- If either live evidence file is missing, malformed, incomplete, or fails privacy checks, Visual 08 must not exist.
- All numeric claims in Visual 08 must be read from the final sanitized evidence file. Never hardcode expected results.
- The live caption must give the exact UTC study date and state that the results are bounded observations, not a general benchmark or SLA.

## Visual 01

**Filename:** `01-deepseek-evaluation-system-architecture`
**Evidence class:** CONCEPTUAL
**Placement:** After `DeepSeek Evaluation Framework: Quick Answer`

**Purpose**

Show the full application-evaluation loop in one view:

`task contract -> golden dataset -> frozen run -> scorers -> human review -> release gate -> production monitoring -> reviewed failures back to dataset`

**Required content**

- Development/offline lane.
- Release-decision boundary.
- Production/online lane.
- Feedback arrow from reviewed production failures to a new dataset version.
- Separate labels for deterministic, model-based, human, and operational evidence.
- A clear note that a public model benchmark is an input to model selection, not a release gate for the application.

**Alt text**

`DeepSeek application evaluation architecture connecting task contracts, golden datasets, frozen runs, automated scorers, human review, release gates, production monitoring, and regression feedback`

**Caption**

`Conceptual evaluation lifecycle. Public model benchmarks can help select candidates, but application evidence determines whether a release is safe to ship. No live-result claims.`

## Visual 02

**Filename:** `02-golden-dataset-anatomy-and-splits`
**Evidence class:** CONCEPTUAL
**Placement:** After `Build and Version a Golden Dataset`

**Purpose**

Make a high-quality golden case and the dataset-governance boundaries visually obvious.

**Required content**

- One example case card with:
  - stable case ID;
  - task and risk tier;
  - input;
  - reference context;
  - expected output or rubric;
  - expected tool trace;
  - required and prohibited claims;
  - case-level thresholds;
  - provenance and reviewer;
  - dataset version.
- Three dataset partitions:
  - development;
  - regression;
  - blind holdout.
- Leakage barrier between prompt examples and blind holdout.
- Deduplication, redaction, stale-source review, and version-freeze gates.

**Alt text**

`Anatomy of a versioned DeepSeek golden evaluation case with development, regression, and blind holdout splits plus leakage, privacy, and deduplication controls`

**Caption**

`Conceptual dataset design. A larger dataset is not automatically better; provenance, risk coverage, leakage control, and stable versions make results interpretable. No live-result claims.`

## Visual 03

**Filename:** `03-deepseek-evaluator-ownership-matrix`
**Evidence class:** CONCEPTUAL
**Placement:** After `Choose Deterministic, Model-Based, Human, and Operational Metrics`

**Purpose**

Prevent evaluator-produced estimates from being presented as provider facts.

**Required content**

Four columns:

1. Provider-returned:
   - model;
   - finish reason;
   - token usage;
   - cache hit and miss tokens.
2. Application-measured:
   - latency milestones;
   - timeout;
   - retry and cancellation state;
   - tool execution outcome.
3. Evaluator-produced:
   - exact match;
   - schema result;
   - faithfulness;
   - pairwise preference;
   - hallucination classification.
4. Human or reconciled:
   - reviewer label;
   - disagreement resolution;
   - billing reconciliation;
   - release decision.

Every column must show source, unit, owner, and whether the value is measured, derived, or judged.

**Alt text**

`Ownership matrix for DeepSeek provider fields, application measurements, evaluator scores, human labels, and reconciled release evidence`

**Caption**

`Conceptual signal taxonomy. Record who produced each value and how it was derived before combining it in a scorecard. No live-result claims.`

## Visual 04

**Filename:** `04-hallucination-faithfulness-decision-tree`
**Evidence class:** CONCEPTUAL
**Placement:** After `Measure Hallucination, Faithfulness, Factuality, and Groundedness`

**Purpose**

Clarify four terms that searchers and evaluation tools often conflate.

**Required content**

Decision path for one material claim:

1. Is the claim supported by supplied context?
2. Does it contradict supplied context?
3. Is authoritative external ground truth available?
4. Is the task expected to abstain when evidence is missing?

Outcome labels:

- faithful and factual;
- faithful to stale or incorrect context;
- factual but unfaithful to supplied context;
- unsupported;
- contradictory;
- correct abstention;
- failed abstention.

Show deterministic evidence checks before judge scoring and human escalation for ambiguous or high-risk claims.

**Alt text**

`Decision tree separating DeepSeek output faithfulness, factuality, groundedness, unsupported claims, contradictions, and correct abstention`

**Caption**

`Conceptual claim-level classification. Hallucination, faithfulness, factuality, and groundedness answer different questions and should not be collapsed into one universal score. No live-result claims.`

## Visual 05

**Filename:** `05-deepseek-rag-evaluation-two-stage-pipeline`
**Evidence class:** CONCEPTUAL
**Placement:** After `Evaluate DeepSeek RAG Pipelines`

**Purpose**

Show why RAG retrieval and answer generation require separate metrics.

**Required content**

Retriever lane:

- question;
- candidate corpus;
- retrieved and ranked chunks;
- coverage;
- contextual recall;
- contextual precision;
- stale and distractor detection.

Generator lane:

- selected context;
- DeepSeek response;
- claim extraction;
- citation support;
- faithfulness;
- factuality;
- answer relevance;
- abstention.

Failure examples:

- good answer from bad retrieval by using prior knowledge;
- faithful answer from stale context;
- correct retrieval with unsupported answer;
- insufficient context with correct abstention.

**Alt text**

`Two-stage DeepSeek RAG evaluation pipeline separating retriever coverage and ranking from generator faithfulness, citations, factuality, relevance, and abstention`

**Caption**

`Conceptual RAG evaluation map. Score retrieval and generation separately so one stage cannot hide the other's failure. No live-result claims.`

## Visual 06

**Filename:** `06-deepseek-agent-tool-evaluation-trace`
**Evidence class:** CONCEPTUAL
**Placement:** After `Evaluate DeepSeek Agents and Tool Calls`

**Purpose**

Show that the final answer alone cannot prove agent correctness.

**Required content**

Aligned trace lanes:

- user intent;
- DeepSeek model proposal;
- argument parsing;
- schema validation;
- authorization and policy;
- stubbed tool execution;
- tool result;
- continuation call;
- final answer;
- evaluator and reviewer outcome.

Mark these critical boundaries:

- model proposal does not execute the tool;
- side effects remain application-owned;
- public evaluation uses synthetic or stubbed tools;
- invalid or unauthorized proposals stop before execution.

**Alt text**

`DeepSeek agent evaluation trace covering model proposal, argument validation, authorization, stubbed tool execution, continuation, final answer, and reviewer outcome`

**Caption**

`Conceptual agent trace. The application owns validation, authorization, execution, and side-effect safety; the model only proposes tool calls. No live-result claims.`

## Visual 07

**Filename:** `07-ci-regression-and-release-gate`
**Evidence class:** CONCEPTUAL
**Placement:** After `Run Regression Tests in CI Without Duplicate or Unbounded Spend`

**Purpose**

Turn the article's release logic into a readable engineering gate.

**Required content**

Two-tier pipeline:

1. Every change:
   - schema and fixture tests;
   - scorer unit tests;
   - dataset validation;
   - no provider call.
2. Explicit bounded provider run:
   - frozen plan;
   - request reservation ledger;
   - request and cost cap;
   - bounded concurrency;
   - zero automatic retries;
   - sanitized evidence;
   - privacy audit.

Decision branches:

- critical known failure -> block;
- material segment regression -> block;
- judge disagreement -> human review;
- complete pass -> candidate release;
- missing or failed evidence -> no publication.

**Alt text**

`Two-tier DeepSeek evaluation CI pipeline with offline checks, bounded provider runs, request and cost caps, regression gates, human review, and fail-closed publication`

**Caption**

`Conceptual release gate. Offline checks run broadly; provider evaluation runs remain explicit, bounded, reproducible, privacy-audited, and fail closed. No live-result claims.`

## Visual 08

**Filename:** `08-deepseek-v4-live-evaluation-dashboard`
**Evidence class:** LIVE EVIDENCE, FAIL-CLOSED
**Placement:** Inside `Original DeepSeek V4 Evaluation Study: Method and Results`

**Purpose**

Present the final bounded study without overstating it as a general model benchmark.

**Allowed data sources**

- `results/live-summary.json`
- a passing `results/privacy-audit.json`
- optionally, a separate passing live-evidence audit if the harness produces one

**Required pre-render gates**

- both required files exist and parse;
- the study status is complete;
- the case count and case order match the frozen plan;
- provider requests do not exceed the cap;
- token totals reconcile from per-case usage;
- estimated cost reconciles to the dated price snapshot;
- expected error controls are classified correctly;
- no raw prompt, output, reasoning, provider ID, API key, account data, or local path is present;
- every privacy check passes;
- missing or failed gates remove any stale Visual 08 PNG and SVG.

**Recommended panels**

- study date and exact tested model IDs;
- planned and observed case count;
- model and mode matrix;
- deterministic contract results;
- RAG grounding and abstention results;
- tool-selection and schema results;
- run count and single-observation limitations;
- judge-vs-human agreement, only if human labels exist;
- prompt, completion, and total tokens;
- estimated cost from the dated official price snapshot;
- failed cases and release-gate outcome;
- privacy audit status;
- method strip with concurrency, retries, timeout, repetitions, and request cap.

Do not display:

- raw model text;
- raw reasoning;
- prompts or context;
- provider request IDs;
- private trace IDs;
- API keys;
- account balances;
- invented percentages or qualitative scores.

**Alt text**

`Sanitized DeepSeek V4 application evaluation dashboard showing the bounded case set, contract checks, RAG and tool results, run count and single-observation limitations, token usage, estimated cost, release decision, and privacy audit`

**Caption template**

`Sanitized live evidence from [exact UTC date]. Values are bounded observations from the frozen application test plan, not a general DeepSeek benchmark, reliability measurement, or SLA.`

## Visual QA Checklist

For every asset:

- PNG dimensions are exactly 1600 x 900.
- SVG opens as editable text and shapes.
- Filename and article placeholder match.
- Visible text is English-only.
- No text is clipped, overlapped, or too small at article width.
- Alt text describes the information, not the decoration.
- Caption states the correct evidence class.
- 01-07 contain no numeric live-result claims.
- 01-07 include the conceptual footer.
- 08 contains only values sourced from the sanitized result file.
- 08 cannot render when the privacy audit fails.
- A SHA-256 manifest covers every PNG and SVG.
- At minimum, Visuals 04, 07, and 08 receive full-size visual inspection.

## Source Boundaries for Visual Labels

DeepSeek-specific contract labels should be checked against:

- https://api-docs.deepseek.com/quick_start/pricing/
- https://api-docs.deepseek.com/api/list-models/
- https://api-docs.deepseek.com/api/create-chat-completion
- https://api-docs.deepseek.com/guides/json_mode
- https://api-docs.deepseek.com/guides/thinking_mode
- https://api-docs.deepseek.com/guides/tool_calls
- https://api-docs.deepseek.com/guides/kv_cache/
- https://api-docs.deepseek.com/quick_start/rate_limit/

Evaluation taxonomy and workflow labels can be checked against:

- https://deepeval.com/docs/evaluation-datasets
- https://deepeval.com/docs/metrics-faithfulness
- https://deepeval.com/docs/metrics-hallucination
- https://deepeval.com/docs/evaluation-unit-testing-in-ci-cd
- https://docs.langchain.com/langsmith/evaluation-concepts
- https://www.braintrust.dev/docs/evaluate
- https://www.braintrust.dev/docs/annotate/human-review
