# OpenAI SDK with DeepSeek Image Placement Manifest

Status: visual plan only. Do not create final images from this plan until the sanitized live-test summary is available.

All eight visuals will use a 1600 × 900 canvas, English text only, accessible contrast, and a consistent editorial design. The visuals must distinguish official SDK or DeepSeek documentation from dated original observations. No visual may imply complete OpenAI API parity merely because an OpenAI SDK can send a compatible request.

Do not show an API key, credential fragment, Authorization header, account identifier, balance, profile menu, browser session, provider account interface, raw prompt, raw generated content, raw reasoning, provider request ID, provider tool-call ID, or unredacted error message. No numerical live result, package version, HTTP outcome, latency, token count, case count, retry count, or concurrency value may be rendered until it is supplied by the final sanitized evidence file.

| # | Filename | Article placement | Exact alt text | Exact caption | Evidence and privacy boundary |
|---:|---|---|---|---|---|
| 1 | `01-openai-sdk-deepseek-compatibility-stack.png` | After the introduction and key findings; use as the featured image too | OpenAI SDK to DeepSeek compatibility stack from application code through SDK transport to the DeepSeek API | The OpenAI SDK can act as the client transport for a DeepSeek integration when the application supplies the correct credential, API origin, model, and provider-specific request fields. Compatibility must still be verified feature by feature. | Conceptual architecture only. Show generic application and transport layers, not provider interfaces or live outcomes. Do not suggest that OpenAI operates, hosts, or endorses DeepSeek. |
| 2 | `02-python-vs-node-configuration.png` | After the paired Python and Node.js setup examples | Side-by-side Python and Node.js OpenAI SDK configuration for DeepSeek using environment variables and a custom base URL | Both clients keep the credential outside source code and configure the OpenAI SDK to send requests to the DeepSeek API origin. Exact syntax and package-version notes must match the tested environments. | Use synthetic code fragments, a placeholder environment-variable name, and the documented public API origin only. Never show a credential value, terminal history, local path, username, or unverified package version. |
| 3 | `03-openai-sdk-live-case-matrix.png` | Immediately after the article’s complete live-results table | Live OpenAI SDK with DeepSeek case matrix for models, chat, thinking, streaming, JSON, tool calls, errors, and legacy aliases | The live matrix separates transport success, SDK parsing, DeepSeek-specific behavior, and whether each dated expectation was met. It should reveal partial compatibility rather than compressing every result into a single pass or fail label. | Populate exclusively from the final sanitized summary. Show case aliases, feature labels, status classes, parser outcomes, and limitations only. Omit prompts, generated text, raw bodies, headers, provider messages, and IDs. |
| 4 | `04-thinking-field-serialization.png` | After the DeepSeek thinking-mode configuration and response-handling section | OpenAI SDK serialization path for DeepSeek thinking fields in Python and Node.js requests | Provider-specific thinking fields must survive SDK serialization and reach the DeepSeek request in the intended location. Response handling should record field presence without exposing reasoning text. | Combine a conceptual wire-shape diagram with sanitized field-presence evidence. Do not display hidden reasoning, raw request JSON, generated content, credentials, or an unsupported claim about every SDK version. |
| 5 | `05-streaming-assembly.png` | After the streaming implementation and parser guidance | OpenAI SDK streaming assembly for DeepSeek text, reasoning metadata, tool-call deltas, finish state, and usage | A safe stream consumer assembles deltas by choice and tool index, waits for a terminal state, and validates complete content or arguments before use. Keep-alive events and optional fields must be handled explicitly. | Reconstruct the flow from allowlisted event metadata only. Do not publish streamed text, reasoning, raw tool arguments, raw event bodies, provider IDs, or live event counts until supplied by the final summary. |
| 6 | `06-tool-round-trip.png` | After the tool-calling round-trip walkthrough | OpenAI SDK DeepSeek tool-call round trip from model request through application validation and tool-result replay | The application validates model-produced arguments, executes an approved adapter, preserves the assistant message, matches sanitized tool-call aliases, and requests the final response. | Use synthetic function names and aliases such as T1 and T2. Do not show provider-generated IDs, raw arguments, raw tool results, hidden reasoning, external side effects, or a success claim before live evidence exists. |
| 7 | `07-error-mapping.png` | After the SDK exception handling, retry, and troubleshooting section | OpenAI SDK exception mapping for DeepSeek authentication, balance, validation, rate-limit, and availability responses | Interpret an SDK exception using the HTTP category, parsed error class, request stage, and retry safety. Retry only explicitly transient conditions and never expose provider messages or credentials in logs. | Conceptual mapping plus sanitized dated status classes after testing. Do not show raw provider error text, stack traces containing local paths, account balance values, request IDs, headers, or invented retry behavior. |
| 8 | `08-openai-sdk-methodology-results-dashboard.png` | At the end of the methodology, reproducibility, and limitations section | OpenAI SDK with DeepSeek test methodology and results dashboard covering package versions, request budget, cases, concurrency, retries, and privacy controls | The dashboard summarizes the bounded dated study, including tested SDK environments, models, request budget, live and offline cases, concurrency, retries, and evidence-redaction rules. It is not a service-level benchmark. | Populate only from the final sanitized summary and its independent audit. Include the UTC test date and scope. Do not show credentials, balances, account identifiers, raw responses, or numerical values not present in the source evidence. |

