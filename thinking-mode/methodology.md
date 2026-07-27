# Methodology and interpretation

## Test date and scope

The live requests summarized in this folder were sent on July 27, 2026 UTC to the official DeepSeek Chat Completions endpoint. All prompts and synthetic data were English. The live `/models` response listed `deepseek-v4-flash` and `deepseek-v4-pro`.

The study was deliberately bounded. It was designed to inspect request and response behavior, not to rank model intelligence. Unless a row explicitly says otherwise, each row represents one request. Latency is therefore descriptive, not a population estimate.

## Safety and redaction

A temporary API key was held only in memory and was never written to a result, image, repository file, or article. Raw authorization headers, account balance, private account identifiers, and request IDs were not saved. Raw `reasoning_content` was neither printed nor persisted. The study retained only presence flags, character counts, token usage, and SHA-256 hashes where useful.

## Test controls

### Thinking toggle

The same arithmetic prompt and output constraint were used for all six toggle requests. Each current model was tested with the `thinking` field omitted, explicitly enabled, and explicitly disabled. Answer validity, `reasoning_content` presence, reasoning-token usage, latency, and estimated request cost were recorded.

### Reasoning effort and output budget

A fixed scheduling puzzle was sent to `deepseek-v4-flash`. The first matrix used a 512-token output cap to expose budget exhaustion. A second high-versus-max control used a 1,024-token cap so both requests could produce a final answer. `low`, `medium`, and `xhigh` were included because current DeepSeek documentation describes them as compatibility mappings, not as distinct native effort levels.

### Ordinary multi-turn history

The model first acknowledged a synthetic code. The next request asked for that code using three assistant-history variants: the actual prior reasoning, no prior reasoning, and a deliberately long synthetic sentinel in place of prior reasoning. Identical prompt-token counts across the three branches were used as evidence that non-tool prior reasoning was ignored in this bounded control.

### Tool-call history

The model was given one synthetic `lookup_inventory` function and a deterministic tool result for `DEMO-7`. Each model completed a correctly shaped branch that replayed `content`, `reasoning_content`, and `tool_calls`, and a control branch that omitted prior `reasoning_content`.

DeepSeek's official Thinking Mode guide states that omitting reasoning after a tool call returns HTTP 400. The July 27 controls returned HTTP 200 in both branches on both current models. Additional Flash controls also accepted a missing `content` field and a null `content` value. This is a dated compatibility observation, not permission to ignore the documented contract. Production examples in the article preserve all documented fields.

### Streaming

One streaming request accumulated `delta.reasoning_content` and `delta.content` independently. Only chunk counts, first-observed indexes, character count, a reasoning hash, final content, and usage were retained.

### JSON Output

One minimal thinking-enabled JSON request returned HTTP 200 with an empty final content field. A retry with an explicit system instruction returned valid JSON, as did a non-thinking control. This reproduces the official warning that JSON Output can occasionally return empty content.

### Model aliases

The live models listing exposed only the two V4 IDs. Separate completion probes using `deepseek-chat` and `deepseek-reasoner` were nevertheless accepted and reported `deepseek-v4-flash` as the returned model. The article recommends explicit V4 IDs because discoverability and alias-routing behavior do not match.

## Cost calculation

Estimated cost uses the official pricing table captured on the test date:

`(cache_hit_input_tokens × hit_price + cache_miss_input_tokens × miss_price + completion_tokens × output_price) / 1,000,000`

Reasoning tokens are included inside completion-token usage and are therefore charged at the model's output-token rate. Prices can change; readers should always recheck the official pricing page.

## Reproducibility limits

- Model output and reasoning length are nondeterministic.
- Client-side latency includes network conditions at one location.
- A single passing or failing request does not guarantee future behavior.
- The API can tighten validation or change alias routing without preserving these observations.
- The public harness uses bounded synthetic prompts and never persists chain-of-thought text.
