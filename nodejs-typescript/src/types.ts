export type ThinkingMode = "enabled" | "disabled";

export type Scenario =
  | "ordinary_chat"
  | "streaming"
  | "json_output"
  | "tool_initial"
  | "tool_continuation"
  | "thinking"
  | "alias_probe"
  | "invalid_model";

export interface PlanCase {
  sequence: number;
  id: string;
  scenario: Scenario;
  model: string;
  thinking: ThinkingMode;
  reasoning_effort: "high" | null;
  max_tokens: number;
  acceptance: string;
}

export interface RequestPlan {
  schema_version: number;
  title: string;
  status: "not_run";
  frozen_at_utc: string;
  provider_origin: string;
  versions: {
    node_minimum: string;
    openai: string;
    typescript: string;
    "@types/node": string;
  };
  provider_request_cap: number;
  planned_provider_requests: number;
  concurrency: number;
  automatic_retries: number;
  default_timeout_ms: number;
  evidence_policy: Record<string, boolean>;
  cases: PlanCase[];
}

export interface PlanSnapshot {
  plan: RequestPlan;
  sha256: string;
}

export interface SafeResult {
  case_id: string;
  runtime: "nodejs-typescript";
  scenario: Scenario;
  requested_model: string;
  request_issued: boolean;
  status: number | null;
  elapsed_ms: number;
  [key: string]: unknown;
}

export interface RunLedgerState {
  schema_version: number;
  status: "running" | "completed" | "interrupted";
  plan_sha256: string;
  cap: number;
  issued: number;
  case_ids: string[];
  interruption_code?: "run_interrupted";
}
