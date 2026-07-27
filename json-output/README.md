# DeepSeek JSON Output Reproducibility Harness

This dependency-free Node.js harness supports a dated, evidence-led study of DeepSeek JSON Output on `deepseek-v4-flash` and `deepseek-v4-pro`.

It separates three evidence types:

1. official DeepSeek documentation;
2. bounded live provider observations;
3. deterministic local parser and schema fixtures.

Node.js 20 or newer is required. The harness uses only built-in modules and the built-in `fetch` API.

## Live safety contract

One complete live execution is mechanically limited to:

- one authenticated `GET /models` inventory;
- exactly 20 sequential Chat Completions;
- maximum live concurrency of one;
- zero automatic live retries;
- only `deepseek-v4-flash` and `deepseek-v4-pro`;
- only the fixed origin `https://api.deepseek.com`;
- a 60-second deadline per request;
- a maximum of 512 generated tokens in any request;
- a maximum theoretical allowance of 5,704 generated tokens across the plan;
- synthetic English-only prompts and inputs.

The run stops before submitting another request after any unexpected non-2xx status or transport failure. B2 and B3 are the only bounded controls allowed to continue after HTTP 400 because they intentionally omit the documented `json` prompt instruction. It never attempts to induce 402, 429, 500, or 503 and never calls balance, billing, account, key-management, or legacy-model endpoints.

## Credential and output safety

Only `--execute` and `--resume-latest` read `DEEPSEEK_API_KEY`.

The harness does not persist or print:

- the API key or any derivative of it;
- the Authorization header;
- account balance or account information;
- provider completion IDs;
- system fingerprints;
- raw response headers;
- raw reasoning content;
- raw prompts or request bodies;
- arbitrary raw content from failed or unexpected outputs;
- stack traces or environment paths.

Sanitized live artifacts contain public test labels, public model IDs, status, timing, finish reason, token counters, content lengths and hashes, local parser and schema results, SSE counters, and a normalized object only when it exactly matches an expected synthetic result.

Results are written as timestamped JSON and CSV files under `results/`. The repository-level `.gitignore` excludes that directory by default.

The public repository includes only the independently audited final summary as JSON and CSV. Timestamped cumulative artifacts remain local because they contain no additional public evidence and would be easy to miscount as separate executions.

## Test matrix

The 20 completions are:

- **A1–A8:** V4 Flash/Pro × thinking enabled/disabled × two repetitions using a strong JSON prompt and exact schema.
- **B1–B3:** prompt ablation for the word `json` and an example object.
- **C1–C5:** truncation, JSON escaping, synthetic instruction injection, and missing/null facts.
- **D1–D2:** streaming JSON assembly on Flash non-thinking and Pro thinking.
- **E1–E2:** strong prompt controls with `response_format` omitted.

The study records outcomes rather than hard-coding expected provider behavior. Two repetitions are descriptive and are not a reliability benchmark.

## Dated live result

The completed run began at `2026-07-27T09:44:48.338Z` and ended at `2026-07-27T09:48:42.812Z`.

- one `GET /models` request returned HTTP 200 and listed `deepseek-v4-flash` and `deepseek-v4-pro`;
- 20 unique completion cases ran exactly once across three reviewed resume segments;
- 18 completions returned HTTP 200 and the B2/B3 missing-instruction controls returned HTTP 400;
- 18/18 successful completions contained non-empty final content;
- 17/18 parsed as JSON and passed the exact local schema;
- 16/18 also matched every synthetic reference fact;
- 2/2 streams reached `[DONE]`, produced one usage event, and passed final parsing and validation;
- observed peak application concurrency was one and automatic live retries were zero.

The public [`final-results-summary.json`](./results/final-results-summary.json) and [`final-results-summary.csv`](./results/final-results-summary.csv) omit raw prompts, raw completion text, raw reasoning, provider IDs, headers, credentials, and account data. Because response text is intentionally omitted, the summary supports request-accounting and implementation review but not independent re-parsing of the provider output.

## Offline validation

Run:

```text
npm test
npm run plan
```

These commands:

- check JavaScript syntax;
- verify the exact 1+20 request plan;
- enforce concurrency one and zero retries;
- verify the model and endpoint allow-lists;
- verify the total token allowance;
- ensure B1 contains the word `json` and B2/B3 do not;
- test empty, whitespace-only, invalid, truncated, schema-invalid, escaping, and null-handling fixtures;
- test SSE chunk fragmentation, reasoning redaction, keep-alive comments, usage-only events, and `[DONE]`;
- test CSV escaping and the result redaction scanner.

They do not read a key, make a network request, or write a result file.

Running the script without a mode is also safe and only prints usage.

## Run live observations

Use a temporary API key and remove it from the process environment immediately after the run.

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

The harness aborts before the inventory request if the variable is absent.

If an approved B2 or B3 control caused an older harness version to pause, resume from the sanitized incomplete prefix without repeating the inventory or earlier completions:

```text
npm run resume
```

`--resume-latest` validates that the existing observations are an exact, incomplete A1–E2 plan prefix and that the last stop was an approved B2/B3 HTTP 400 control. It then sends only the remaining cases. A completed plan cannot be resumed.

## Interpretation rules

- Attribute feature requirements to the official DeepSeek documentation.
- Treat each status, timing, parse result, schema result, token count, model ID, and streaming event count as a dated observation.
- A parseable JSON value can still fail the local schema or reference facts.
- Empty content and `finish_reason: "length"` are separate outcomes.
- A successful prompt-only control does not make `response_format` unnecessary.
- A two-run model/mode cell cannot establish a universal reliability rate.
- The synthetic injection case is not a production security benchmark.
- A timeout leaves provider completion status unknown.

## Official references

- JSON Output: <https://api-docs.deepseek.com/guides/json_mode/>
- Create Chat Completion: <https://api-docs.deepseek.com/api/create-chat-completion/>
- Models & Pricing: <https://api-docs.deepseek.com/quick_start/pricing/>
- List Models: <https://api-docs.deepseek.com/api/list-models/>
- Thinking Mode: <https://api-docs.deepseek.com/guides/thinking_mode/>
