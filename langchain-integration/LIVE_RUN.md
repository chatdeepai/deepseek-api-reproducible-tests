# Live Run Record

Status: completed and independently audited.

The frozen plan ran once on July 27, 2026 at 16:54 UTC. It issued 16 of 16
planned provider requests, used concurrency 1, configured zero automatic
retries, and completed in 25.406 seconds. That total is study elapsed time, not
a latency benchmark or service-level result.

## Frozen controls

- Plan: `fixtures/request-plan.json`
- Planned cases: 16
- Provider request cap: 16
- Python cases: 11
- JavaScript cases: 5
- Concurrency: 1
- Automatic SDK retries: 0
- Credential source: environment only
- Public output policy: allowlisted metadata only

## Preflight checklist

- [x] Review the 16 frozen cases.
- [x] Confirm the pinned Python and JavaScript tests pass.
- [x] Confirm `results/live-summary.json`, `results/run-ledger.json`,
      `results/js-partial.json`, and `results/privacy-audit.json` do not exist.
- [x] Confirm sufficient API credit for at most 16 small requests.
- [x] Set `DEEPSEEK_API_KEY` outside source control.
- [x] Set `ALLOW_PROVIDER_REQUESTS=1`.
- [x] Keep LangSmith and all other external tracing disabled.
- [x] Run the coordinator once.
- [x] Run `python -m src.postrun` again as an independent audit.
- [x] Inspect only the sanitized summary and privacy audit for publication.

The temporary test key was cleared from process memory and revoked after the
run. No credential fragment was written to this package.

## Publication rule

Do not convert an untested method, wrapper profile, old alias, or localhost
fixture into a provider-support claim. Publish dated live observations only
after the privacy audit reports `pass`.
