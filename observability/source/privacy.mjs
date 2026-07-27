const FORBIDDEN_NORMALIZED_FIELDS = new Set([
  "apikey",
  "authorization",
  "cookie",
  "cookies",
  "headers",
  "prompt",
  "messages",
  "output",
  "content",
  "reasoningcontent",
  "raw",
  "stack",
  "message",
  "requestid",
  "providerrequestid",
  "responseid",
  "toolcallid",
  "correlationid",
  "traceid",
  "runid",
  "arguments",
  "toolresult",
  "retrievedcontext",
  "account",
  "balance",
  "email",
  "userid",
  "path",
]);

const TEXT_PATTERNS = {
  secret: [
    /\bsk-[A-Za-z0-9_-]{12,}\b/g,
    /\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*\b/gi,
  ],
  identifier: [
    /\bcorr_[A-Za-z0-9_-]{8,}\b/g,
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
  ],
  contact: [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  path: [/\b[A-Za-z]:\\(?:[^\\\s]+\\)*[^\\\s]*/g, /\/(?:Users|home)\/[^\s"]+/g],
  mojibake: [/\u00c3|\u00c2|\ufffd/g],
};

function normalizedField(value) {
  return value.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function countMatches(text, expressions) {
  let count = 0;
  for (const expression of expressions) {
    expression.lastIndex = 0;
    count += [...text.matchAll(expression)].length;
  }
  return count;
}

function inspectFields(value, findings = []) {
  if (!value || typeof value !== "object") return findings;
  if (Array.isArray(value)) {
    for (const item of value) inspectFields(item, findings);
    return findings;
  }

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_NORMALIZED_FIELDS.has(normalizedField(key))) {
      findings.push(key);
    }
    inspectFields(child, findings);
  }
  return findings;
}

export function inspectEvidenceText(text) {
  return {
    secret_findings: countMatches(text, TEXT_PATTERNS.secret),
    internal_identifier_findings: countMatches(
      text,
      TEXT_PATTERNS.identifier,
    ),
    contact_findings: countMatches(text, TEXT_PATTERNS.contact),
    local_path_findings: countMatches(text, TEXT_PATTERNS.path),
    non_ascii_characters: [...text].filter(
      (character) => character.codePointAt(0) > 127,
    ).length,
    mojibake_matches: countMatches(text, TEXT_PATTERNS.mojibake),
  };
}

export function auditEvidence(
  value,
  auditedAt = "2026-07-27T00:00:00.000Z",
) {
  const encoded = JSON.stringify(value);
  const fieldFindings = inspectFields(value);
  const text = inspectEvidenceText(encoded);
  const checks = {
    forbidden_fields_absent: fieldFindings.length === 0,
    secrets_absent: text.secret_findings === 0,
    internal_identifiers_absent: text.internal_identifier_findings === 0,
    contacts_absent: text.contact_findings === 0,
    local_paths_absent: text.local_path_findings === 0,
    ascii_only: text.non_ascii_characters === 0,
    mojibake_absent: text.mojibake_matches === 0,
  };

  return {
    schema_version: 1,
    audited_at_utc: auditedAt,
    forbidden_field_findings: fieldFindings.length,
    ...text,
    checks,
    status: Object.values(checks).every(Boolean) ? "pass" : "fail",
  };
}

export function assertPublishableEvidence(value) {
  const audit = auditEvidence(value);
  if (audit.status !== "pass") {
    throw new Error("Evidence failed the privacy audit.");
  }
  return audit;
}
