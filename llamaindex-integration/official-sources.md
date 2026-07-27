# Official sources

Reviewed July 27, 2026.

## LlamaIndex package and source

- DeepSeek integration API reference:
  https://developers.llamaindex.ai/python/framework-api-reference/llms/deepseek/
- Official DeepSeek integration package:
  https://pypi.org/project/llama-index-llms-deepseek/
- Official LlamaIndex core package:
  https://pypi.org/project/llama-index-core/
- LlamaIndex repository:
  https://github.com/run-llama/llama_index
- DeepSeek wrapper source:
  https://github.com/run-llama/llama_index/blob/main/llama-index-integrations/llms/llama-index-llms-deepseek/llama_index/llms/deepseek/base.py
- DeepSeek model metadata source:
  https://github.com/run-llama/llama_index/blob/main/llama-index-integrations/llms/llama-index-llms-deepseek/llama_index/llms/deepseek/utils.py
- OpenAI-like wrapper source:
  https://github.com/run-llama/llama_index/tree/main/llama-index-integrations/llms/llama-index-llms-openai-like
- LlamaIndex LLM API reference:
  https://developers.llamaindex.ai/python/framework-api-reference/llms/
- Vector store index API reference:
  https://developers.llamaindex.ai/python/framework-api-reference/indices/vector/
- Query engine API reference:
  https://developers.llamaindex.ai/python/framework-api-reference/query_engine/

## DeepSeek provider documentation

- Current model and pricing table:
  https://api-docs.deepseek.com/quick_start/pricing/
- API introduction and compatibility:
  https://api-docs.deepseek.com/
- Thinking mode:
  https://api-docs.deepseek.com/guides/thinking_mode/
- JSON output:
  https://api-docs.deepseek.com/guides/json_mode/
- Tool calls:
  https://api-docs.deepseek.com/guides/tool_calls/
- Error codes:
  https://api-docs.deepseek.com/quick_start/error_codes/
- Rate limit and isolation:
  https://api-docs.deepseek.com/quick_start/rate_limit/

## Version facts

On the review date, official package metadata reported:

- `llama-index-core` 0.14.23;
- `llama-index-llms-deepseek` 0.3.0;
- Python 3.10 or newer for the DeepSeek integration.

The installed dependency resolution used for the reproducibility suite also
contained `llama-index-llms-openai-like` 0.5.3,
`llama-index-llms-openai` 0.6.26, `openai` 2.48.0, and `pydantic` 2.13.4.

## Dated reproducibility evidence

The article's measured claims are bound to:

- `results/live-summary.json`, completed July 27, 2026 at 17:57 UTC;
- `results/privacy-audit.json`, status `pass`;
- 16 of 16 planned provider requests, concurrency one, zero automatic retries, and a 30-second default timeout;
- 22 of 22 passing offline checks.

The live summary contains only allowlisted structural fields. It records 12
successful cases, two accepted dated-alias probes, one expected invalid-model
provider error, and one unexpected `structured_predict` `ValueError`. The
initial tool response contained one call with the expected name, but it did not
meet the fixture's exact argument contract; this is not a general
schema-invalid claim. The continuation succeeded after the matching identifier
was replayed in memory.
