# Methodology

## Objective

Measure how the current DeepSeek API classifies a bounded set of safe request failures, then separate three kinds of evidence:

1. DeepSeek's officially documented status definitions.
2. Responses observed from the live API during this dated run.
3. Retry behavior verified with deterministic local fault injection.

## Live test window

- First request: 2026-07-27T07:50:34.922Z
- Last request: 2026-07-27T07:52:31.539Z
- Endpoint origin: `https://api.deepseek.com`
- Valid control model: `deepseek-v4-flash`
- Thinking: disabled
- Maximum output: 8 tokens
- Transport: direct HTTP
- Redirects: rejected
- Request order: sequential
- Automatic retries: disabled

The run contained 18 requests across 15 distinct scenarios. Four requests repeated the no-body case and returned the same status, content type, body length and body hash.

## Safety boundary

The test did not:

- deplete or modify the account balance to force 402;
- create a burst large enough to force 429;
- attempt to cause 500 or 503;
- publish the temporary API key, authorization header, balance, account identifiers or request IDs;
- send private or user-derived prompts;
- store hidden reasoning.

The only successful inference prompt was synthetic and asked for `OK`.

## Interpretation rules

- A status is called **officially documented** only when it appears on DeepSeek's current Error Codes page.
- A result is called **observed** only when it appears in `live-results-summary.json`.
- A scenario is called **locally simulated** only when it runs against the repository's deterministic fault-injection harness.
- A client timeout, DNS failure or serialization failure is not labeled a DeepSeek HTTP status unless a real HTTP response exists.
- `error.code` inside a JSON response is reported separately from the numeric HTTP status.
- The absence of 422 in this bounded matrix is not evidence that DeepSeek never returns 422.

## Reproduction

The public harness requires the tester to provide a fresh API key through an environment variable. It contains a request ceiling, sequential execution, tiny successful controls, redirect rejection and output redaction. Live execution is opt-in.

The local retry laboratory needs no credential and sends no traffic to DeepSeek.

## Artifact scan

Before publication, generated artifacts must be rejected if they contain an authorization header, a bearer value, an unredacted API-key pattern, balance amounts, environment dumps or account identifiers.
