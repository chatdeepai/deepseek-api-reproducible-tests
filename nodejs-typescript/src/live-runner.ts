import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { RequestLedger, assertFreshResults } from "./budget.js";
import { PROVIDER_ORIGIN, buildClient } from "./client.js";
import { atomicWriteJson } from "./io.js";
import { loadPlan } from "./plan.js";
import { auditSummary } from "./postrun.js";
import { executePlanSerially } from "./scenarios.js";
import { assertSafeEvidence } from "./security.js";

const DEFAULT_RESULTS_DIRECTORY = fileURLToPath(
  new URL("../../results/", import.meta.url),
);

interface PackageVersion {
  version: string;
}

interface OpenAIVersion {
  VERSION: string;
}

export interface InstalledVersions {
  openai: string;
  typescript: string;
  node_types: string;
}

export interface LiveRunOptions {
  allowProviderRequests?: boolean;
  apiKey?: string | undefined;
  resultsDirectory?: string;
}

export function installedVersions(): InstalledVersions {
  const require = createRequire(import.meta.url);
  const openai = require("openai/version") as OpenAIVersion;
  const typescript = require("typescript/package.json") as PackageVersion;
  const nodeTypes = require("@types/node/package.json") as PackageVersion;
  return {
    openai: openai.VERSION,
    typescript: typescript.version,
    node_types: nodeTypes.version,
  };
}

export async function runLive(options: LiveRunOptions = {}): Promise<Record<string, unknown>> {
  if (options.allowProviderRequests !== true) {
    throw new Error("Provider requests are disabled.");
  }
  if (typeof options.apiKey !== "string" || options.apiKey.length < 8) {
    throw new Error("An environment credential is required.");
  }

  const { plan, sha256 } = await loadPlan();
  const versions = installedVersions();
  if (
    versions.openai !== plan.versions.openai ||
    versions.typescript !== plan.versions.typescript ||
    versions.node_types !== plan.versions["@types/node"]
  ) {
    throw new Error("Installed dependencies do not match the frozen plan.");
  }

  const resultsDirectory = options.resultsDirectory ?? DEFAULT_RESULTS_DIRECTORY;
  await assertFreshResults(resultsDirectory);
  const ledger = new RequestLedger(join(resultsDirectory, "run-ledger.json"), {
    cap: plan.provider_request_cap,
    planSha256: sha256,
  });
  await ledger.initialize();

  try {
    const client = buildClient({
      apiKey: options.apiKey,
      baseURL: PROVIDER_ORIGIN,
      timeoutMs: plan.default_timeout_ms,
    });
    const startedAt = new Date().toISOString();
    const results = await executePlanSerially(client, plan, async (caseItem) => {
      await ledger.reserve(caseItem.id);
    });
    const issued = results.filter((item) => item.request_issued).length;
    const completedLedger = await ledger.complete();
    const summary: Record<string, unknown> = {
      schema_version: 1,
      status: "completed",
      runtime: "nodejs-typescript",
      node_version: process.version,
      openai_version: versions.openai,
      typescript_version: versions.typescript,
      started_at_utc: startedAt,
      completed_at_utc: new Date().toISOString(),
      plan_sha256: sha256,
      provider_origin: PROVIDER_ORIGIN,
      planned_case_count: plan.cases.length,
      provider_requests_issued: issued,
      provider_requests_skipped: plan.cases.length - issued,
      provider_request_cap: plan.provider_request_cap,
      concurrency: 1,
      automatic_retries: 0,
      results,
    };
    assertSafeEvidence(summary);
    const audit = auditSummary(summary, plan, completedLedger);
    if (audit.status !== "pass") {
      throw new Error("Privacy audit failed.");
    }
    await atomicWriteJson(join(resultsDirectory, "live-summary.json"), summary);
    await atomicWriteJson(join(resultsDirectory, "privacy-audit.json"), audit);
    return summary;
  } catch {
    await ledger.interrupt();
    throw new Error("Live run stopped before a publishable result was completed.");
  }
}
