# DeepSeek Context Caching Live-Test Harness

This folder contains a bounded Node.js harness for collecting reproducible evidence for the DeepSeek Context Caching article.

It uses the current hosted model and request mode:

- Model: `deepseek-v4-flash`
- Endpoint: `https://api.deepseek.com/chat/completions`
- Thinking: disabled
- Streaming: disabled
- Maximum output: 24 tokens per request
- Maximum live requests per run: 16

The harness has no third-party dependencies. It requires Node.js 20 or newer because it uses the built-in `fetch` API.

## What it tests

One run performs four bounded suites:

1. **Exact-extension cache test** — warms a long synthetic conversation, then extends the same conversation with one additional turn.
2. **Divergent-prefix test** — sends three prompts shaped as `A+B`, `A+C`, and `A+D`, where the long `A` prefix is byte-for-byte identical.
3. **Stable vs. volatile prefix test** — repeats a stable long prefix three times, then compares it with three requests whose first line changes on every call.
4. **`user_id` isolation test** — warms and probes the same synthetic prefix under Tenant A, probes it under Tenant B, warms Tenant B, and returns to Tenant A.

Each suite gets a run-specific synthetic prefix so a previous run should not pre-warm the new run accidentally.

## Safety and redaction

- The API key is read only from the process environment variable `DEEPSEEK_API_KEY`.
- The key is never printed, hashed, or written to disk.
- The endpoint is fixed in the source. The harness does not accept a custom endpoint, preventing accidental credential transmission to another host.
- Redirects are rejected.
- Prompts, response text, request headers, and raw response bodies are not persisted.
- Synthetic `user_id` values are stored only as labels and SHA-256 hashes.
- Error text is truncated and scrubbed for the in-memory key, Bearer tokens, and strings resembling API keys.
- There are no automatic retries, so one run cannot exceed the documented 16-request budget.
- The harness does not intentionally try to exhaust concurrency, trigger HTTP 429, or consume a large output.

The output is suitable for analysis, but review it before publishing. A metadata-only result can still reveal model behavior and test timing.

## Validate without making API requests

From this directory:

```text
npm test
npm run plan
```

`npm test` checks JavaScript syntax. `npm run plan` prints the request plan. Neither command reads a key or calls the API.

Running the script without `--execute` is also safe: it prints usage information and exits without network access.

## Run later with a temporary session-scoped key

Do not save a live key in this folder, `package.json`, a source file, an `.env` file, screenshots, or result files.

PowerShell example that avoids putting the key itself in shell history:

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

The harness aborts before the first request if `DEEPSEEK_API_KEY` is missing.

## Output files

Successful or partial runs create:

```text
results/context-caching-<UTC timestamp>-<run id>.json
results/context-caching-<UTC timestamp>-<run id>.csv
results/latest.json
results/latest.csv
```

Every request row includes:

- UTC start and completion timestamps
- HTTP status
- requested and returned model
- measured latency
- prompt tokens
- `prompt_cache_hit_tokens`
- `prompt_cache_miss_tokens`
- output tokens
- finish reason
- suite, phase, and repetition labels
- hashes for the synthetic prompt/request identity
- a redacted, truncated error field when applicable

The JSON file also contains the run configuration, request budget, methodology notes, and aggregate summaries by suite and variant.

## Interpretation limits

- Cache construction and retention are provider-managed. A single hit or miss is an observation for this account, endpoint, payload, and time window, not a universal guarantee.
- The `user_id` suite observes API-reported cache token fields. It does not inspect provider infrastructure.
- The volatile-prefix suite changes the first prompt line intentionally. It tests prefix reuse, not semantic similarity.
- A failed warm-up makes its following probe inconclusive. Keep all rows and interpret them in sequence.
- The test uses synthetic English text only and does not send user content or personal data.
- Use DeepSeek's current official Context Caching and Rate Limit documentation when interpreting results.

Official context-caching guide:

`https://api-docs.deepseek.com/guides/kv_cache/`
