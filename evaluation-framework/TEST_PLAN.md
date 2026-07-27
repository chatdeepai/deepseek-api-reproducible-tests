# Offline Evaluation Test Plan

Plan date: 2026-07-27
Offline status: complete
Live status: complete on 2026-07-27 UTC

## Objective

Verify that a DeepSeek evaluation pipeline can score deterministic contracts,
structured output, grounding, abstention, tool proposals, and final-answer
math correctness while keeping public evidence payload-free and statistically
honest.

## Synthetic golden dataset

The frozen dataset contains six task families:

1. exact token output;
2. JSON with required fields, enum, integer, and no extra properties;
3. grounded QA with two required facts from supplied context;
4. abstention when supplied context omits the requested fact;
5. one allowlisted tool proposal with validated arguments and no execution;
6. thinking-mode arithmetic scored only on the final answer.

## Candidate and baseline

- Baseline: `deepseek-v4-flash`
- Candidate: `deepseek-v4-pro`
- Pairs: 6
- Planned provider requests: 12
- Concurrency: 1
- Provider retries: 0
- Timeout: 30 seconds

The publication run was separately authorized and completed exactly as frozen.
The repository's default `npm run live` command remains fail-closed.

## Offline acceptance checks

- dataset and live-plan identities, order, and pair mapping validate;
- exact scoring is truly exact;
- JSON parsing and schema failures remain distinct;
- grounding requires all expected facts;
- abstention uses the frozen token;
- tool name, JSON arguments, schema, and non-execution state validate;
- math evaluation discards reasoning and compares only the final value;
- paired wins, losses, ties, pass-rate delta, and mean-score delta reconcile;
- Wilson intervals stay inside zero and one;
- small samples are labeled honestly;
- the paired sign test uses discordant pairs only;
- reviewer agreement and Cohen's kappa reconcile;
- judge disagreement routes uncertain or opposing decisions to human review;
- usage components reconcile before cost estimation;
- reasoning tokens are not double-counted;
- public evidence passes recursive privacy checks;
- the live command fails closed without touching a network.

## Public evidence boundary

Allowed:

- frozen synthetic prompts, questions, context, expected contracts, and tool
  declarations in the golden dataset;
- task and variant aliases;
- pass, fail, and review-routing states;
- validation booleans and bounded counts;
- aggregate scores and statistical intervals;
- token totals and dated cost estimates;
- reviewer agreement aggregates.

Forbidden:

- raw provider request or response bodies, generated answers, or hidden
  reasoning;
- provider-returned JSON, tool arguments, tool results, or call identifiers;
- provider request or response identifiers;
- credentials, headers, account data, or balances;
- reviewer personal data;
- raw errors, stack traces, or local paths;
- non-ASCII text or mojibake.

## Completed live observation

- Frozen plan SHA-256:
  `135c8d1b4682d88824d0cf4f9f9ad2e084480cdad08c9d9abd3155658033d1ed`
- Requests planned / attempted / completed: 12 / 12 / 12
- Concurrency: 1
- Automatic retries: 0
- Per-request timeout: 30 seconds
- Baseline: `deepseek-v4-flash`, 6/6 bounded contracts passed
- Candidate: `deepseek-v4-pro`, 6/6 bounded contracts passed
- Paired outcome: 0 wins, 0 losses, 6 ties
- Prompt / completion / total tokens: 1,476 / 367 / 1,843
- Dated estimated cost: `$0.000648060000`
- Privacy audit: passed, 0 issues
- Local verification: 69/69 tests passed
- Original frozen illustrative gate: candidate passed
- Post-run publication decision: human review required because the frozen
  sanitizer did not retain tool-call cardinality

These are bounded application observations, not a general model benchmark,
reliability measurement, or SLA. With only six cases per model, the Wilson 95%
interval for an observed 6/6 pass rate remains wide: 0.609657 to 1.000000.

The retained evidence confirms that every returned model ID and terminal state
matched the frozen request contract. It confirms that the first retained tool
proposal matched the intended tool and arguments, but it cannot prove there
was no additional proposal. The current harness fixes this for future runs by
requiring an exact model match, the expected `finish_reason`, and exactly one
tool proposal.

The synthetic response fixture exists only to exercise the offline scoring
code. It is not represented as provider evidence. No future provider output may
be copied into that fixture or a public result artifact.
