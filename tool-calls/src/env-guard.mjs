const PLACEHOLDER =
  /^(?:replace[-_ ]?me|your[-_ ]?(?:api[-_ ]?)?key|example|placeholder|changeme|undefined|null)$/i;

export function acceptInMemoryCredential(value, { provenance = "memory" } = {}) {
  if (String(provenance).trim().toLowerCase() !== "memory") {
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
  if (PLACEHOLDER.test(value)) {
    throw new Error("A placeholder is not an accepted live credential.");
  }
  return value;
}

export function assertLiveSourceHasNoCredentialLoader(sourceText) {
  if (typeof sourceText !== "string") {
    throw new TypeError("Source text must be a string.");
  }
  for (const forbidden of [
    /\bprocess\s*\.\s*env\b/,
    /\bDeno\s*\.\s*env\b/,
    /\bBun\s*\.\s*env\b/,
    /\bDEEPSEEK_API_KEY\b/,
    /\bdotenv\b/i,
    /\breadFile(?:Sync)?\s*\(/,
    /\bconsole\s*\./
  ]) {
    if (forbidden.test(sourceText)) {
      throw new Error("Live source contains a forbidden credential-loading or logging path.");
    }
  }
  return true;
}
