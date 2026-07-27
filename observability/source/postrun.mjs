import { auditEvidence } from "./privacy.mjs";

function nearlyEqual(left, right, tolerance = 0.0000005) {
  return Math.abs(left - right) <= tolerance;
}

function sum(items, selector) {
  return items.reduce((total, item) => total + selector(item), 0);
}

function allCaseStorageFlagsAreSafe(cases) {
  return cases.every((item) => {
    const common =
      item.raw_prompt_stored === false &&
      item.raw_output_stored === false &&
      item.provider_id_stored === false;
    if (item.id === "OBS-LIVE-08") {
      return item.raw_error_stored === false;
    }
    return common;
  });
}

export function auditLiveSummary({
  plan,
  planSha256,
  summary,
  auditedAt = new Date().toISOString(),
}) {
  const privacy = auditEvidence(summary, auditedAt);
  const cases = Array.isArray(summary?.cases) ? summary.cases : [];
  const expectedIds = plan.cases.map((item) => item.id);
  const observedIds = cases.map((item) => item.id);
  const promptTokens = sum(cases, (item) => item.usage?.prompt_tokens ?? 0);
  const completionTokens = sum(
    cases,
    (item) => item.usage?.completion_tokens ?? 0,
  );
  const totalTokens = sum(cases, (item) => item.usage?.total_tokens ?? 0);
  const estimatedCost = sum(
    cases,
    (item) => item.estimated_cost_usd ?? 0,
  );
  const http200 = cases.filter((item) => item.http_status === 200).length;
  const expected400 = cases.filter(
    (item) => item.http_status === 400 && item.expected_error === true,
  ).length;
  const started = Date.parse(summary?.executed_at_utc);
  const completed = Date.parse(summary?.completed_at_utc);
  const streamCase = cases.find((item) => item.id === "OBS-LIVE-02");
  const jsonCase = cases.find((item) => item.id === "OBS-LIVE-03");
  const toolCase = cases.find((item) => item.id === "OBS-LIVE-04");
  const thinkingCase = cases.find((item) => item.id === "OBS-LIVE-05");
  const firstCache = cases.find((item) => item.id === "OBS-LIVE-06");
  const secondCache = cases.find((item) => item.id === "OBS-LIVE-07");
  const invalidCase = cases.find((item) => item.id === "OBS-LIVE-08");
  const expectedCacheShare =
    secondCache?.usage?.prompt_tokens > 0
      ? secondCache.usage.prompt_cache_hit_tokens /
        secondCache.usage.prompt_tokens
      : 0;

  const checks = {
    study_identity_matches: summary?.study === plan.study,
    run_window_is_valid:
      Number.isFinite(started) &&
      Number.isFinite(completed) &&
      completed >= started,
    concurrency_matches:
      summary?.method?.concurrency === plan.constraints.concurrency,
    retries_match:
      summary?.method?.provider_retries ===
      plan.constraints.provider_retries,
    timeout_matches:
      summary?.method?.request_timeout_ms ===
      plan.constraints.request_timeout_ms,
    method_storage_flags_are_false:
      summary?.method?.raw_prompt_storage === false &&
      summary?.method?.raw_output_storage === false &&
      summary?.method?.provider_request_id_storage === false &&
      summary?.method?.api_key_storage === false,
    model_preflight_matches:
      summary?.model_preflight?.status === 200 &&
      JSON.stringify(summary.model_preflight.models) ===
        JSON.stringify(plan.preflight.models_observed),
    pricing_source_is_official:
      summary?.pricing_snapshot?.source ===
      "https://api-docs.deepseek.com/quick_start/pricing/",
    case_count_matches: cases.length === plan.cases.length,
    case_order_matches:
      JSON.stringify(observedIds) === JSON.stringify(expectedIds),
    expected_outcomes_match:
      summary?.totals?.expected_outcomes_observed === plan.cases.length,
    http_accounting_matches:
      http200 === 7 &&
      expected400 === 1 &&
      summary?.totals?.http_200 === http200 &&
      summary?.totals?.expected_http_400 === expected400,
    prompt_tokens_reconcile:
      promptTokens === 10_036 &&
      summary?.totals?.prompt_tokens === promptTokens,
    completion_tokens_reconcile:
      completionTokens === 98 &&
      summary?.totals?.completion_tokens === completionTokens,
    total_tokens_reconcile:
      totalTokens === 10_134 &&
      summary?.totals?.total_tokens === totalTokens,
    case_costs_reconcile:
      nearlyEqual(estimatedCost, 0.000808071, 0.0000000005) &&
      nearlyEqual(
        summary?.totals?.estimated_cost_usd,
        estimatedCost,
        0.0000000005,
      ),
    streaming_quality_monitor_caught_miss:
      streamCase?.output_word_count === 5 &&
      summary?.totals?.stream_word_count_requirement_met === false &&
      summary?.totals?.stream_monitor_detected_quality_miss === true &&
      streamCase?.terminal_usage_present === true &&
      streamCase?.finish_reason === "stop",
    json_contract_passed:
      jsonCase?.json_parse_valid === true &&
      jsonCase?.json_schema_valid === true &&
      jsonCase?.json_field_count === 2,
    tool_schema_passed_without_execution:
      toolCase?.tool_call_count === 1 &&
      toolCase?.tool_name_valid === true &&
      toolCase?.tool_arguments_json_valid === true &&
      toolCase?.tool_arguments_schema_valid === true &&
      toolCase?.tool_output_executed === false,
    thinking_terminal_and_reasoning_passed:
      thinkingCase?.requested_model === "deepseek-v4-pro" &&
      thinkingCase?.finish_reason === "stop" &&
      thinkingCase?.reasoning_present === true &&
      thinkingCase?.usage?.reasoning_tokens === 30 &&
      thinkingCase?.exact_final_answer === true &&
      thinkingCase?.terminal_complete === true,
    repeated_prefix_cache_evidence_reconciles:
      firstCache?.usage?.prompt_tokens === 4_810 &&
      secondCache?.usage?.prompt_tokens === 4_810 &&
      secondCache?.usage?.prompt_cache_hit_tokens === 4_736 &&
      secondCache?.usage?.prompt_cache_miss_tokens === 74 &&
      summary?.totals?.second_cache_hit_tokens === 4_736 &&
      summary?.totals?.second_cache_miss_tokens === 74 &&
      nearlyEqual(
        summary?.totals?.second_cache_hit_share,
        expectedCacheShare,
        0.0000005,
      ),
    invalid_model_control_passed:
      invalidCase?.http_status === 400 &&
      invalidCase?.expected_error === true &&
      invalidCase?.error_type === "invalid_request_error" &&
      invalidCase?.raw_error_stored === false,
    per_case_storage_flags_are_safe: allCaseStorageFlagsAreSafe(cases),
    privacy_audit_passed: privacy.status === "pass",
  };

  return {
    schema_version: 1,
    audited_at_utc: auditedAt,
    plan_sha256: planSha256,
    live_summary_preserved: true,
    observed_case_count: cases.length,
    observed_http_200: http200,
    observed_expected_http_400: expected400,
    observed_total_tokens: totalTokens,
    observed_estimated_cost_usd: Number(estimatedCost.toFixed(12)),
    privacy,
    checks,
    status: Object.values(checks).every(Boolean) ? "pass" : "fail",
  };
}
