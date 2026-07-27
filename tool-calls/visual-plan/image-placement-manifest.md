# DeepSeek Tool Calls Image Placement Manifest

Status: final visual set approved after evidence, privacy, pixel-level, and manifest-hash QA on July 27, 2026.

All eight visuals will use a 1600 × 900 canvas, English text only, accessible contrast, and a consistent editorial design. Every numerical result, HTTP status, model name, case count, and timestamp must be read from the final sanitized live-test summary at render time. Do not hard-code an unverified result.

No visual may show an API key, credential fragment, Authorization header, account identifier, balance, profile menu, browser session, provider account interface, raw request body containing sensitive data, or unredacted provider response. Transcript and console-style panels must be purpose-built reconstructions from sanitized evidence, never account screenshots.

| # | Filename | Article placement | Exact alt text | Exact caption | Evidence and privacy boundary |
|---:|---|---|---|---|---|
| 1 | `01-deepseek-tool-call-lifecycle.png` | After the introduction and key findings; use as the featured image too | DeepSeek tool-call lifecycle from tool definition through model request, application execution, tool-result replay, and final answer | A tool call is an application-controlled loop: define tools, let the model request a function, validate and execute it outside the model, replay the result, and request the final answer. | Conceptual lifecycle only. Show synthetic function names and neutral data. Do not imply that DeepSeek executes tools itself. |
| 2 | `02-tool-choice-live-matrix.png` | Immediately after the `tool_choice` comparison table | DeepSeek tool_choice live-test matrix comparing auto, required, named-tool, and none behaviors | The live matrix separates what each `tool_choice` setting requested from what the tested model actually returned. Read every status and outcome from the sanitized dated test summary. | Dated live evidence. Show case IDs, requested mode, response class, and pass/fail only. Omit raw prompts, raw arguments, request headers, and provider error messages. |
| 3 | `03-thinking-vs-non-thinking-transcript.png` | After the section comparing non-thinking and thinking tool calls | DeepSeek non-thinking versus thinking tool-call transcript showing where reasoning_content appears and what must be replayed | The sanitized side-by-side transcript highlights the extra reasoning field in thinking mode and the message fields the application must preserve for the next request. | Reconstructed transcript from allowlisted fields only. Replace tool arguments and tool output with short synthetic values. Never publish hidden reasoning text; show only field presence, length, or a redacted marker. |
| 4 | `04-reasoning-content-replay-control.png` | After the replay-contract explanation and the safety-gate result table | DeepSeek reasoning_content replay contract compared with a live thinking tool call that was truncated and safety-gated before replay | The initial thinking tool call returned HTTP 200 with `reasoning_content` present, but its arguments were incomplete at the 96-token cap. Both replay branches were safety-skipped, so this run did not produce a 200-versus-400 continuation comparison. | Official replay contract plus a dated non-execution result. Do not publish reasoning text, request headers, raw bodies, provider error text, or imply that either replay branch ran. |
| 5 | `05-strict-beta-schema-validation.png` | After the strict-mode beta schema validation section | DeepSeek strict beta schema validation results for valid and invalid tool argument schemas | The strict beta panel distinguishes provider-side schema acceptance from application-side validation of the arguments produced by the model. | Use sanitized schema fragments with generic fields such as `city` and `unit`. Show exact observed status classes and validator outcomes from the final summary. Do not claim universal JSON Schema support beyond tested keywords. |
| 6 | `06-multi-tool-loop-timeline.png` | After the multi-tool or parallel-tool execution walkthrough | DeepSeek multi-tool loop timeline showing multiple model requests, application execution, tool-result replay, and final completion | The timeline maps each observed tool request to application execution and a matching `tool_call_id` before the final completion is requested. | Reconstruct the sequence from sanitized event metadata: turn number, tool count, tool-call aliases, status, and finish reason. Use aliases such as T1 and T2, never provider-generated IDs or raw arguments. |
| 7 | `07-argument-validation-security-boundary.png` | In the production safety section, immediately after the argument-validation checklist | Application-side DeepSeek tool argument validation and security boundary before external side effects | Treat model-produced arguments as untrusted input: parse, validate, authorize, constrain, and log safely before any external side effect is allowed. | Security architecture diagram only. Use a synthetic rejected request and a synthetic approved request. No credentials, account interface, real endpoint, personal data, shell command, or destructive example. |
| 8 | `08-methodology-results-dashboard.png` | At the end of the methodology, reproducibility, and limitations section | DeepSeek Tool Calls live-test methodology and results dashboard with pass counts, models, controls, and privacy guardrails | The dashboard summarizes the bounded dated run, including tested models, logical cases, expected controls, serial or concurrent execution, retries, and evidence-redaction rules. | Populate only from the final sanitized summary and independent audit. Include the UTC test date and limitations. Do not show latency as a service-level benchmark, raw responses, generated reasoning, credentials, balances, or account identifiers. |

## Visual specifications

- Canvas: 1600 × 900 pixels for both SVG source and PNG output.
- Output pair for each item: matching `.svg` and `.png` basenames.
- Featured image: item 1.
- Body image size: full width within the article content column.
- Link destination: none.
- Text size: minimum 26 px for body labels and 44 px for primary headings.
- Contrast: target WCAG AA for all essential text and status labels.
- Status encoding: pair color with a written label or icon; never rely on color alone.
- Date label: use the exact UTC test date from the sanitized final summary on visuals 2, 4, 5, 6, and 8.
- Brand treatment: site name may appear as a small editorial label; do not imitate the DeepSeek product interface or suggest provider endorsement.

## Evidence binding rules

1. Treat the live harness result file as the sole source for statuses, counts, timings, model names, finish reasons, tool-call counts, and validation outcomes.
2. Use the independent audit only to confirm consistency and privacy, not to invent additional live outcomes.
3. If a requested comparison was not completed, label it `Not tested` rather than inferring support.
4. Use `Expected control` for deliberately invalid requests that returned the planned error; do not label them as product failures.
5. For thinking mode, publish only the presence or absence of `reasoning_content`, its permitted metadata, and replay behavior. Never publish hidden reasoning text.
6. For strict mode, distinguish HTTP/schema acceptance from semantic correctness of model-generated arguments.
7. For multi-tool loops, preserve ordering and matching relationships with aliases, but discard provider-generated tool-call IDs.
8. Every final SVG must pass automated scans for Arabic characters, credential-like strings, account data, hidden off-canvas text, and accidental raw payloads.

## Publication QA checklist

- [ ] All eight SVG files use `viewBox="0 0 1600 900"`.
- [ ] All eight PNG files are exactly 1600 × 900.
- [ ] Every PNG has been inspected at full resolution for clipping, overlap, and legibility.
- [ ] All displayed live values match the final sanitized summary.
- [ ] No hidden reasoning text is present.
- [ ] No credential, credential fragment, header, balance, account identifier, or provider account UI is present.
- [ ] Exact alt text and captions above are used in WordPress.
- [ ] Featured image is item 1.
- [ ] WordPress tags remain unused.
