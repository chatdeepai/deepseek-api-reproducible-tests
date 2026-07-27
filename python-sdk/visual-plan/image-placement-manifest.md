# DeepSeek Python SDK Image Placement Manifest

Status: final visual set. Items 1–7 are conceptual production diagrams. Item 8 is bound to the sanitized Python live summary and passing post-run privacy audit dated July 27, 2026.

All eight visuals use a 1600 × 900 canvas, English text only, accessible contrast, and a neutral editorial design. The set is intentionally Python-specific: client ownership, synchronous versus asynchronous execution, configuration validation, stream assembly, `extra_body` serialization, Python-side validation, typed exceptions, and reproducible testing. It must not repeat the broader OpenAI SDK compatibility article’s cross-language setup comparison or its Python-versus-Node live matrix.

No visual may show an API key, credential fragment, Authorization header, account identifier, balance, profile menu, browser session, provider account interface, raw prompt, generated response text, hidden reasoning text, raw tool arguments, raw tool output, provider request ID, provider tool-call ID, local username, local path, or unredacted error message.

| # | Filename | Article placement | Exact alt text | Exact caption | Evidence and privacy boundary |
|---:|---|---|---|---|---|
| 1 | `01-python-sdk-production-architecture.png` | After the introduction and key findings; use as the featured image too | Python DeepSeek production architecture from validated settings through sync or async clients to application controls | A production Python integration keeps configuration, client lifetime, API transport, response validation, and application policy in separate layers. Synchronous and asynchronous clients share the same security boundary but serve different execution models. | Conceptual architecture only. Show generic application layers and a public API boundary. Do not show a credential value, package version, live status, latency, provider interface, or claim complete API parity. |
| 2 | `02-python-sync-vs-async-client-choice.png` | Immediately after the section choosing between synchronous and asynchronous clients | Python sync versus async DeepSeek client decision guide for scripts, workers, web applications, and bounded concurrency | Use a synchronous client for straightforward sequential programs and an asynchronous client inside an existing event loop. Reuse a bounded client, await asynchronous calls, and close owned resources explicitly. | Python execution guidance only. Do not render benchmark numbers or suggest that async execution makes the provider faster. Use neutral workloads such as script, worker, and ASGI application; do not show real infrastructure or user data. |
| 3 | `03-python-configuration-lifecycle.png` | After environment setup, configuration, timeouts, and client construction | Python DeepSeek configuration lifecycle from environment variable through validated settings, client factory, request scope, and client close | Read the credential at runtime, validate non-secret settings once, construct the appropriate client at a clear ownership boundary, and close it when that owner shuts down. | Conceptual lifecycle only. Show an environment-variable name without a value, a generic API origin label, timeout and retry policy labels without unverified numbers, and no terminal history, local path, username, or package version. |
| 4 | `04-python-streaming-state-machine.png` | After the Python streaming implementation and cancellation guidance | Python DeepSeek streaming state machine from awaited request through delta assembly, terminal validation, cancellation, and cleanup | A safe Python stream consumer enters the stream, routes allowlisted deltas, assembles state by choice and tool index, waits for a terminal condition, validates the result, and closes or cancels cleanly. | Conceptual state machine only. Do not show streamed text, hidden reasoning, raw event bodies, live event counts, provider IDs, token counts, or latency. Any dated event metadata must wait for the final sanitized summary. |
| 5 | `05-python-thinking-extra-body-serialization.png` | After the Python thinking-mode request and response-handling section | Python extra_body serialization path for DeepSeek thinking configuration and reasoning field-presence handling | Python passes the provider-specific thinking object through `extra_body`; the application verifies the outgoing field path and records only whether permitted response fields are present. | Conceptual serializer and privacy boundary only. Show synthetic field names and enabled or disabled branches as request shapes, not live outcomes. Never render reasoning text, prompts, raw request bodies, generated content, or an unverified SDK-version claim. |
| 6 | `06-python-json-tool-validation-pipeline.png` | After the structured JSON and tool-calling production section | Python validation pipeline for DeepSeek JSON responses and tool calls using parsing, schema checks, authorization, and safe execution | Treat model-produced JSON and tool arguments as untrusted input: parse them, validate the expected Python schema, authorize the requested operation, constrain side effects, and replay only a sanitized result when required. | Conceptual application-control diagram. Use synthetic fields and aliases such as T1. Do not show raw model output, real tool arguments, external account data, shell commands, destructive actions, provider IDs, or a live pass claim. |
| 7 | `07-python-typed-error-retry-tree.png` | After typed exceptions, retry policy, and troubleshooting | Python typed exception and retry decision tree for DeepSeek authentication, validation, rate-limit, connection, and availability failures | Classify the Python SDK exception before acting: stop on credential or request defects, apply a bounded policy only to explicitly transient conditions, and preserve idempotency before retrying side effects. | Conceptual decision tree only. Use sanitized error categories and safe actions, not raw provider messages or stack traces. Exact exception-class names and retry behavior must match the pinned tested SDK before publication; do not invent status counts or delay values. |
| 8 | `08-python-sdk-methodology-results-dashboard.png` | At the end of the methodology, reproducibility, and limitations section | DeepSeek Python SDK test methodology and results dashboard covering runtime, package version, live cases, requests, retries, concurrency, observed states, and privacy controls | The dashboard summarizes a bounded dated Python study, including the pinned runtime and package, exercised sync and async behaviors, request budget, HTTP outcomes, stream metadata, the async tool loop, concurrency, retries, and privacy controls. It is not a service-level benchmark. | Dated live evidence from `results/live-summary.json` plus the passing post-run audit. Show only sanitized aggregate counts, typed error metadata, permitted field-presence states, event counts, finish states, and synthetic alias T1. Omit credentials, balances, account identifiers, prompts, responses, reasoning text, raw errors, provider IDs, and latency comparisons. |

