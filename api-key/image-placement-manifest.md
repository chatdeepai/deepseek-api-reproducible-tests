# DeepSeek API Key Image Placement Manifest

All visuals must contain English text only. Replace each relative `src` in `article-gutenberg.html` with its final WordPress media URL and add the real WordPress media ID to the corresponding `wp:image` block after upload. Preserve the supplied alt text and caption unless a screenshot reveals a material mismatch. Do not publish any credential, credential fragment, Authorization header, account identifier, monetary balance, profile menu, email address, or secret-reveal dialog.

| # | Filename | Placement | Alt text | Caption | Evidence boundary |
|---:|---|---|---|---|---|
| 1 | `01-deepseek-api-key-lifecycle.png` | After the opening three paragraphs; use as featured image too | DeepSeek API key lifecycle from secure creation through testing, rotation, revocation, and evidence redaction | A safe key lifecycle keeps the credential server-side, validates a replacement before revoking the old key, and publishes only sanitized evidence. | Diagram only; no account data |
| 2 | `02-safe-key-creation-boundary.png` | After “Transfer the credential without publishing it” | Safe DeepSeek API key creation boundary showing the secret moving from the official console to server-side storage without entering screenshots or code | The secret crosses one controlled boundary: from the official console into protected storage. It should not pass through documents, images, repositories, or client code. | May use a sanitized console screenshot, but never the reveal dialog |
| 3 | `03-environment-variable-patterns.png` | After the `.env` and Git-ignore guidance | Secure DeepSeek API key environment variable patterns for macOS, Linux, Windows PowerShell, development, and production | Environment variables reduce hardcoding risk, but production deployments should inject them from protected secret storage and prevent values from entering logs. | Use synthetic variable names and values only |
| 4 | `04-live-12-case-results.png` | Immediately after the 12-row live results table | Results of 12 live DeepSeek API key authentication, balance availability, rotation, and revocation cases | All 12 bounded cases met their expected outcome: 6 valid authenticated operations returned 200 and 6 negative or revoked-key controls returned 401. | Built from `results/final-results-summary.json`; no raw responses |
| 5 | `05-authentication-control-matrix.png` | After “How to interpret 200 and 401 correctly” | DeepSeek API key authentication control matrix comparing valid, missing, empty, wrong-scheme, invalid, and revoked credentials | A valid key returned 200, while every missing, malformed, invalid, or revoked credential control returned 401 in the dated live run. | Use status classes only; no sent headers or provider error text |
| 6 | `06-two-key-rotation-timeline.png` | After the numbered rotation runbook | Two-key DeepSeek API rotation timeline showing overlap, replacement validation, deployment switch, old-key revocation, and cleanup | Validate key B while key A is still active, switch the application to B, revoke A, and verify both denial and continuity before closing the rotation. | Use aliases A and B only; never fragments |
| 7 | `07-leak-prevention-pipeline.png` | In “Leak prevention and offline security checks” | DeepSeek API key leak prevention pipeline covering in-memory use, redaction, static scanning, manual review, and sanitized publication | Publish the minimum evidence needed to support the result: status, timing, booleans, counts, and public model names—not credentials, headers, balances, or raw bodies. | Diagram only; no account data |
| 8 | `08-methodology-and-guardrails.png` | At the end of “Methodology, evidence, and limitations” | Methodology and guardrails for the DeepSeek API key live study including one origin, serial requests, no retries, redacted evidence, and two revoked test keys | The study prioritizes an auditable credential lifecycle over volume: 12 serial requests, one paid completion, no generic retries, sanitized evidence, and no remaining temporary keys. | Built from the sanitized summary |

## WordPress media settings

- Featured image: item 1.
- Body image size: full.
- Link destination: none.
- Alignment: default wide content column unless the theme clips data labels.
- Preserve PNG dimensions; do not upscale raster screenshots.
- Use the manifest alt text exactly.
- Keep captions visible.
- Do not add WordPress tags.
