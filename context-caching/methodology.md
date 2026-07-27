# Methodology: DeepSeek Context Caching

## Scope

These tests measured the cache-token fields returned by the hosted DeepSeek Chat Completions API. They did not inspect internal provider infrastructure and did not test a gateway or third-party cloud host.

## Test window

- UTC: July 27, 2026, 06:24–06:31
- Local equivalent: July 26, 2026, PDT
- Endpoint: `https://api.deepseek.com/chat/completions`
- Model: `deepseek-v4-flash`
- Thinking: disabled
- Streaming: disabled
- Output limit: short, to keep input-cache measurements dominant
- Content: deterministic synthetic English only

## Controls

1. Exact extension: send a long synthetic prefix, then resend that complete context and append one turn.
2. Divergent suffix: send `A+B`, `A+C`, and `A+D` with the same long byte-for-byte `A`.
3. Stable versus volatile first line: repeat a stable long prefix five times, then repeat a similarly sized prefix whose first line changes every time.
4. `user_id` isolation: warm a prefix for synthetic user A, try the same prefix for synthetic user B, warm B, then return to A.
5. Prefix-length matrix: cold and warm pairs from 92 to 5,172 prompt tokens.
6. Mutation controls: change one synthetic record in the middle or near the end.

## Metrics

The benchmark recorded HTTP status, UTC timestamp, model, total prompt tokens, `prompt_cache_hit_tokens`, `prompt_cache_miss_tokens`, completion tokens, finish reason, and total non-streaming response time.

Cache hit rate:

```text
prompt_cache_hit_tokens / prompt_tokens * 100
```

Cache-aware input cost:

```text
hit_tokens / 1,000,000 * cache_hit_price
+ miss_tokens / 1,000,000 * cache_miss_price
```

## Safety

The temporary API key, Authorization header, account balance, prompt text, response text, and raw user IDs are not included in the public files. No personal or customer data was used.

## Interpretation

DeepSeek describes context caching as automatic and best effort. The findings are bounded observations for one account, endpoint, model, payload family, and test window. They are not a promise that a future request will hit, that a given cache entry will still exist, or that another provider exposes the same behavior.
