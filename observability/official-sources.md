# Official and primary sources

Checked July 27, 2026 UTC.

## DeepSeek

- Chat Completions API:
  https://api-docs.deepseek.com/api/create-chat-completion
- Models and pricing:
  https://api-docs.deepseek.com/quick_start/pricing/
- Rate limits and `user_id` isolation:
  https://api-docs.deepseek.com/quick_start/rate_limit/
- Error codes:
  https://api-docs.deepseek.com/quick_start/error_codes/
- Context caching:
  https://api-docs.deepseek.com/guides/kv_cache
- Tool calls:
  https://api-docs.deepseek.com/guides/tool_calls
- Thinking mode:
  https://api-docs.deepseek.com/guides/thinking_mode
- Token usage:
  https://api-docs.deepseek.com/quick_start/token_usage/
- Service status:
  https://status.deepseek.com/

## OpenTelemetry

- OpenTelemetry GenAI semantic conventions repository:
  https://github.com/open-telemetry/semantic-conventions-genai
- GenAI metrics:
  https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/gen-ai-metrics.md
- GenAI span definitions:
  https://github.com/open-telemetry/semantic-conventions/blob/main/model/gen-ai/spans.yaml
- OpenTelemetry GenAI observability and content-capture guidance:
  https://opentelemetry.io/blog/2026/genai-observability/
- HTTP header capture security guidance:
  https://opentelemetry.io/docs/specs/semconv/http/http-spans/

## Source-use rules

- DeepSeek sources define provider contracts and current commercial facts.
- OpenTelemetry sources define telemetry naming and privacy guidance.
- OpenTelemetry GenAI conventions remain versioned and under development; the
  article does not freeze one schema URL as timeless.
- No third-party vendor page is used to claim a DeepSeek API field, limit, price,
  SLA, or native telemetry capability.
- Single-run measurements are labeled as dated observations, not benchmarks.

