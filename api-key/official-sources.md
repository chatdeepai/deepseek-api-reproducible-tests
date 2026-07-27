# Official Source Register

Checked for the 2026-07-27 test design. Only first-party DeepSeek documentation and console locations are listed here.

| Source | What it supports in this suite |
|---|---|
| [DeepSeek API quick start](https://api-docs.deepseek.com/) | The documented API host, Bearer authentication pattern, and Chat Completions entry point. |
| [List Models](https://api-docs.deepseek.com/api/list-models) | `GET /models` as the low-cost authentication probe. |
| [Create Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion) | The request shape for the single bounded completion probe. |
| [Get User Balance](https://api-docs.deepseek.com/api/get-user-balance) | `GET /user/balance` and the `is_available` response field. Monetary fields are intentionally excluded from evidence. |
| [DeepSeek API keys console](https://platform.deepseek.com/api_keys) | Authorized creation and revocation of temporary keys outside the test harness. |
| [DeepSeek error codes](https://api-docs.deepseek.com/quick_start/error_codes) | First-party interpretation of common authentication and availability statuses. |
| [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/) | Confirms that model requests can incur token charges; no price is hard-coded in this suite. |

## Source handling

- Official documentation defines the intended request contract.
- Live observations establish only what the test account saw at the recorded timestamp.
- The console is used for key lifecycle actions, but no secret-reveal or balance screenshot should be published.
- Documentation and live behavior can change; a future rerun should record a new source-check date.
