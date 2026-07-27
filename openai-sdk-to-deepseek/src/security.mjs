const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*\b/gi,
  /(?:api[_-]?key|authorization)\s*[:=]\s*["'][^"']{8,}["']/gi,
];

const FORBIDDEN_RESULT_FIELDS = new Set([
  'authorization',
  'headers',
  'prompt',
  'messages',
  'content',
  'reasoning_content',
  'request_id',
  'tool_call_id',
  'arguments',
  'raw',
]);

export function findSecrets(text) {
  const findings = [];
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      findings.push({ kind: 'credential-like-text', offset: match.index ?? -1 });
    }
  }
  return findings;
}

export function assertNoSecrets(text) {
  const findings = findSecrets(text);
  if (findings.length > 0) {
    throw new Error(`Refusing to persist ${findings.length} credential-like finding(s).`);
  }
}

export function assertAllowlistedResult(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertAllowlistedResult(item, `${path}[${index}]`));
    return true;
  }
  if (!value || typeof value !== 'object') {
    return true;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_RESULT_FIELDS.has(key.toLowerCase())) {
      throw new Error(`Forbidden result field at ${path}.${key}`);
    }
    assertAllowlistedResult(child, `${path}.${key}`);
  }
  return true;
}

export function safeErrorClass(error) {
  const name = typeof error?.constructor?.name === 'string' ? error.constructor.name : 'Error';
  return /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(name) ? name : 'Error';
}

export function safeErrorCode(error) {
  const code = error?.code;
  return typeof code === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(code) ? code : null;
}

