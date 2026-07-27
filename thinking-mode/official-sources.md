# Official sources checked

Checked July 27, 2026 UTC.

- [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/)
  - Toggle syntax and default
  - `reasoning_effort` values and compatibility mappings
  - unsupported sampling controls
  - `reasoning_content` history rules
  - tool-call replay contract
- [Create Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion/)
  - Request and response fields
  - current explicit model IDs
  - `thinking`, `reasoning_effort`, streaming, tools, and JSON parameters
- [Models and Pricing](https://api-docs.deepseek.com/quick_start/pricing/)
  - current model-level cache-hit input, cache-miss input, and output prices
  - context and maximum output limits
- [Tool Calls](https://api-docs.deepseek.com/guides/tool_calls/)
  - function schema and conversation sequence
- [JSON Output](https://api-docs.deepseek.com/guides/json_mode/)
  - JSON request shape and empty-content warning
- [Oh My Pi integration](https://api-docs.deepseek.com/quick_start/agent_integrations/oh_my_pi/)
  - compatibility flags for tool choice, assistant content, and reasoning replay
- [V4 Preview release](https://api-docs.deepseek.com/news/news260424/)
  - announced model migration and historical alias cutoff

## Evidence hierarchy used in the article

1. The official API contract is the production recommendation.
2. Live controls are labeled as dated observations when current validation differs from the contract.
3. One-request measurements are never generalized into model-wide performance claims.
4. Legacy alias acceptance is reported alongside the contradictory fact that the aliases were absent from the live `/models` listing.
