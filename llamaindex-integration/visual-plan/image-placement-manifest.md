# DeepSeek LlamaIndex Integration Image Placement Manifest

Status: rendered visual set. Items 1-7 are conceptual diagrams. Item 8 is bound to the final sanitized LlamaIndex summary dated July 27, 2026 UTC and the passing publication privacy audit.

All visuals use a 1600 x 900 canvas, English text only, accessible contrast, and a neutral editorial design. The set explains LlamaIndex-specific ownership and control boundaries: document ingestion, nodes, embeddings, indexing, retrieval, response synthesis, wrapper configuration, completion and chat response types, streaming, asynchronous cancellation, structured data, tool authorization, RAG evaluation, error routing, and layered evidence.

No visual may show an API key, credential fragment, Authorization header, account identifier, balance, profile menu, browser session, provider account interface, raw prompt, generated response text, hidden reasoning text, raw tool arguments, raw tool output, provider request ID, provider tool-call ID, trace payload, local username, local path, or unredacted error message. Do not imitate the LlamaIndex, DeepSeek, OpenAI, or any observability-product interface.

| # | Filename | Article placement | Exact alt text | Exact caption | Evidence and privacy boundary |
|---:|---|---|---|---|---|
| 1 | `01-deepseek-llamaindex-integration-architecture.png` | After the opening summary; use as the featured image too | DeepSeek LlamaIndex integration architecture from documents and application input through indexing, retrieval, response synthesis, and the DeepSeek API boundary | LlamaIndex owns ingestion, indexing, retrieval, and response orchestration; DeepSeek supplies model generation; the application still owns data approval, validation, resource limits, and safe observability. | Conceptual architecture only. It separates application input, ingestion, indexing, retrieval, response synthesis, the model boundary, and application controls without implying a dated provider result or endorsement. |
| 2 | `02-llamaindex-dependency-configuration-boundary.png` | After installation and factory configuration | LlamaIndex DeepSeek dependency and configuration boundary separating packages, credentials, model metadata, clients, and application ownership | Pin the integration stack, read the credential at runtime, choose provider mode explicitly, correct stale wrapper metadata deliberately, and inject the configured LLM at a clear owner boundary. | Conceptual dependency and configuration lifecycle. It names generic package roles and the environment-variable name without a value. It contains no package version or current-model support claim. |
| 3 | `03-llamaindex-chat-complete-stream-lifecycle.png` | After completion, chat, sync streaming, and async examples | LlamaIndex DeepSeek completion, chat, synchronous streaming, and asynchronous lifecycle with validation, cancellation, and cleanup | Completion and chat share an adapter but return different LlamaIndex response types; streaming must be consumed to a terminal state, and async work needs bounded concurrency and cancellation propagation. | Conceptual method lifecycle only. It shows method families and safe state transitions without provider output, hidden reasoning, event counts, timing, or behavioral-equivalence claims. |
| 4 | `04-llamaindex-structured-output-tool-validation.png` | After structured output and tool validation | LlamaIndex DeepSeek structured output and tool validation pipeline from provider response through parsing, schema checks, authorization, execution, and safe continuation | Provider JSON and tool capabilities do not remove application controls: parse defensively, validate schemas and business rules, authorize every action, and preserve the protocol fields required for continuation. | Conceptual validation pipelines only. They show application gates without raw model data, raw arguments, raw tool output, provider IDs, pass rates, or undocumented support claims. |
| 5 | `05-llamaindex-rag-index-query-pipeline.png` | After the complete RAG example | LlamaIndex RAG pipeline for DeepSeek from approved documents through nodes, embeddings, vector index, retrieval, response synthesis, and source review | Evaluate the pipeline in layers: document approval, chunking, embedding, retrieval, context assembly, DeepSeek generation, and source attribution can each fail independently. | Conceptual RAG and evaluation architecture. It does not publish document content, queries, retrieved text, model output, embedding values, external account data, or benchmark metrics. |
| 6 | `06-llamaindex-error-retry-cancellation-tree.png` | After errors, retries, cancellation, and observability | LlamaIndex DeepSeek error, retry, and cancellation decision tree separating configuration, retrieval, provider, parser, tool, timeout, and cancelled states | Classify the failing layer before acting, retry only bounded transient and idempotent work, and propagate cancellation instead of converting it into another request. | Conceptual classification tree. It contains sanitized categories and safe actions only, with no stack traces, raw error messages, headers, identifiers, retry delay, or success-rate claim. |
| 7 | `07-llamaindex-test-methodology-ladder.png` | At the start of the testing section | LlamaIndex DeepSeek test methodology ladder from offline schemas and retrieval fixtures through wrapper serialization, bounded live cases, and privacy audit | Build confidence in layers: verify schemas and retrieval offline, inspect wrapper serialization against local fixtures, run a bounded serial provider suite, then audit the sanitized evidence before publication. | Conceptual methodology only. It contains no counts, versions, dates, timings, model names, statuses, or pass rates. The result-dashboard state remains explicitly locked. |
| 8 | `08-llamaindex-live-results-dashboard.png` | After the final live-evidence table | DeepSeek LlamaIndex integration live results dashboard covering pinned versions, chat and completion, streaming, JSON, tools, RAG, errors, controls, and privacy audit | The dashboard summarizes the bounded July 27, 2026 UTC LlamaIndex study: 16 of 16 planned serial requests, zero automatic retries, 22 of 22 offline checks, one unexpected structured-prediction error, mixed tool-argument assertions, and a passing privacy audit. It is not a service-level benchmark. | Data-bound and rendered from the final sanitized summary. It distinguishes 12 successful cases, two accepted dated-alias probes, one expected provider error, and one unexpected structured-prediction error. The tool panel states only that the exact fixture argument contract was not met; it does not generalize the arguments as schema-invalid. |

