# Rate Limits image placement

All images are 1600 x 900 pixels, contain English only, and distinguish official facts, bounded live observations, and offline simulations.

| Placeholder | File | WordPress role | Alt text |
|---|---|---|---|
| `RATE-LIMITS-VISUAL-01` | `visuals/01-featured.png` | Featured image and opening summary | DeepSeek API rate limits guide showing official Pro and Flash account concurrency, a 12-of-12 live test, and client queue policy |
| `RATE-LIMITS-VISUAL-02` | `visuals/02-official-v4-limits.png` | Current V4 concurrency limits | Official DeepSeek V4 concurrency limits: 500 Pro slots and 2,500 Flash slots per account, shared across API keys |
| `RATE-LIMITS-VISUAL-03` | `visuals/03-live-test-matrix.png` | Safe methodology | Live DeepSeek concurrency test: 12 of 12 HTTP 200 responses, application cap four, and no 429 forced or observed |
| `RATE-LIMITS-VISUAL-04` | `visuals/04-sequential-vs-concurrent.png` | Live sequential/concurrent results | Four sequential DeepSeek requests took 4,061 ms versus 1,106 ms with an application concurrency cap of four |
| `RATE-LIMITS-VISUAL-05` | `visuals/05-offline-queue-benchmark.png` | Offline queue benchmark | Offline queue simulation comparing makespan and p95 wait at concurrency caps one, two, four, and eight |
| `RATE-LIMITS-VISUAL-06` | `visuals/06-retry-decision-tree.png` | Retry policy | Offline retry policy: fix HTTP 400; bounded retries for 429, 500, 503, network failures, and timeouts |
| `RATE-LIMITS-VISUAL-07` | `visuals/07-keep-alive-parser.png` | Keep-alive parser | DeepSeek stream parser evidence: live 341 ms first event, 756 ms total, and two split keep-alives handled offline |

The first visual is the WordPress featured image. It is intentionally not repeated as a body image by the theme. The remaining six visuals replace the corresponding article comments with native Gutenberg image blocks, including captions and media-library attachment IDs.
