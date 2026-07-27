# DeepSeek API Error Codes Live-Test Harness

This dependency-free Node.js harness collects bounded, reproducible metadata for a DeepSeek API Error Codes guide. It uses one fixed official endpoint:

`https://api.deepseek.com/chat/completions`

The harness distinguishes two evidence sources:

1. **Live provider observations** are individual API requests sent sequentially to DeepSeek. Their observed status and metadata are saved without hard-coding an expected response.
2. **Simulated client retry policies** are deterministic local examples. They send no request and are written to separate files. They must never be presented as provider responses.

Node.js 20 or newer is required because the script uses the built-in `fetch` API. No third-party packages are needed.

## Live provider plan

One complete live run makes exactly 14 sequential requests, with no automatic retries:

1. One minimal successful control using `deepseek-v4-flash`, non-thinking mode, and a four-token output cap.
2. One request with a generated invalid credential.
3. One request with the Authorization header omitted.
4. One small malformed JSON request.
5. One small plain-text request with a non-JSON content type.
6. One JSON request with `messages` missing.
7. One JSON request with an empty `messages` array.
8. One JSON request with `messages` set to the wrong type.
9. One request with a synthetic unknown model ID.
10. One request with an unsupported `thinking.type`.
11. One request with negative `max_tokens`.
12. One request with a synthetic `user_id` outside the documented character set.
13. One request with `temperature` above the documented range.
14. One `GET` request to the Chat Completions endpoint with no body.

The harness records whatever the current hosted service returns. It does not claim that a particular malformed case must map to 400 or 422, because provider validation order and status mapping can change.

## Errors this harness refuses to force

The official DeepSeek error guide also lists 402, 429, 500, and 503. This harness does not try to induce them:

- It never checks, changes, exposes, or drains account balance to manufacture HTTP 402.
- It never floods traffic or exceeds concurrency to manufacture HTTP 429.
- It never attempts to destabilize the service to manufacture HTTP 500 or 503.
- It never loops on authentication or invalid-request failures.

The retry behavior for those conditions appears only in the separate offline simulation artifact.

## Safety and redaction

- `DEEPSEEK_API_KEY` is read only after `--execute` is explicitly selected.
- The valid key is never printed, hashed, or written to disk.
- The invalid credential is generated in memory for each run and is never persisted.
- The endpoint is fixed in source, its origin is validated, and redirects are rejected.
- Requests run sequentially with a 90-second per-request timeout.
- The request budget is 14 and the hard validator refuses any budget above 18.
- There are no automatic live retries.
- Request and response headers are never persisted.
- Prompts, request bodies, raw response bodies, raw errors, balances, provider request IDs, and private identifiers are never persisted in results.
- Generated text and scrubbed error messages are stored only as presence flags, lengths, and SHA-256 hashes.
- UUIDs, likely request or trace IDs, long opaque tokens, Bearer values, and strings shaped like API keys are scrubbed before error metadata is calculated.
- The live test does not call a balance endpoint.

The provider result does include public metadata such as the test label, HTTP status, method, fixed endpoint, returned public model ID, token counts, body byte count, and hashes of synthetic request bodies. Review any result before publication.

## Offline validation

From this directory:

```text
npm test
npm run plan
```

`npm test` checks JavaScript syntax and validates:

- the 14-request plan matches the budget;
- the budget stays below the hard ceiling;
- every request targets the fixed DeepSeek origin;
- methods and authentication modes come from a small allow-list;
- a successful control exists;
- no balance, load, flood, or concurrency-induction test is present;
- simulated rows are labeled as simulations;
- the successful output cap is at most eight tokens.

`npm run plan` prints the public plan. Neither command reads a key, writes results, or makes a network request.

Running the script without an argument is also safe: it prints usage and exits.

## Generate only the offline retry simulation

```text
npm run simulate
```

This creates JSON and CSV policy examples for:

- HTTP 400
- HTTP 401
- HTTP 402
- HTTP 422
- HTTP 429
- HTTP 500
- HTTP 503
- network timeout

No API key is read and no provider request is sent. Retryable examples get a deterministic two-retry schedule of 500 ms and 1,000 ms. The script does not sleep or execute those retries.

The simulation emphasizes that a timeout or retried completion can duplicate work or spend. A production application should use its own duplicate-work guard and keep retries bounded.

## Run the live provider observations

Use a temporary, session-scoped API key. Do not save a key in this folder, an `.env` file, source control, screenshots, or result files.

PowerShell example that avoids placing the key itself in shell history:

```powershell
$secureKey = Read-Host "DeepSeek API key" -AsSecureString
$temporaryCredential = [pscredential]::new("temporary", $secureKey)
$env:DEEPSEEK_API_KEY = $temporaryCredential.GetNetworkCredential().Password
npm run live
Remove-Item Env:DEEPSEEK_API_KEY
```

macOS or Linux example:

```bash
read -s DEEPSEEK_API_KEY
export DEEPSEEK_API_KEY
npm run live
unset DEEPSEEK_API_KEY
```

The script aborts before the first provider call if `DEEPSEEK_API_KEY` is missing.

## Output files

A live run writes provider observations and simulations into separate artifacts:

```text
results/provider-observations-<UTC timestamp>-<run id>.json
results/provider-observations-<UTC timestamp>-<run id>.csv
results/latest-provider-observations.json
results/latest-provider-observations.csv

results/simulated-retry-policy-<UTC timestamp>-<run id>.json
results/simulated-retry-policy-<UTC timestamp>-<run id>.csv
results/latest-simulated-retry-policy.json
results/latest-simulated-retry-policy.csv
```

An offline simulation uses `offline` instead of a live run ID. Provider and simulated rows are never mixed in one file.

## Interpretation rules

- A recorded status is a dated observation for one account, endpoint, request shape, and service version.
- Do not relabel simulated 402, 429, 500, 503, or timeout rows as live DeepSeek evidence.
- Invalid requests may be rejected at different validation stages over time.
- The one successful control is intentionally tiny. Its purpose is to distinguish a broadly working credential and endpoint from malformed-case behavior.
- A transport timeout does not prove that the provider did no work.
- Do not automatically retry 400, 401, 402, or 422 without first correcting the cause.
- Keep 429, 500, 503, and transport retries bounded and guarded against duplicate work.

## Official references

- Error Codes: <https://api-docs.deepseek.com/quick_start/error_codes/>
- Create Chat Completion: <https://api-docs.deepseek.com/api/create-chat-completion>
- Rate Limit and Isolation: <https://api-docs.deepseek.com/quick_start/rate_limit>
- Models and Pricing: <https://api-docs.deepseek.com/quick_start/pricing/>
