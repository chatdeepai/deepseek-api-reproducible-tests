# Observability media plan

All public media must be English-only, 1600 x 900, free of credentials, account
data, provider IDs, raw prompts, raw outputs, reasoning text, tool payloads, and
local paths.

| # | Filename stem | Evidence class | WordPress alt text | Caption |
|---|---|---|---|---|
| 01 | `01-deepseek-observability-reference-architecture` | Conceptual | DeepSeek observability reference architecture connecting application spans, safe logs, metrics, evaluations, dashboards, and alerts | A production DeepSeek observability path keeps the model call inside the application trace while sending redacted, versioned signals to a separate telemetry pipeline. |
| 02 | `02-deepseek-signal-ownership-map` | Conceptual | Map of DeepSeek provider fields, application-derived metrics, evaluator signals, and account-level evidence | A signal ownership map prevents application estimates from being presented as DeepSeek-returned facts. |
| 03 | `03-privacy-safe-logging-pipeline` | Conceptual | Privacy-safe DeepSeek logging pipeline with allowlisted metadata, redaction gates, sampling, retention, and access controls | A safe event is constructed from approved metadata; raw request and response objects never enter the logging path. |
| 04 | `04-streaming-timing-state-machine` | Conceptual method diagram | DeepSeek streaming timing state machine from request start through first response chunk, first parsed event, first content, finish reason, final usage, and DONE | Measure the first response-stream chunk, first parsed JSON event, and first visible content separately; close the span only after terminal state and usage handling. |
| 05 | `05-token-cache-cost-math` | Conceptual calculation diagram | DeepSeek token cache and estimated cost calculation using provider usage fields and a dated external price snapshot | Provider usage is measured; cost is derived from usage and a versioned price snapshot, then reconciled with billing. |
| 06 | `06-tool-agent-trace-waterfall` | Conceptual | DeepSeek tool and agent trace waterfall covering model request, tool proposal, argument validation, authorization, execution, continuation, and final validation | An agent trace must show the application-controlled gates between a model's tool proposal and any real side effect. |
| 07 | `07-dashboard-alert-topology` | Conceptual | DeepSeek observability dashboard and alert topology for reliability, streaming, tokens, cache, cost, quality, tools, and telemetry health | Dashboards summarize bounded labels; exemplars and correlation IDs connect an alert to a privacy-safe trace. |
| 08 | `08-sanitized-live-results-dashboard` | Sanitized live evidence | Sanitized DeepSeek observability live results dashboard showing eight cases, usage, cache evidence, quality detection, and privacy audit | Sanitized live evidence from July 27, 2026 UTC. Timings are individual observations, not a provider benchmark or SLA. |

## WordPress rules

- Image 01 becomes the featured image.
- Every attachment receives a human title, exact alt text, caption, and an English
  description that identifies its evidence class.
- Images are inserted as full-size Gutenberg image blocks with attachment IDs.
- No WordPress tags are created or assigned.
