# DeepSeek API Reproducible Tests

This public evidence repository contains bounded, reproducible live tests used by [Chat-Deep.ai](https://chat-deep.ai/) to verify its independent DeepSeek API guides.

## Current test suite

- [DeepSeek Context Caching](./context-caching/)
  - exact-extension cold/warm control;
  - stable versus volatile prefix comparison;
  - `user_id` isolation control;
  - prefix-length matrix;
  - mutation controls;
  - redacted JSON and CSV result summaries.
- [DeepSeek Thinking Mode](./thinking-mode/)
  - default, enabled, and disabled controls on V4 Flash and V4 Pro;
  - bounded `high` versus `max` reasoning-effort evidence;
  - output-budget exhaustion controls;
  - ordinary and tool-call history compatibility probes;
  - separate streaming `reasoning_content` and `content` measurements;
  - JSON Output and model-routing checks;
  - redacted JSON and CSV result summaries plus editable visuals.

## Evidence policy

- Tests use synthetic English data only.
- API keys, Authorization headers, account balances, personal data, prompt text, and response text are excluded from published result files.
- A result describes one account, endpoint, model, payload set, and time window. It is not a service-level guarantee.
- Provider behavior, model IDs, and prices can change. Each suite records its test date and links to the relevant official documentation.

Chat-Deep.ai is an independent publication and is not affiliated with DeepSeek.