## Visual specifications

- Canvas: 1600 × 900 pixels for both SVG source and PNG output.
- Output pair for each item: matching `.svg` and `.png` basenames.
- Featured image: item 1.
- Body image size: full width within the article content column.
- Link destination: none.
- Text size: minimum 26 px for essential body labels and 44 px for primary headings.
- Contrast: target WCAG AA for all essential text and state labels.
- State encoding: pair color with a written state, action, or icon; never rely on color alone.
- Brand treatment: use neutral editorial layers and a small site label. Do not imitate DeepSeek, OpenAI, Python, a terminal, an IDE, or a provider account interface.
- Date label: item 8 must use the exact UTC test date from the final sanitized summary. Items 1–7 must be labeled as conceptual method diagrams and must not imply dated observations.

## Scope and cannibalization boundary

1. This page owns Python production structure: sync and async client selection, event-loop safety, client lifetime, configuration validation, timeouts, Python parsing and validation, typed exception handling, and Python test organization.
2. The OpenAI SDK compatibility page owns cross-language Python-versus-Node comparisons, transport compatibility, and its dated mixed-language case matrix. Do not repeat that matrix here.
3. The Thinking Mode page owns the complete DeepSeek thinking contract and live thinking benchmark. Visual 5 explains only Python `extra_body` placement and privacy-safe field handling.
4. The Tool Calls page owns complete tool-choice, strict-schema, replay, and multi-tool benchmarks. Visual 6 explains only the Python application validation boundary.
5. The JSON Output page owns detailed structured-output reliability tests. Visual 6 shows only the production validation pipeline.
6. The Error Codes and Retries pages own provider-wide status catalogs and retry experiments. Visual 7 explains how Python code routes a typed exception into a safe policy.

## Evidence binding rules

1. Items 1–7 may contain methods, component names, lifecycle states, and synthetic examples only. They may not contain live statuses, counts, versions, dates, timings, model names, pass rates, event counts, token counts, request IDs, or provider outputs.
2. Any exact Python package version, Python runtime version, exception-class inventory, request outcome, model alias, or serializer result must come from the final pinned environment and sanitized evidence.
3. Label official request contracts as `Documented contract` and test-harness observations as `Dated observation`; never merge them into one success claim.
4. If a Python behavior is not exercised, label it `Not tested`. Do not infer support from the cross-language OpenAI SDK run.
5. For async guidance, distinguish event-loop compatibility and resource ownership from throughput or provider performance.
6. For thinking mode, publish only request field placement and permitted response field-presence metadata. Never publish reasoning text.
7. For streaming, publish only allowlisted event classes, completion state, counts, and validation booleans after sanitized evidence exists.
8. For tools, replace provider-generated IDs with deterministic aliases and never publish raw arguments or tool output.
9. For errors, retain only typed class, sanitized category, request stage, expected-control label, and retry-safety decision. Discard raw messages, headers, bodies, and local stack paths.
10. Item 8 is bound to the final evidence: exact UTC date, Python and package versions, model scope, logical-case inventory, request count and cap, skipped cases, HTTP outcome counts, concurrency, automatic retries, expected controls, observed stream counts and finish states, tool-loop state, and the passing privacy audit.

## Publication QA checklist

- [x] All rendered SVG files use `viewBox="0 0 1600 900"`.
- [x] All rendered PNG files are exactly 1600 × 900.
- [x] Every PNG is inspected at full resolution for clipping, overlap, and legibility.
- [x] Items 1–7 contain no numerical live-result or package-version claims.
- [x] Item 8 uses only the final sanitized live summary and passing post-run audit.
- [x] No hidden reasoning, prompt, generated response, raw tool argument, raw tool result, or provider ID appears.
- [x] No credential, credential fragment, header, balance, account identifier, provider account UI, local username, or local path appears.
- [x] Every rendered SVG passes scans for Arabic characters, mojibake, credential-like strings, off-canvas text, and accidental raw payloads.
- [ ] Exact alt text and captions above are used when the images are uploaded to WordPress.
- [ ] Featured image is item 1.
- [ ] WordPress tags remain unused.
