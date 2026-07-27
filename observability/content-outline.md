# DeepSeek Observability article outline

1. **Evidence-led introduction**
   - Last tested date.
   - Exact definition of DeepSeek observability.
   - Summary of the original eight-case study.
   - Explain that HTTP success, terminal completion, contract validity, quality,
     and cost are separate dimensions.

2. **Quick answer: the minimum production signal set**
   - Reliability, streaming, usage, cost, cache, quality, safety, and tool signals.
   - A compact provider/app/evaluator/source-of-truth table.

3. **Reference architecture**
   - Application boundary.
   - DeepSeek call span.
   - Structured logs.
   - Metrics and exemplars.
   - Evaluations.
   - Collector, storage, dashboard, and incident routing.

4. **What the DeepSeek API actually returns**
   - Requested and returned model.
   - `finish_reason`.
   - `system_fingerprint` presence.
   - Prompt, completion, total, cache-hit, cache-miss, and reasoning tokens.
   - Streaming final usage chunk with `include_usage`.
   - Tool calls, reasoning content, and documented errors.
   - What is not returned: price, your prompt version, tenant, quality, or SLO.

5. **OpenTelemetry mapping**
   - Current GenAI convention names and version caveat.
   - DeepSeek-specific custom attributes where no standard mapping exists.
   - High-cardinality and content-capture rules.
   - TypeScript example with a manual wrapper.

6. **Privacy-safe structured logs**
   - Allowlisted metadata schema.
   - Internal correlation ID.
   - Hash or bucket user/tenant identifiers.
   - Default-deny prompt, output, reasoning, tool arguments, raw errors, and headers.
   - Retention and access controls.

7. **Streaming observability**
   - Request start, first network chunk, first JSON event, first content, terminal
     state, final usage, and cancellation.
   - Ignore SSE keep-alive comments as content.
   - Consume through `[DONE]`.
   - Explain the live stream observation and its limitation.

8. **Tokens, cache, and cost**
   - Provider usage fields.
   - Cache-hit ratio.
   - External dated price table.
   - Per-request estimate and monthly reconciliation.
   - Original repeated-prefix result and cost caveat.

9. **Quality and contract monitoring**
   - HTTP success is not product success.
   - Exact-match, JSON schema, tool schema, citation, groundedness, and human feedback.
   - Sampling rules and evaluator versioning.
   - Original five-word versus six-word detection.

10. **Thinking, tools, and agents**
    - Separate reasoning metadata from final answer.
    - Validate terminal state.
    - Trace each tool request, validation, authorization, execution, and continuation.
    - Never run a tool from model output without application checks.

11. **Errors, retries, timeouts, and concurrency**
    - Classify DeepSeek documented status codes.
    - One retry owner.
    - Local in-flight gauge versus documented account concurrency limits.
    - `user_id` is not a raw identity field.
    - Queue keep-alives and timeout budgets.

12. **Dashboard and alerts**
    - Golden operational panel.
    - Usage/cache/cost panel.
    - Quality/contract panel.
    - Agent/tool panel.
    - Telemetry health panel.
    - Example alert policies as starting templates, not universal thresholds.

13. **Original study**
    - Frozen plan.
    - Results table.
    - Sanitization and privacy audit.
    - Limitations.
    - Public reproducibility package.

14. **Implementation checklist**
    - Staged rollout from safe metadata to evaluated production telemetry.

15. **FAQ**
    - Native OpenTelemetry export.
    - Prompt/response logging.
    - TTFT definition.
    - Usage and price.
    - Cache monitoring.
    - Required alerts.
    - HTTP 200 versus quality success.

16. **Methodology and sources**
    - Official DeepSeek API sources.
    - Official OpenTelemetry GenAI sources.
    - Dated verification and no-SLA disclosure.

