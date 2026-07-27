# Image placement manifest

Body images should use a full-width Gutenberg image block, retain the caption below, and be uploaded with the listed alt text. The featured image is assigned in WordPress but is not repeated inside the article body.

| Placeholder | Placement | Alt text | Caption |
|---|---|---|---|
| `{{FEATURED_IMAGE}}` | WordPress featured image only | DeepSeek API error codes guide showing documented statuses, live test evidence, and retry decisions | DeepSeek API errors should be classified by evidence, ownership, and retry safety—not by the message text alone. |
| `{{STATUS_BOUNDARY_IMAGE}}` | In “How we tested the current API,” before safety limits | Boundary diagram separating officially documented DeepSeek errors, observed live responses, and locally simulated retry behavior | Evidence boundary: provider documentation, dated API observations, and local fault injection answer different questions. |
| `{{LIVE_MATRIX_IMAGE}}` | Immediately after the selected live-results table | Live DeepSeek API test matrix with successful control and observed 400, 401, 404, 405, and 415 responses | The live matrix reproduced authentication, request-shape, route, method, and media-type failures without forcing billing, load, or server incidents. |
| `{{ERROR_SHAPES_IMAGE}}` | In “Do not assume every error body is JSON,” before the parser example | Comparison of JSON error objects, non-JSON error bodies, and empty DeepSeek API error responses | Preserve the HTTP status first, then parse the body defensively according to content and size. |
| `{{RETRY_LAB_IMAGE}}` | In the retry-policy section, before the Python implementation | Local DeepSeek retry laboratory showing no retry for 400, 401, 402, and 422 and bounded backoff for 429, 500, and 503 | Local fault injection verifies the decision logic without forcing provider errors or generating load. |
| `{{SAFE_LOGGING_IMAGE}}` | In the safe-logging section, before dashboard guidance | Safe DeepSeek API error logging checklist separating useful diagnostics from secrets and private content | Safe telemetry preserves status and request-shape evidence while excluding credentials, balances, private prompts, and hidden reasoning. |
