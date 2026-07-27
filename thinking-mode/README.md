# DeepSeek Thinking Mode Live-Test Harness

This folder contains a bounded Node.js harness for collecting reproducible evidence for a DeepSeek Thinking Mode guide. It tests the current direct Chat Completions endpoint and current hosted model IDs documented on July 27, 2026 UTC:

- `deepseek-v4-flash`
- `deepseek-v4-pro`
- `https://api.deepseek.com/chat/completions`

The harness has no third-party dependencies. It requires Node.js 20 or newer because it uses the built-in `fetch` API.

## What one run tests

One complete run makes at most 14 sequential API requests:

1. **Thinking toggle matrix - 6 calls.** On both current models, the same bounded prompt is sent with the `thinking` field omitted, explicitly enabled, and explicitly disabled. The result records whether `reasoning_content` appears, its length and hash, token usage, finish reason, and latency.
2. **Ordinary multi-turn continuation - up to 3 calls.** A first thinking-mode response is continued in two branches. One branch passes the prior `reasoning_content`; the other omits it. Current DeepSeek documentation says prior reasoning from a turn without tool calls does not need to be included and is ignored if supplied.
3. **Tool-call continuation - up to 3 calls.** A strongly worded prompt asks the model to call one deterministic synthetic inventory tool. A contract-shaped branch passes the full assistant `content`, `reasoning_content`, and `tool_calls` before the mocked tool result. A compatibility-probe branch intentionally omits `reasoning_content`. The official contract predicts HTTP 400 for that omission, while bounded July 27, 2026 controls accepted it with HTTP 200 on both current models. The harness records either 200 or 400 without treating one dated outcome as a universal rule.
4. **Reasoning effort - 2 calls.** The same prompt is sent with the currently documented `high` and `max` effort values.

Dependent continuation calls are skipped if their initial response does not contain the required successful message shape. A skipped branch is reported in JSON and does not consume a request.

## What the harness does not save

The harness deliberately does not write any of the following to disk:

- API keys or authorization headers
- prompts or system messages
- final answer text
- `reasoning_content` or any other chain-of-thought text
- tool-call arguments, tool-call IDs, or tool results
- raw API response bodies
- raw error messages

For generated text and tool-call fields, the output contains only presence flags, character or byte lengths, counts, and SHA-256 hashes. Tool function names are retained because they are fixed, synthetic labels defined in the harness.

The API key is read only from the current process environment. The endpoint and model allow-list are fixed in the source. Redirects are rejected. There are no automatic retries, and the hard plan validator refuses a budget above 18 requests.

## Validate without making API requests

From this directory:

```text
npm test
npm run plan
```

`npm test` checks JavaScript syntax and validates the request budget, endpoint origin, model allow-list, and output-token cap. `npm run plan` prints the full execution plan. Neither command reads an API key or makes a network request.

Running the script without an argument is also safe. It prints usage information and exits.

## Run with a temporary session-scoped key

Do not put a live key in this folder, an `.env` file, source control, screenshots, or result files.

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

The harness aborts before the first request if `DEEPSEEK_API_KEY` is missing.

## Result files

A successful or partial run creates:

```text
results/thinking-mode-<UTC timestamp>-<run id>.json
results/thinking-mode-<UTC timestamp>-<run id>.csv
results/latest.json
results/latest.csv
```

Each request row includes:

- UTC timestamps and measured latency
- HTTP status and whether the documented expectation was met
- requested and returned model IDs
- the thinking toggle state and reasoning-effort value
- prompt, completion, total, cache-hit, cache-miss, and reasoning token fields when returned
- presence, length, and SHA-256 metadata for final and reasoning content
- finish reason and tool-call count
- hashes for tool-call IDs and arguments
- hashes for the request and message sequence
- redacted error type, code, parameter, and error-message metadata

The JSON result also includes the fixed test plan, skipped dependent branches, aggregate suite summaries, redaction declarations, and interpretation limits.

## Reading the results correctly

- The toggle suite tests an observed response shape, not answer quality.
- Reasoning text and length are nondeterministic. Differences between `high` and `max` in one run are observations, not universal ratios.
- The tool-history omission probe accepts either HTTP 200 or the documented HTTP 400 as an interpretable compatibility result. Production code should still preserve the complete assistant message because that is the official contract.
- A normal multi-turn branch and a tool-call branch have different context rules. Do not generalize the compatibility-probe result to conversations without tools.
- The harness omits `tool_choice` in thinking-mode tool tests. Bounded July 27 controls accepted `tool_choice: "auto"`, but current official compatibility notes advise against relying on it.
- Model routing, usage fields, latency, and validation behavior may change after the documented test date.
- The synthetic tool never contacts another service and returns a fixed value in memory.

## Official references

- Thinking Mode: <https://api-docs.deepseek.com/guides/thinking_mode>
- Create Chat Completion: <https://api-docs.deepseek.com/api/create-chat-completion>
- Models and Pricing: <https://api-docs.deepseek.com/quick_start/pricing/>
- V4 Preview Release: <https://api-docs.deepseek.com/news/news260424/>
