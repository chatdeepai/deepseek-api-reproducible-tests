# DeepSeek API Key Test Plan

Version: 1.0  
Evidence date: 2026-07-27  
Runtime: Node.js 20 or newer  
Fixed API origin: `https://api.deepseek.com`  
Maximum application concurrency: 1  
Generic retries: 0  
Maximum paid completions: 1 per Node process

## Research questions

1. Does a newly created key authenticate against the documented model-list endpoint?
2. How does the API classify missing, empty, wrong-scheme, and synthetically invalid Authorization credentials?
3. Does the documented balance endpoint expose an availability signal to the key without requiring monetary data in the public evidence?
4. Can an old and replacement key both authenticate during a deliberate overlap window?
5. After explicit console revocation, does the old key become unauthorized while the replacement remains authorized?
6. Can the evidence be published without credentials, balances, account data, raw response bodies, or provider identifiers?

## Credential roles

- `oldKey`: a temporary authorized key used for the baseline and overlap checks.
- `newKey`: a separate temporary authorized key used for overlap and post-revocation continuity.
- synthetic credentials: fixed non-secret strings used only for negative controls.

Real credentials are supplied only as in-memory function arguments. They are never written by this suite.

## Live cases

| ID | Request | Credential variant | Calls | Expected interpretation |
|---|---|---:|---:|---|
| A1 | `GET /models` | Valid Bearer key | 1 | A 2xx response supports successful authentication at test time. |
| A2 | `GET /models` | Header omitted | 1 | HTTP 401 or 403 supports authentication enforcement. |
| A3 | `GET /models` | Empty Bearer value | 1 | HTTP 401 or 403 supports rejection of an empty credential. |
| A4 | `GET /models` | Wrong scheme plus synthetic value | 1 | HTTP 401 or 403 supports Bearer-scheme enforcement. |
| A5 | `GET /models` | Synthetic invalid Bearer value | 1 | HTTP 401 or 403 supports invalid-key rejection. |
| B1 | `GET /user/balance` | Valid Bearer key | 1 | Record only status and the boolean `is_available` signal. |
| C1 | `POST /chat/completions` | Valid Bearer key | 0 or 1 | Optional bounded proof that the key can authorize a completion. |
| D1 | `GET /models` | Old valid key | 1 | Establish an authorized baseline. |
| D2 | `GET /models` | New valid key | 1 | Establish replacement-key continuity during overlap. |
| E1 | `GET /models` | Revoked old key | 1–6 | Declared propagation polls; stop on HTTP 401 or 403. |
| E2 | `GET /models` | Active new key | 1 | Confirm continuity after the old key is rejected or polling ends. |

## Paid-call budget

Case C1 is the only paid-capable request in the harness. It is guarded by all of the following:

- exact opt-in permit `ALLOW_ONE_PAID_COMPLETION`;
- process-wide counter checked before request dispatch;
- model fixed to `deepseek-v4-flash`;
- synthetic prompt fixed by the harness;
- `max_tokens` fixed to 16;
- temperature fixed to 0;
- streaming disabled;
- no retry after transport or HTTP failure.

The budget counts an attempted network request even if it fails.

## Revocation polling

Revocation is performed manually outside the harness. E1 is allowed to poll because provider-side revocation propagation may not be instantaneous.

- maximum polls: 6;
- allowed interval: 0–30,000 milliseconds;
- default interval: 2,000 milliseconds;
- stop immediately after HTTP 401 or 403;
- stop immediately after a transport failure;
- do not repeat E2;
- do not reinterpret polls as retries for unrelated failures.

## Sanitized result fields

Allowed evidence includes:

- public case IDs and endpoint paths;
- HTTP method and status;
- normalized status class;
- elapsed milliseconds;
- booleans such as `authorized`, `revokedObserved`, and `available`;
- request and poll counts;
- public model name used by the one paid case;
- finish reason and token counters;
- content length and exact-reference-match boolean.

Forbidden evidence includes:

- API keys or fragments;
- Authorization headers;
- request or response headers;
- raw request bodies or prompts;
- raw response bodies or generated content;
- balance amounts, balance arrays, and currencies;
- account identity or contact fields;
- completion IDs and system fingerprints;
- raw provider error text;
- environment values, filesystem paths, and stack traces.

## Stop conditions

Stop live work immediately when:

- the fixed origin assertion fails;
- an undeclared endpoint or method is requested;
- observed network concurrency would exceed one;
- the paid-call counter is already consumed;
- an unexpected transport failure occurs;
- a credential cannot be validated as an in-memory value;
- the operator cannot distinguish the old and new temporary keys safely;
- a prospective artifact fails the secret scan.

## Publication standard

A dated public summary should distinguish:

- official documentation;
- live observation;
- expected negative controls;
- local safety validation;
- limitations, including the small sample and the fact that account-specific amounts are intentionally omitted.

Passing authentication at one timestamp does not establish future availability, quota, pricing, or authorization for every endpoint.
