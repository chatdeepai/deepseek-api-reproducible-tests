# Security and Privacy Boundary

## Credential handling

- The live coordinator reads `DEEPSEEK_API_KEY` from the process environment.
- No source file, plan, command argument, result, log, or screenshot contains
  the credential or a credential fragment.
- The Node child process receives the credential through its inherited
  environment; it is never placed on the command line.
- Offline fixtures use a visibly non-credential placeholder.

## Network boundary

- Offline tests bind only to an ephemeral `127.0.0.1` port.
- The guarded live coordinator requires `ALLOW_PROVIDER_REQUESTS=1`.
- Python uses the documented DeepSeek-compatible API base. Strict Python tool
  binding may route to DeepSeek's documented beta base through the dedicated
  wrapper.
- JavaScript uses the dedicated wrapper's documented DeepSeek origin.

## Request controls

- One shared cross-process ledger enforces the cap.
- Planned requests: 16.
- Maximum issued requests: 16.
- Concurrency: 1.
- Automatic SDK retries: 0.
- A failed tool-call validation prevents the continuation request.

## Public evidence allowlist

Allowed evidence includes case ID, runtime, scenario, requested model, thinking
setting, request-issued flag, status, elapsed milliseconds, safe exception
class, allowlisted error code, finish state, event counts, and validation
booleans.

The following are forbidden:

- API keys, Authorization headers, cookies, or header dumps;
- prompts, generations, raw chunks, or hidden reasoning;
- provider request IDs, response IDs, or tool-call IDs;
- raw tool arguments, tool results, or retrieved context;
- raw errors, stack traces, balances, account identifiers, or profile data;
- non-ASCII text or mojibake in publishable evidence.

## Operational note

Do not enable LangSmith tracing or any other external observability exporter for
this study. Application observability should retain only allowlisted aggregate
metadata after a separate privacy review.
