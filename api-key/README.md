# DeepSeek API Key Reproducibility Harness

This dependency-free Node.js 20+ suite supports a bounded, evidence-led audit of DeepSeek API key authentication, balance availability, rotation continuity, and revocation.

It is deliberately split into two layers:

1. deterministic offline checks that never contact DeepSeek; and
2. opt-in live functions that accept credentials only as in-memory function arguments.

Running `npm test` performs offline work only. There is no command that reads a key from an environment variable, command-line argument, file, prompt transcript, or repository.

## Safety contract

The live module enforces these limits:

- the only network origin is `https://api.deepseek.com`;
- every network request is serialized, so observed harness concurrency cannot exceed one;
- there are zero generic retries;
- only explicitly named revocation polls may repeat, with a hard maximum of six;
- authentication controls use `GET /models`;
- the balance probe uses `GET /user/balance` and exposes only whether the API returned an availability boolean and its boolean value;
- the completion probe uses `POST /chat/completions`, `deepseek-v4-flash`, and at most eight output tokens;
- a process-wide budget allows at most one completion request;
- the completion requires the exact permit string `ALLOW_ONE_PAID_COMPLETION`;
- raw response bodies, prompts, provider IDs, headers, keys, balances, currencies, account data, and error messages are never returned.

Restarting Node starts a new process, so the operator must treat the paid-call limit as a one-run contract and must not restart the process to repeat the paid test.

## Dated live result

The bounded run began at `2026-07-27T10:42:01.137Z` and ended at `2026-07-27T10:46:07.911Z`.

- 12/12 logical live cases met their expected result;
- 6/6 valid authenticated operations returned HTTP 200;
- 6/6 missing, malformed, invalid, or revoked credential controls returned HTTP 401;
- the valid model inventory listed `deepseek-v4-flash` and `deepseek-v4-pro`;
- the single paid completion used 17 prompt tokens, 6 completion tokens, and 23 total tokens;
- the balance probe published only the boolean availability result and no monetary values;
- two temporary keys were created, two were revoked, and zero test-key rows remained;
- both revocations were confirmed on the first declared poll;
- replacement-key continuity passed after the old key was revoked;
- maximum application concurrency was one and generic retries were zero.

See [`results/final-results-summary.json`](./results/final-results-summary.json), [`results/final-results-summary.csv`](./results/final-results-summary.csv), and the recomputed [`results/independent-audit.json`](./results/independent-audit.json). These files contain no credential value, credential fragment, Authorization header, balance amount, account identifier, provider request ID, or raw response body.

## Offline validation

From this directory:

```text
npm test
```

The offline suite checks:

- syntax for every public source and test module;
- rejection of environment, command-line, and file credential provenance;
- repository and local ignore rules for common secret-bearing files;
- recursive redaction of credentials, headers, account fields, and monetary balance data;
- static secret scanning;
- the rotation state machine;
- fixed-origin, serial mock requests;
- the five-case authentication matrix;
- amount-free balance output;
- one-paid-completion enforcement;
- overlap and post-revocation continuity behavior.

All network behavior in the offline suite is provided by an in-memory mock. The tests do not call DeepSeek.

The final offline run passed 10/10 deterministic cases with zero network requests. Its sanitized summary is in [`results/offline-results-summary.json`](./results/offline-results-summary.json).

## Live use

Do not put a real key in a shell command, `.env` file, JavaScript source file, screenshot, notebook, chat message, or test result. A trusted controller should obtain the credential through a secure channel, retain it only in memory, and pass it directly to the exported function.

Illustrative controller flow:

```js
const { createLiveSession } = await import("./src/live-runner.mjs");

const session = createLiveSession();

// validKey must already exist only in the trusted controller's memory.
const authentication = await session.runAuthenticationMatrix({ validKey });
const balance = await session.runBalanceAvailability({ validKey });
```

The suite intentionally provides no key-loading helper. It never reads `DEEPSEEK_API_KEY` or `process.env`.

### Authentication matrix

`runAuthenticationMatrix({ validKey })` performs five serial, non-billable model-list probes:

1. a valid Bearer credential supplied in memory;
2. a missing Authorization header;
3. an empty Bearer credential;
4. a wrong authentication scheme with a synthetic credential;
5. a synthetically invalid Bearer credential.

The result includes only the case ID, expected class, HTTP status, normalized status class, elapsed time, and boolean outcome. It does not include a response body or sent header.

### Balance availability

`runBalanceAvailability({ validKey })` makes one request to the documented balance endpoint. If the response is valid JSON, the public result may contain:

```json
{
  "availabilityFieldPresent": true,
  "available": true
}
```

No monetary amount, currency, balance array, or account identifier can enter the returned object.

### One paid completion

The optional paid probe is disabled unless the exact permit is supplied:

```js
const completion = await session.runOnePaidCompletion({
  validKey,
  permit: "ALLOW_ONE_PAID_COMPLETION"
});
```

The request asks for the synthetic token `AUTHENTICATED_OK` with a 16-token output cap. The returned result records only whether non-empty content was received and whether the normalized text equaled that fixed reference, plus finish and token-count metadata. The text itself is omitted.

### Rotation and revocation

Use separate keys during the overlap window:

```js
const overlap = await session.runRotationOverlap({ oldKey, newKey });
```

Revoke the old key through the provider UI. Then run:

```js
const afterRevocation = await session.runPostRevocationChecks({
  revokedKey: oldKey,
  activeKey: newKey,
  maxPolls: 3,
  pollIntervalMs: 2000
});
```

Only the revoked-key check may repeat. These are declared propagation polls, not generic request retries. The active key is checked once after the revoked key is rejected or the poll allowance is exhausted.

## Evidence handling

Live functions return sanitized JavaScript objects but do not write files. Before publishing a result:

1. serialize only a returned object;
2. run `scanText` or `scanFiles` from `src/secret-scan.mjs`;
3. inspect the result manually;
4. publish only the minimum dated summary needed to support the reported observation.

The test harness is evidence infrastructure, not a credential manager. Creation and revocation remain explicit provider-console actions performed by an authorized operator.

## Files

- `TEST_PLAN.md` defines the bounded live cases and expected interpretation.
- `SECURITY.md` documents the threat model and operator rules.
- `official-sources.md` records the first-party documentation used.
- `src/live-runner.mjs` exports the opt-in live functions.
- `src/redact.mjs` recursively removes sensitive fields and strings.
- `src/secret-scan.mjs` performs a conservative static leak scan.
- `src/rotation-state.mjs` models the rotation lifecycle without key material.
- `src/offline-runner.mjs` runs syntax and offline tests.
- `tests/offline.test.mjs` contains deterministic no-network tests.
