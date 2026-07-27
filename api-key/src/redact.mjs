const REDACTED = "[REDACTED]";
const OMITTED = "[OMITTED]";

const SENSITIVE_FIELD =
  /^(?:api[-_]?key|secret|password|authorization|proxy[-_]?authorization|cookie|set[-_]?cookie|credential|access[-_]?token|refresh[-_]?token|account[-_]?id|organization[-_]?id|user[-_]?id|email)$/i;

const RAW_FIELD =
  /^(?:headers?|request[-_]?headers?|response[-_]?headers?|raw|raw[-_].*|body|request[-_]?body|response[-_]?body|prompt|messages?|content|reasoning[-_]?content|stack)$/i;

const MONETARY_FIELD =
  /^(?:balance[-_]?infos?|total[-_]?balance|granted[-_]?balance|topped[-_]?up[-_]?balance|currency|amount|credit|credits|billing)$/i;

const PRIVATE_KEY_PATTERN =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi;
const KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{12,}\b/g;
const KEY_ASSIGNMENT_PATTERN =
  /\b(?:DEEPSEEK_API_KEY|OPENAI_API_KEY|API_KEY)\s*[:=]\s*["']?[^"'\s,;}{]{8,}["']?/gi;

export function redactString(value) {
  if (typeof value !== "string") {
    return value;
  }

  return value
    .replace(PRIVATE_KEY_PATTERN, REDACTED)
    .replace(BEARER_PATTERN, `Bearer ${REDACTED}`)
    .replace(KEY_PATTERN, REDACTED)
    .replace(KEY_ASSIGNMENT_PATTERN, (match) => {
      const separatorIndex = Math.max(match.indexOf("="), match.indexOf(":"));
      const prefix = separatorIndex >= 0 ? match.slice(0, separatorIndex + 1) : "API_KEY=";
      return `${prefix}${REDACTED}`;
    });
}

export function sanitizeForPublic(value, { maxDepth = 12 } = {}) {
  const seen = new WeakSet();

  function visit(current, depth) {
    if (depth > maxDepth) {
      return OMITTED;
    }

    if (
      current === null ||
      typeof current === "boolean" ||
      typeof current === "number"
    ) {
      return current;
    }

    if (typeof current === "string") {
      return redactString(current);
    }

    if (typeof current === "bigint") {
      return current.toString();
    }

    if (typeof current === "undefined" || typeof current === "function" || typeof current === "symbol") {
      return undefined;
    }

    if (current instanceof Error) {
      return { error: OMITTED };
    }

    if (Array.isArray(current)) {
      if (seen.has(current)) {
        return OMITTED;
      }
      seen.add(current);
      return current.map((entry) => visit(entry, depth + 1));
    }

    if (typeof current === "object") {
      if (seen.has(current)) {
        return OMITTED;
      }
      seen.add(current);

      const output = {};
      for (const [field, entry] of Object.entries(current)) {
        if (SENSITIVE_FIELD.test(field)) {
          output[field] = REDACTED;
        } else if (RAW_FIELD.test(field) || MONETARY_FIELD.test(field)) {
          output[field] = OMITTED;
        } else {
          const sanitized = visit(entry, depth + 1);
          if (sanitized !== undefined) {
            output[field] = sanitized;
          }
        }
      }
      return output;
    }

    return OMITTED;
  }

  return visit(value, 0);
}

export function containsForbiddenPublicField(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const queue = [value];
  const seen = new WeakSet();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === null || typeof current !== "object" || seen.has(current)) {
      continue;
    }
    seen.add(current);

    for (const [field, entry] of Object.entries(current)) {
      if (SENSITIVE_FIELD.test(field) || RAW_FIELD.test(field) || MONETARY_FIELD.test(field)) {
        return true;
      }
      if (entry !== null && typeof entry === "object") {
        queue.push(entry);
      }
    }
  }

  return false;
}

export const redactionMarkers = Object.freeze({ REDACTED, OMITTED });
