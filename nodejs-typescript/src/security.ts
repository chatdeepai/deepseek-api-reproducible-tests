const FORBIDDEN_RESULT_FIELDS = new Set([
  "api_key",
  "authorization",
  "headers",
  "cookies",
  "prompt",
  "messages",
  "output",
  "content",
  "reasoning_content",
  "request_id",
  "_request_id",
  "response_id",
  "provider_request_id",
  "tool_call_id",
  "arguments",
  "tool_result",
  "retrieved_context",
  "raw",
  "stack",
  "message",
  "balance",
  "account",
  "user",
]);

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*\b/gi,
  /(?:api[_-]?key|authorization)\s*[:=]\s*["'][^"']{8,}["']/gi,
];

const MOJIBAKE_MARKERS = ["\u00c3", "\u00c2", "\u00e2\u20ac", "\ufffd"];

export interface TextFindings {
  secret_findings: number;
  non_ascii_characters: number;
  mojibake_matches: number;
}

export function assertAllowlistedResult(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertAllowlistedResult(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_RESULT_FIELDS.has(key.toLowerCase())) {
      throw new Error(`Forbidden evidence field at ${path}.${key}.`);
    }
    assertAllowlistedResult(child, `${path}.${key}`);
  }
}

export function inspectText(text: string): TextFindings {
  let secretFindings = 0;
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    secretFindings += [...text.matchAll(pattern)].length;
  }
  return {
    secret_findings: secretFindings,
    non_ascii_characters: [...text].filter((character) => character.codePointAt(0)! > 127)
      .length,
    mojibake_matches: MOJIBAKE_MARKERS.reduce(
      (count, marker) => count + text.split(marker).length - 1,
      0,
    ),
  };
}

export function assertSafeEvidence(value: unknown): void {
  assertAllowlistedResult(value);
  const encoded = JSON.stringify(value);
  const findings = inspectText(encoded);
  if (
    findings.secret_findings !== 0 ||
    findings.non_ascii_characters !== 0 ||
    findings.mojibake_matches !== 0
  ) {
    throw new Error("Evidence text failed the privacy scan.");
  }
}

export function safeErrorClass(error: unknown): string {
  const candidate =
    typeof error === "object" &&
    error !== null &&
    "constructor" in error &&
    typeof error.constructor === "function"
      ? error.constructor.name
      : "Error";
  return /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(candidate) ? candidate : "Error";
}

export function safeStatus(error: unknown): number | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    Number.isInteger(error.status) &&
    Number(error.status) >= 100 &&
    Number(error.status) <= 599
  ) {
    return Number(error.status);
  }
  return null;
}

export function safeErrorCode(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Za-z0-9_.-]{1,80}$/.test(error.code)
  ) {
    return error.code;
  }
  return null;
}

export function safeToken(value: unknown, maximum = 100): string | null {
  return typeof value === "string" &&
    value.length <= maximum &&
    /^[A-Za-z0-9._-]+$/.test(value)
    ? value
    : null;
}
