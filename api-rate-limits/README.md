# DeepSeek API Rate Limits: Reproducible Tests

This dependency-free Node.js harness supports an evidence-led guide to DeepSeek API rate limits. It deliberately separates:

1. **Official documented facts**, such as the current account-level concurrency limits.
2. **Bounded live observations**, made with a maximum of four simultaneous requests.
3. **Deterministic offline simulations**, which test the client queue, retry policy, and keep-alive parsers without contacting DeepSeek.

The harness never attempts to reach DeepSeek's documented concurrency ceilings and never tries to manufacture HTTP 429, 500, or 503 responses.

Node.js 20 or newer is required. No third-party packages are used.

## Safety contract

A complete live run is mechanically limited to:

- one authenticated `GET /models` inventory;
- exactly 12 Chat Completions requests;
- no more than four simultaneous live requests;
- zero automatic live retries;
- eight output tokens or fewer per completion;
- non-thinking mode for every completion;
- a fixed minimal prompt: `Return exactly: OK`;
- immediate termination of subsequent work after an observed 429, 500, or 503;
- termination after any other non-success response or transport failure.

The live harness does not:

- call a balance, billing, account, or key-management endpoint;
- send a deliberate flood or ceiling-seeking workload;
- persist or print the API key or Authorization header;
- persist balances, provider request IDs, system fingerprints, raw headers, prompts, request bodies, raw response bodies, or raw generated text;
- retry a live request automatically;
- claim that four successful requests validate DeepSeek's documented 500 or 2,500 concurrency ceilings.

Only `--execute` reads `DEEPSEEK_API_KEY`. Plan validation and every offline simulation run without a credential and make no network request.

## Bounded live plan

The 12 completion calls are:

1. One non-streaming control request to `deepseek-v4-flash`.
2. One non-streaming control request to `deepseek-v4-pro`.
3. Four additional `deepseek-v4-flash` requests executed sequentially.
4. Four `deepseek-v4-flash` requests submitted as one batch with a hard application-side concurrency cap of four.
5. One non-streaming `deepseek-v4-flash` parser observation.
6. One streaming `deepseek-v4-flash` parser observation.

The inventory request runs first. Sequential controls run before the four-request batch. If a terminating condition occurs, no later group is submitted. All calls target the fixed official origin `https://api.deepseek.com`.

The resulting evidence can show whether the harness respected its own cap and what happened for this small, dated sample. It cannot establish provider capacity, an RPM/TPM quota, or universal latency.

## Published bounded observation: July 27, 2026 UTC

The published sanitized run completed the plan without triggering a stop condition:

- `GET /models` returned HTTP 200 and listed `deepseek-v4-flash` and `deepseek-v4-pro`.
- All 12 minimal completions returned HTTP 200: 11 Flash and one Pro.
- Four Flash calls executed sequentially in 4,061 ms.
- Four Flash calls submitted together completed in 1,106 ms, with an observed application-side peak of four.
- The streaming control reached its first data event in 341 ms and completed in 756 ms.
- The live stream contained three JSON data events, no keep-alive comments, and a `[DONE]` marker.
- No live request returned 429, 500, or 503, and no `Retry-After` header was observed.

These are dated client observations. The four-request batch validates only the local cap and that sample; it does not measure DeepSeek's documented provider ceiling.

Published artifacts:

- [`results/live-results-summary.json`](./results/live-results-summary.json)
- [`results/live-results-summary.csv`](./results/live-results-summary.csv)
- [`results/offline-results-summary.json`](./results/offline-results-summary.json)
- editable SVG and rendered PNG figures under [`visuals/`](./visuals/)

## Offline deterministic tests

### Queue benchmark

The queue benchmark schedules the same 24 synthetic jobs through fixed worker counts of 1, 2, 4, and 8. It computes:

- configured worker cap;
- observed peak active jobs;
- total synthetic service time;
- makespan;
- queue-wait p50 and p95;
- mean active workers;
- completion order;
- the complete deterministic schedule.

The benchmark advances a virtual clock. It does not sleep and does not contact any service.

### Retry-policy simulation

The retry simulation evaluates these local sequences:

- `429 → 429 → 200`
- `503 → 200`
- `500 → 200`
- `400`
- `network timeout → 200`
- cancellation while waiting

It uses a three-attempt budget, capped exponential backoff, and deterministic jitter fractions. A simulated `Retry-After` hint is included in one 429 fixture to exercise policy precedence. This is an application policy demonstration, not evidence that DeepSeek will return that header or sequence.

### Keep-alive parser tests

Two local fixtures test parsing:

- a non-streaming response with leading blank lines before valid JSON;
- a streaming SSE response whose chunks split two `: keep-alive` comments and JSON `data:` events across arbitrary boundaries.

The tests confirm that blank lines and SSE comments are ignored without losing the final payload. The fixtures are not live DeepSeek responses.

## Validate without a key

From this directory:

```text
npm test
npm run plan
```

`npm test` checks syntax, validates the safety contract, executes every offline invariant, and makes no network request.

`npm run plan` prints the public live plan and makes no network request.

Running the script without a mode also makes no network request.

## Print the offline evidence

```text
npm run simulate
```

The command prints a JSON artifact labeled `offline_deterministic_simulation`. It contains the queue schedules, retry-policy traces, and parser-fixture results. It reads no key and writes no file.

## Run the bounded live observations

Use a temporary API key and remove it from the environment immediately after the run. Do not put the key in this directory, a source file, an `.env` file, a screenshot, or source control.

PowerShell:

```powershell
$secureKey = Read-Host "DeepSeek API key" -AsSecureString
$temporaryCredential = [pscredential]::new("temporary", $secureKey)
$env:DEEPSEEK_API_KEY = $temporaryCredential.GetNetworkCredential().Password
npm run live
Remove-Item Env:DEEPSEEK_API_KEY
```

macOS or Linux:

```bash
read -s DEEPSEEK_API_KEY
export DEEPSEEK_API_KEY
npm run live
unset DEEPSEEK_API_KEY
```

A live run writes one sanitized JSON artifact under `results/`. The artifact contains statuses, timing, public model names, finish reasons, token counts, response byte counts, content lengths and hashes, parser counters, and whether `Retry-After` was present. It omits private and raw provider data.

## Interpretation rules

- Attribute the limits of 500 for `deepseek-v4-pro` and 2,500 for `deepseek-v4-flash` to DeepSeek's official documentation, not to this small test.
- Say that the current public official page does not publish an RPM or TPM table; do not claim that no undisclosed or account-specific control exists.
- Treat every live status, latency, token count, returned model ID, keep-alive count, and header-presence field as a dated observation.
- A successful four-request batch validates only the client-side cap and that sample.
- Absence of a keep-alive comment in a quick live request does not contradict documentation saying it may appear while a request waits.
- Offline queue, retry, and parser results must remain labeled as simulations.
- A transport timeout leaves the provider outcome unknown and can create duplicate work if retried.

## Official references

- Rate Limit & Isolation: <https://api-docs.deepseek.com/quick_start/rate_limit/>
- Error Codes: <https://api-docs.deepseek.com/quick_start/error_codes/>
- Models & Pricing: <https://api-docs.deepseek.com/quick_start/pricing/>
- List Models: <https://api-docs.deepseek.com/api/list-models/>
- Create Chat Completion: <https://api-docs.deepseek.com/api/create-chat-completion/>
