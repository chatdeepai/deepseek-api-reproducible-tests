import { addUsdDecimalStrings } from "./cost.mjs";

function nearestRank(values, percentile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.max(1, Math.ceil(percentile * sorted.length));
  return sorted[rank - 1];
}

function ratio(numerator, denominator) {
  return denominator === 0
    ? 0
    : Number((numerator / denominator).toFixed(6));
}

export function buildDashboard(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Dashboard input requires lifecycle records.");
  }

  const success = records.filter((item) => item.outcome === "success").length;
  const incomplete = records.filter(
    (item) => item.outcome === "incomplete",
  ).length;
  const failures = records.filter((item) =>
    ["provider_error", "transport_error", "cancelled"].includes(item.outcome),
  ).length;
  const durationValues = records.map((item) => item.duration_ms);
  const streamRecords = records.filter((item) => item.stream_metrics);
  const toolRecords = records.filter((item) => item.tool_trace);
  const costs = records
    .map((item) => item.cost_estimate?.estimated_cost_usd)
    .filter((value) => typeof value === "string");

  return {
    schema_version: 1,
    request_total: records.length,
    success_total: success,
    incomplete_total: incomplete,
    failure_total: failures,
    availability: ratio(success, records.length),
    error_rate: ratio(failures, records.length),
    incomplete_rate: ratio(incomplete, records.length),
    attempt_total: records.reduce(
      (total, item) => total + item.attempt_count,
      0,
    ),
    retry_total: records.reduce(
      (total, item) => total + item.retry_count,
      0,
    ),
    p50_duration_ms: nearestRank(durationValues, 0.5),
    p95_duration_ms: nearestRank(durationValues, 0.95),
    stream_total: streamRecords.length,
    p95_time_to_first_content_ms: nearestRank(
      streamRecords
        .map((item) => item.stream_metrics.time_to_first_content_ms)
        .filter((value) => Number.isInteger(value)),
      0.95,
    ),
    tool_trace_total: toolRecords.length,
    complete_tool_trace_total: toolRecords.filter(
      (item) => item.tool_trace.trace_complete,
    ).length,
    prompt_tokens: records.reduce(
      (total, item) =>
        total + (item.cost_estimate?.prompt_tokens ?? 0),
      0,
    ),
    completion_tokens: records.reduce(
      (total, item) =>
        total + (item.cost_estimate?.completion_tokens ?? 0),
      0,
    ),
    total_tokens: records.reduce(
      (total, item) => total + (item.cost_estimate?.total_tokens ?? 0),
      0,
    ),
    estimated_cost_usd:
      costs.length === 0 ? "0.000000000000" : addUsdDecimalStrings(costs),
    raw_payloads_retained: false,
    internal_identifiers_published: false,
  };
}

export function evaluateSlo(dashboard, policy) {
  if (dashboard.request_total < policy.minimum_request_sample) {
    return {
      status: "insufficient_data",
      sample_size: dashboard.request_total,
      minimum_sample_size: policy.minimum_request_sample,
      alerts: [],
    };
  }

  const allowedFailure = 1 - policy.availability_target;
  const burn =
    allowedFailure <= 0
      ? 0
      : Number(((1 - dashboard.availability) / allowedFailure).toFixed(6));
  const alerts = [];

  if (burn >= policy.critical_error_budget_burn) {
    alerts.push({
      metric: "availability_error_budget_burn",
      severity: "critical",
      observed: burn,
      target: policy.critical_error_budget_burn,
    });
  } else if (burn >= policy.warning_error_budget_burn) {
    alerts.push({
      metric: "availability_error_budget_burn",
      severity: "warning",
      observed: burn,
      target: policy.warning_error_budget_burn,
    });
  }

  if (dashboard.incomplete_rate > policy.maximum_incomplete_rate) {
    alerts.push({
      metric: "incomplete_rate",
      severity: "warning",
      observed: dashboard.incomplete_rate,
      target: policy.maximum_incomplete_rate,
    });
  }
  if (dashboard.p95_duration_ms > policy.maximum_p95_duration_ms) {
    alerts.push({
      metric: "p95_duration_ms",
      severity: "warning",
      observed: dashboard.p95_duration_ms,
      target: policy.maximum_p95_duration_ms,
    });
  }
  if (
    dashboard.p95_time_to_first_content_ms !== null &&
    dashboard.p95_time_to_first_content_ms >
      policy.maximum_p95_time_to_first_content_ms
  ) {
    alerts.push({
      metric: "p95_time_to_first_content_ms",
      severity: "warning",
      observed: dashboard.p95_time_to_first_content_ms,
      target: policy.maximum_p95_time_to_first_content_ms,
    });
  }

  return {
    status: alerts.some((item) => item.severity === "critical")
      ? "critical"
      : alerts.length > 0
        ? "warning"
        : "within_policy",
    sample_size: dashboard.request_total,
    availability_error_budget_burn: burn,
    alerts,
  };
}