## Visual specifications

- Canvas: 1600 x 900 pixels for both SVG source and PNG output.
- Output pair for each rendered item: matching `.svg` and `.png` basenames.
- Featured image: item 1.
- Body image size: full width within the article content column.
- Link destination: none.
- Text size: minimum 26 px for essential body labels and 44 px for primary headings; smaller supporting text remains high contrast.
- Contrast: target WCAG AA for all essential text and state labels.
- State encoding: pair color with a written state or action; never rely on color alone.
- Brand treatment: use neutral editorial layers and a small site label; do not recreate a provider console, notebook, terminal, IDE, trace viewer, or copied product interface.
- Evidence label: items 1-7 are conceptual method diagrams and must not imply dated observations.
- Item 8 uses the exact UTC test date and values from the final sanitized summary and is labeled as a dated observation rather than a service-level benchmark.

## Scope and duplication boundary

1. This page owns LlamaIndex orchestration: ingestion, nodes, embeddings as a separate dependency, vector indexing, retrieval, query engines, response synthesis, `Settings` versus explicit injection, wrapper metadata, response types, and LlamaIndex-specific testing.
2. The Python SDK page owns the generic Python client lifecycle, typed SDK errors, provider transport, and direct-client production structure.
3. The LangChain page owns runnable composition, LangChain callbacks, chains, tools, agents, and its Python and TypeScript wrapper behavior.
4. The Tool Calls page owns the provider tool protocol and provider-wide tool-choice experiments. Visual 4 explains only the LlamaIndex-to-application validation boundary.
5. The JSON Output page owns provider-wide JSON-mode requirements and reliability tests. Visual 4 explains defensive parsing and application validation.
6. The Evaluation Framework page owns full evaluation datasets, metrics, and release gates. Visual 5 shows only the LlamaIndex RAG checkpoints.
7. The Error Codes and Retries pages own provider-wide status catalogs and retry experiments. Visual 6 shows LlamaIndex-layer classification and safe policy routing.

## Evidence binding rules

1. Items 1-7 may contain methods, component names, lifecycle states, and synthetic labels only. They may not contain live statuses, counts, versions, dates, timings, pass rates, current model names, token counts, request IDs, trace IDs, provider output, or account data.
2. A package version, runtime version, import path, exact class behavior, method result, exception class, provider outcome, or capability claim must come from the final pinned environment and sanitized evidence before publication.
3. Keep documented contracts, local wrapper observations, and dated provider observations separate.
4. If a method or capability is not exercised, label it `Not tested`; do not infer it from the direct SDK, LangChain, or a neighboring model.
5. Distinguish wrapper serialization, provider transport, parser success, schema validity, retrieval quality, semantic completeness, source support, and application authorization.
6. For streaming, publish only allowlisted outcome fields after terminal assembly; never publish raw chunks or reasoning.
7. For RAG, do not publish source documents, queries, retrieved text, generated text, embedding vectors, or internal metadata.
8. For structured output and tools, never publish raw data, raw arguments, tool output, provider IDs, or hidden reasoning.
9. For observability, retain only allowlisted metadata; discard messages, responses, tool payloads, headers, credentials, identifiers, and trace payloads.
10. Item 8 is bound to the exact UTC run date, pinned versions, provider/model scope, case inventory, request count and cap, completion and chat outcomes, sync and async stream outcomes, thinking-field placement, structured-prediction outcome, tool validation and continuation, local RAG result, invalid-model classification, concurrency, automatic retries, elapsed study time, offline-test total, and final privacy-audit state.

## Publication QA checklist

- [x] Every SVG uses `viewBox="0 0 1600 900"`.
- [x] Every rendered PNG is exactly 1600 x 900.
- [x] Every PNG is inspected at full resolution for clipping, overlap, contrast, and legibility.
- [x] Items 1-7 contain no numerical live-result, package-version, model, or dated claims.
- [x] Item 8 was rendered only after the final sanitized summary and passing privacy audit existed.
- [x] No prompt, generation, hidden reasoning, raw tool data, source document, retrieved text, embedding vector, trace payload, or provider identifier appears.
- [x] No credential, credential fragment, header, balance, account identifier, copied interface, local username, or local path appears.
- [x] Every SVG passes scans for non-ASCII text, mojibake, credential-like strings, off-canvas text, and accidental raw payloads.
- [ ] Exact alt text and captions above are used when the images are uploaded to WordPress.
- [ ] Featured image is item 1.
- [ ] WordPress tags remain unused.
