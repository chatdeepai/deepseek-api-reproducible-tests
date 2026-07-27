const FORBIDDEN_PROVENANCE = new Set([
  "environment",
  "env",
  "command-line",
  "cli",
  "file",
  "stdin",
  "clipboard",
  "browser-storage"
]);

const PLACEHOLDER_PATTERN =
  /^(?:replace[-_ ]?me|your[-_ ]?(?:api[-_ ]?)?key|example|placeholder|changeme|undefined|null)$/i;

export function acceptInMemoryCredential(value, { provenance = "memory" } = {}) {
  const normalizedProvenance = String(provenance).trim().toLowerCase();

  if (normalizedProvenance !== "memory" || FORBIDDEN_PROVENANCE.has(normalizedProvenance)) {
    throw new Error("Credential provenance must be an in-memory function argument.");
  }

  if (typeof value !== "string") {
    throw new TypeError("Credential must be a string held in memory.");
  }

  if (value.length < 16 || value.length > 512) {
    throw new Error("Credential length is outside the accepted safety bounds.");
  }

  if (value.trim() !== value || /[\r\n\0]/.test(value)) {
    throw new Error("Credential contains unsafe whitespace or control characters.");
  }

  if (PLACEHOLDER_PATTERN.test(value)) {
    throw new Error("A placeholder is not an accepted live credential.");
  }

  return value;
}

export function assertNoEnvironmentLookup(sourceText) {
  if (typeof sourceText !== "string") {
    throw new TypeError("Source text must be a string.");
  }

  const forbidden = [
    /\bprocess\s*\.\s*env\b/,
    /\bDeno\s*\.\s*env\b/,
    /\bBun\s*\.\s*env\b/,
    /\bDEEPSEEK_API_KEY\b/,
    /\bdotenv\b/i
  ];

  for (const pattern of forbidden) {
    if (pattern.test(sourceText)) {
      throw new Error("Live source contains an environment credential lookup.");
    }
  }

  return true;
}