## Visual specifications

- Canvas: 1600 × 900 pixels for both SVG source and PNG output.
- Output pair for each item: matching `.svg` and `.png` basenames.
- Featured image: item 1.
- Body image size: full width within the article content column.
- Link destination: none.
- Text size: minimum 26 px for body labels and 44 px for primary headings.
- Contrast: target WCAG AA for all essential text and status labels.
- Status encoding: pair color with a written label or icon; never rely on color alone.
- Brand treatment: use neutral editorial layers and small site branding; do not imitate either provider’s product interface.
- Date label: use the exact UTC test date from the final evidence on visuals 3 through 8 where live observations appear.

## Evidence binding rules

1. Treat the final sanitized test summary as the sole source for every package version, model name, status, case count, token count, event count, timing, concurrency value, retry value, and pass or limitation label.
2. Use first-party documentation to describe intended request contracts, but label those elements `Documented contract` rather than `Live result`.
3. Label observations from the test harness `Dated observation` and include the UTC test date.
4. If a feature was not exercised, label it `Not tested`; do not infer compatibility from a neighboring feature.
5. Distinguish transport success from SDK parsing, semantic completeness, and application validation.
6. Treat intentionally invalid requests as expected controls when the final summary identifies them that way.
7. Never publish reasoning text. Show only permitted field-presence, field-length, or replay-state metadata.
8. Replace provider request IDs and tool-call IDs with deterministic aliases before publication.
9. For streaming, publish only allowlisted event types, completion state, counts, and validation booleans.
10. Every final SVG must pass automated scans for Arabic characters, credential-like strings, account data, hidden off-canvas text, and accidental raw payloads.

## Required evidence fields before rendering

- UTC test date and environment scope.
- Exact Python and Node.js SDK package versions.
- Tested DeepSeek model names and public API origin.
- Complete logical-case inventory with expected and observed outcomes.
- SDK parsing outcomes for non-streaming, streaming, thinking, tool, and error cases.
- Thinking-field request serialization and response field-presence observations.
- Streaming terminal state, allowlisted event counts, and assembly validation.
- Tool-call alias counts, argument-validation result, replay result, and final completion state.
- Sanitized error categories and retry-safety classification.
- Actual HTTP request count, request budget, concurrency, retries, safety-skipped cases, and offline-test totals.
- Privacy audit confirming that no credentials, raw content, reasoning, IDs, balances, or account data were persisted.

## Publication QA checklist

- [ ] All eight SVG files use `viewBox="0 0 1600 900"`.
- [ ] All eight PNG files are exactly 1600 × 900.
- [ ] Every PNG has been inspected at full resolution for clipping, overlap, and legibility.
- [ ] Every displayed live value matches the final sanitized summary.
- [ ] Documented contracts and dated observations are visually distinct.
- [ ] No hidden reasoning, raw prompt, generated content, raw argument, raw tool result, or provider ID is present.
- [ ] No credential, credential fragment, header, balance, account identifier, provider UI, or local user data is present.
- [ ] Exact alt text and captions above are used when the images are eventually uploaded.
- [ ] Featured image is item 1.
- [ ] No WordPress tags are added.
