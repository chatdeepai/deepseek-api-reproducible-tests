# Security and privacy policy

## Credential handling

- Offline tests use only the literal placeholder
  `offline-only-not-a-credential`.
- The live coordinator reads `DEEPSEEK_API_KEY` only from the process
  environment after explicit provider opt-in.
- A credential must never be written to source, fixtures, results, logs,
  screenshots, notebooks, commands, or documentation.
- External tracing is outside this harness and must remain disabled for the
  bounded study.
- Revoke any temporary live-study key immediately after the single run.

## Network boundary

Offline tests bind an ephemeral `127.0.0.1` server and pass its origin directly
to the real pinned wrapper. The live coordinator is inert unless
`ALLOW_PROVIDER_REQUESTS=1` is present.

## Public result allowlist

`src/security.py` contains the complete common and scenario-specific result
field allowlist. Unknown fields cause the run to fail.

Forbidden publication data includes:

- prompts and message arrays;
- generated content and reasoning content;
- raw responses and response bodies;
- credentials, authorization headers, and default headers;
- request IDs, run IDs, provider IDs, and tool-call IDs;
- tool arguments and retrieved context;
- account, balance, tenant, or billing data;
- local filesystem paths.

## Postrun audit

`src/postrun.py` independently verifies:

- completed summary status;
- exact case order and result count;
- request accounting within the cap;
- concurrency one and automatic retries zero;
- result-field allowlist compliance;
- zero credential-pattern findings;
- ASCII-only sanitized evidence;
- zero mojibake findings.

The audit writes only counts and booleans. A failed audit blocks publication.
