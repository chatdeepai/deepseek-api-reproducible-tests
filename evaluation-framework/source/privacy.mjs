const FORBIDDEN_KEYS = new Map([
  ["apikey", "credential_field"],
  ["apitoken", "credential_field"],
  ["authorization", "header_field"],
  ["cookie", "header_field"],
  ["setcookie", "header_field"],
  ["headers", "header_field"],
  ["requestheaders", "header_field"],
  ["responseheaders", "header_field"],
  ["account", "account_data_field"],
  ["accountid", "account_data_field"],
  ["accountemail", "account_data_field"],
  ["balance", "account_data_field"],
  ["rawerror", "raw_error_field"],
  ["errormessage", "raw_error_field"],
  ["stack", "stack_trace_field"],
  ["stacktrace", "stack_trace_field"],
  ["localpath", "local_path_field"],
  ["filesystempath", "local_path_field"],
  ["rawprovideroutput", "provider_payload_field"],
  ["providerrequestbody", "provider_payload_field"],
  ["providerresponsebody", "provider_payload_field"],
  ["providerresponse", "provider_payload_field"],
  ["generatedtext", "provider_payload_field"],
  ["responsetext", "provider_payload_field"],
  ["reasoning", "reasoning_field"],
  ["reasoningcontent", "reasoning_field"],
  ["chainofthought", "reasoning_field"],
  ["toolarguments", "tool_payload_field"],
  ["toolresults", "tool_payload_field"],
  ["providertoolcallid", "provider_identifier_field"],
  ["providerrequestid", "provider_identifier_field"],
  ["providerresponseid", "provider_identifier_field"],
]);

function normalizedKey(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stringIssueCodes(value) {
  const codes = [];
  if (/[^\x00-\x7F]/u.test(value)) codes.push("non_ascii_text");
  if (/\bBearer\s+[A-Za-z0-9._~+/-]+=*/i.test(value)) {
    codes.push("bearer_credential");
  }
  if (/\b(?:sk|api)[_-][A-Za-z0-9_-]{12,}\b/i.test(value)) {
    codes.push("credential_pattern");
  }
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value)) {
    codes.push("private_key_material");
  }
  if (
    /(?:^|[\s"'(])(?:[A-Za-z]:\\|\\\\[A-Za-z0-9._-]+\\)/.test(value) ||
    /(?:file:\/\/|\/Users\/|\/home\/|\/tmp\/)/.test(value)
  ) {
    codes.push("local_path_value");
  }
  if (/(?:\n|\r|^) {0,4}at [^\r\n]+\([^)]+:\d+:\d+\)/.test(value)) {
    codes.push("stack_trace_value");
  }
  return codes;
}

function scan(value, path, issues, state) {
  state.nodeCount += 1;
  if (typeof value === "string") {
    for (const code of stringIssueCodes(value)) {
      issues.push({ code, location: path });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scan(item, `${path}[${index}]`, issues, state));
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    const normalized = normalizedKey(key);
    const retentionDeclaration =
      normalized.endsWith("retained") && child === false;
    const forbiddenCode = FORBIDDEN_KEYS.get(normalized);
    if (forbiddenCode && !retentionDeclaration) {
      issues.push({ code: forbiddenCode, location: `${path}.${key}` });
    }
    scan(child, `${path}.${key}`, issues, state);
  }
}

export function auditPublicArtifact(value, options = {}) {
  const profile = options.profile ?? "published_result";
  if (!["published_result", "synthetic_fixture"].includes(profile)) {
    throw new Error("Privacy audit profile is invalid.");
  }
  const issues = [];
  const state = { nodeCount: 0 };
  scan(value, "$", issues, state);
  const counts = {};
  for (const issue of issues) {
    counts[issue.code] = (counts[issue.code] ?? 0) + 1;
  }
  return {
    passed: issues.length === 0,
    profile,
    issue_count: issues.length,
    issue_code_counts: Object.fromEntries(
      Object.entries(counts).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    audited_node_count: state.nodeCount,
    synthetic_fixture_inputs_allowed: profile === "synthetic_fixture",
    issues,
  };
}

export function publicPrivacySummary(audits) {
  if (!Array.isArray(audits) || audits.length === 0) {
    throw new Error("At least one privacy audit is required.");
  }
  const issueCounts = {};
  let nodes = 0;
  let issueCount = 0;
  for (const audit of audits) {
    nodes += audit.audited_node_count;
    issueCount += audit.issue_count;
    for (const [code, count] of Object.entries(audit.issue_code_counts)) {
      issueCounts[code] = (issueCounts[code] ?? 0) + count;
    }
  }
  return {
    schema_version: 1,
    artifact_id: "deepseek-evaluation-privacy-audit-v1",
    profile: "published_result",
    passed: audits.every((audit) => audit.passed),
    artifact_count: audits.length,
    audited_node_count: nodes,
    issue_count: issueCount,
    issue_code_counts: Object.fromEntries(
      Object.entries(issueCounts).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    synthetic_fixture_inputs_public: true,
    raw_provider_requests_published: false,
    raw_provider_outputs_published: false,
    provider_reasoning_published: false,
    provider_identifiers_published: false,
    credentials_published: false,
    headers_published: false,
    account_data_published: false,
    raw_errors_published: false,
    local_paths_published: false,
  };
}

export function assertPrivacySafe(value, options = {}) {
  const audit = auditPublicArtifact(value, options);
  if (!audit.passed) {
    throw new Error("Public artifact failed the privacy audit.");
  }
  return audit;
}
