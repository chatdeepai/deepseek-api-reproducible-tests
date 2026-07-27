import { pathToFileURL } from "node:url";

export function getLiveGuardDecision() {
  return {
    allowed: false,
    status: "not_run",
    reason: "paid_live_execution_not_authorized",
    planned_provider_requests: 12,
    provider_request_cap: 12,
    concurrency: 1,
    automatic_retries: 0,
    network_adapter_present: false,
    provider_requests_made: 0,
  };
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  process.stderr.write(`${JSON.stringify(getLiveGuardDecision())}\n`);
  process.exitCode = 2;
}
