# DeepSeek Evaluation Framework Reproducibility Harness

This package is an offline-first, dependency-free Node.js reference for
evaluating DeepSeek V4 applications with synthetic data. It does not use an
API key, create an account dependency, call a paid endpoint, or retain model
payloads in publishable evidence.

Live status: complete on 2026-07-27 UTC.

## What the offline suite covers

- strict exact-output contracts;
- JSON parsing and a maintained schema subset;
- grounded question answering against supplied synthetic context;
- explicit abstention when the context lacks an answer;
- tool selection and argument validation without tool execution;
- thinking-mode math evaluation using final-answer correctness only;
- paired candidate-versus-baseline regression scoring;
- Wilson confidence intervals and honest small-sample labels;
- an exact paired sign test for discordant results;
- human-review calibration with multi-class Cohen's kappa;
- automated-judge disagreement routing;
- token and dated cost aggregation without balance claims;
- recursive privacy auditing of public result artifacts.

All fixtures are English, ASCII, synthetic, and safe for a public repository.
The frozen prompts, questions, and context in `golden-dataset.json` are
deliberately public evaluation inputs. They are not user data or captured
provider payloads.

## Requirements

- Node.js 20 or newer
- no external packages

## Run

```text
npm test
npm run offline
npm run hash-plan
```

If `npm` is unavailable but Node.js is installed, run:

```text
node --test tests/*.test.mjs
node source/offline-runner.mjs
node source/hash-plan-cli.mjs
```

The offline runner writes:

- `results/offline-summary.json`
- `results/human-calibration-summary.json`
- `results/privacy-audit.json`
- `results/live-plan-hash.json`

The public golden dataset retains its frozen synthetic inputs so another
researcher can reproduce the contracts. Result artifacts retain task aliases,
booleans, counts, scores, confidence intervals, token totals, estimated costs,
and review-routing outcomes. They do not retain raw provider requests or
outputs, generated text, hidden reasoning, tool payloads, provider identifiers,
credentials, headers, account data, raw errors, or local paths.

## Frozen live plan and completed observation

`fixtures/live-plan.json` defines twelve serial, zero-retry requests: six
synthetic task contracts evaluated once with `deepseek-v4-flash` as the
baseline and once with `deepseek-v4-pro` as the candidate. The six contracts
cover exact output, JSON/schema, grounded QA, abstention, tool selection, and
thinking-mode math. Its frozen SHA-256 digest is
`135c8d1b4682d88824d0cf4f9f9ad2e084480cdad08c9d9abd3155658033d1ed`.

The authorized run completed all 12 planned requests with concurrency one,
zero automatic retries, and a 30-second per-request timeout. Both model
variants passed all six bounded contracts; all six paired comparisons were
ties. The run used 1,843 total tokens and had a dated estimated cost of
`$0.000648060000`. This is a small application acceptance test, not a general
model benchmark, reliability measurement, or SLA.

A post-run evidence audit found that the frozen sanitizer retained the first
tool proposal but not the number of proposals. The original frozen gate
therefore recorded a pass, but the current publication decision is
`human_review_required`: the retained evidence cannot prove that no additional
tool proposal was returned. The current harness now gates every case on the
requested model identity and exact terminal state, and tool cases additionally
require exactly one proposal.

The temporary key was created for this run, revoked immediately afterward,
and never written to the repository. Public results retain no provider output,
reasoning text, provider identifiers, headers, account data, or raw errors.

Published live artifacts:

- `results/live-summary.json`
- `results/live-privacy-audit.json`
- `results/live-run-ledger.json`

`npm run live` remains fail-closed. The reviewed `source/live-adapter.mjs`
requires an in-memory key, refuses duplicate run artifacts, reserves the full
request budget before the first call, and never returns or persists provider
payload text.

`npm run hash-plan` validates the frozen plan, canonicalizes it, calculates a
SHA-256 digest, prints the digest, and writes the same value to
`results/live-plan-hash.json`. This makes later plan drift detectable without
putting a secret in the repository.

`npm run post-run-audit` rechecks the retained model identities and terminal
states, records whether tool-call cardinality is available, applies a
fail-closed publication decision, and regenerates the live privacy summary.

## Statistical boundary

The six paired examples demonstrate the scoring machinery; they do not
establish model quality. Even with 6/6 observed passes per model, the Wilson
95% interval is 0.609657 to 1.000000. Small samples therefore receive a
`small_sample` interpretation. The zero-win, zero-loss, six-tie live result is
reported as mixed or insufficient comparative evidence, not proof that the
models are equivalent.

Cost output uses a dated public pricing snapshot and is an estimate, not a bill
or account balance. Refresh the snapshot before a future live run.
