const REDACTED = "[REDACTED]";
const OMITTED = "[OMITTED]";

const SENSITIVE_FIELD =
  /^(?:api[-_]?key|secret|password|authorization|cookie|credential|access[-_]?token|refresh[-_]?token|account[-_]?id|organization[-_]?id|user[-_]?id|email)$/i;
const RAW_FIELD =
  /^(?:headers?|raw|raw[-_].*|body|prompt|messages?|content|reasoning[-_]?content|arguments?|tool[-_]?result|stack|filesystem[-_]?path)$/i;
const PRIVATE_KEY =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi;
const KEY_SHAPE = /\bsk-[A-Za-z0-9_-]{12,}\b/g;

export function redactString(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(PRIVATE_KEY, REDACTED)
    .replace(BEARER, `Bearer ${REDACTED}`)
    .replace(KEY_SHAPE, REDACTED);
}

export function sanitizeForPublic(value, { maxDepth = 12 } = {}) {
  const seen = new WeakSet();

  function visit(current, depth) {
    if (depth > maxDepth) return OMITTED;
    if (
      current === null ||
      typeof current === "boolean" ||
      typeof current === "number"
    ) {
      return current;
    }
    if (typeof current === "string") return redactString(current);
    if (typeof current === "bigint") return current.toString();
    if (
      typeof current === "undefined" ||
      typeof current === "function" ||
      typeof current === "symbol"
    ) {
      return undefined;
    }
    if (current instanceof Error) return Object.freeze({ error: OMITTED });

    if (Array.isArray(current)) {
      if (seen.has(current)) return OMITTED;
      seen.add(current);
      return current.map((entry) => visit(entry, depth + 1));
    }

    if (typeof current === "object") {
      if (seen.has(current)) return OMITTED;
      seen.add(current);
      const output = {};
      for (const [field, entry] of Object.entries(current)) {
        if (SENSITIVE_FIELD.test(field)) {
          output[field] = REDACTED;
        } else if (RAW_FIELD.test(field)) {
          output[field] = OMITTED;
        } else {
          const sanitized = visit(entry, depth + 1);
          if (sanitized !== undefined) output[field] = sanitized;
        }
      }
      return output;
    }

    return OMITTED;
  }

  return visit(value, 0);
}

export const redactionMarkers = Object.freeze({ REDACTED, OMITTED });
