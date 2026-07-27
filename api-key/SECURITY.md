# Security Model

This suite is designed to test authentication without turning credentials or account data into evidence artifacts.

## Protected data

The protected set includes:

- every real API key, including prefixes and suffixes;
- Authorization, cookie, and proxy-authentication headers;
- account IDs, user IDs, email addresses, and organization identifiers;
- monetary balances, granted balances, topped-up balances, and currencies;
- raw request and response bodies;
- provider completion IDs and system fingerprints;
- environment variables, shell history, stack traces, and local paths that may reveal operator context.

## Credential lifecycle

Use temporary, purpose-named keys for the test. Keep each key in a trusted controller's memory, create an overlap window only long enough to verify continuity, revoke the old key explicitly, verify rejection, and revoke remaining temporary keys after evidence capture.

The harness does not create or revoke keys. Those are provider-console operations requiring an authorized human or browser controller.

## No environment or file loading

`src/live-runner.mjs` accepts credentials only as function arguments and calls `acceptInMemoryCredential` with provenance fixed to `memory`. It does not read:

- `process.env`;
- `.env` files;
- command-line key values;
- stdin;
- the clipboard;
- local secret stores;
- browser storage.

The tracked `.env.example` contains only an empty `DEEPSEEK_API_KEY` field and the public fixed base URL. It is documentation only: the harness has no environment-loading path and never reads this file. Never place a real credential in `.env.example`.

## Network confinement

The live request function constructs every URL from an allowlisted path and the constant origin `https://api.deepseek.com`. It rejects:

- absolute endpoint inputs;
- user-provided origins;
- redirects;
- undeclared methods;
- undeclared endpoint paths.

Every network request enters a module-wide serial queue. There is no generic retry loop. The only repeated requests are explicitly labeled revocation-propagation polls with a hard limit of six per declared revoked-key check.

Authorized cases pass only on exactly HTTP 200 plus the documented endpoint schema. Authentication-rejection cases pass only on exactly HTTP 401. HTTP 403 and every other unexpected status remain visible as sanitized diagnostics but fail the declared expectation.

## Paid request protection

The completion probe is optional and requires an exact permit. A module-wide counter is incremented before dispatch, so a timeout or HTTP error still consumes the allowance. Thinking mode is explicitly disabled, output is capped at 16 generated tokens, and the request is never retried.

The process-wide counter cannot prevent a person from restarting Node. The operator must therefore preserve the one-run process and treat a restart as the end of the paid test, not a way to reset its budget.

## Output minimization

The live runner builds result objects from an allowlist of fields. It never returns a sent header or raw provider payload.

The balance parser reads the documented availability boolean plus the presence and length of the balance-info array. Array entries and monetary fields are neither copied nor summarized.

The model-list parser requires the documented `object: "list"` value, a non-empty `data` array, and complete public model records. It returns only validation booleans, a count, and public model IDs.

The completion parser records:

- response status;
- whether the documented chat-completion schema passed;
- whether the returned model matches the fixed requested model;
- content presence and length;
- equality to the fixed synthetic reference;
- finish reason;
- non-negative integer usage counters and whether they reconcile.

It omits the generated text itself.

`sanitizeForPublic` provides a second recursive boundary. It removes credential-like strings and fields associated with secrets, headers, raw bodies, account identity, and monetary balances.

## Static leak scan

Run `scanText` or `scanFiles` before publication. The scanner looks for:

- key-shaped `sk-` tokens;
- non-placeholder Bearer credentials;
- non-placeholder API-key assignments;
- private-key blocks;
- common secret JSON fields.

Findings contain only a rule ID and location. Matched secret text is not printed.

A clean scan reduces risk but does not prove absence. Manual inspection remains required.

## Historical evidence boundary

`results/final-results-summary.json` is a preserved sanitized observation from July 27, 2026. The version 1.1 post-run audit validates its internal status, schema, lifecycle, privacy, and secret-scan invariants without contacting DeepSeek. It does not claim that the corrected future-run harness generated the historical result, and a future live run must create a new dated artifact instead of overwriting it.

## Screenshot rules

Never capture the one-time key reveal, request headers, developer tools, terminal environment, clipboard history, account balance amounts, or billing pages.

Safe screenshots may show:

- the provider's key-management page after all key values are hidden;
- a temporary key label with no identifying account data;
- a revoked status after the secret is no longer visible;
- a locally rendered summary containing only sanitized fields.

Crop or blur unrelated account navigation and re-run visual inspection before upload.

## Incident response

If a credential may have entered a file, screenshot, terminal transcript, chat, commit, or result:

1. stop the test;
2. revoke the affected key immediately;
3. create a replacement only if needed;
4. remove the exposed artifact from the publication workflow;
5. scan the working tree and staged diff;
6. document the incident without reproducing the credential;
7. resume with a fresh temporary key only after the leak path is closed.

Deleting a public commit is not sufficient remediation; revocation is mandatory.

## Limitations

- TLS and provider infrastructure are trusted.
- A compromised controller process can read in-memory arguments.
- Static scanning cannot detect every credential format.
- HTTP status observations are point-in-time and account-specific.
- The harness does not test organization-level RBAC or provider-console permissions.
- Revocation propagation behavior may vary and is measured only within the declared poll window.
