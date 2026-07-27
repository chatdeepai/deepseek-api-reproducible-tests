const BETA_BASE_URL = "https://api.deepseek.com/beta";
const SUPPORTED_TYPES = new Set([
  "object",
  "string",
  "number",
  "integer",
  "boolean",
  "array"
]);
const SUPPORTED_FORMATS = new Set([
  "email",
  "hostname",
  "ipv4",
  "ipv6",
  "uuid"
]);
const UNSUPPORTED_KEYWORDS = new Set([
  "minLength",
  "maxLength",
  "minItems",
  "maxItems"
]);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addError(errors, code, path) {
  errors.push(Object.freeze({ code, path }));
}

function resolveLocalRef(root, reference) {
  if (typeof reference !== "string" || !reference.startsWith("#/")) {
    return undefined;
  }
  const segments = reference
    .slice(2)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
  let current = root;
  for (const segment of segments) {
    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function inspectSchema(schema, path, root, errors, seen) {
  if (!isRecord(schema)) {
    addError(errors, "schema_must_be_object", path);
    return;
  }
  if (seen.has(schema)) {
    return;
  }
  seen.add(schema);

  for (const keyword of UNSUPPORTED_KEYWORDS) {
    if (Object.hasOwn(schema, keyword)) {
      addError(errors, `unsupported_${keyword}`, `${path}/${keyword}`);
    }
  }

  if (Object.hasOwn(schema, "$ref")) {
    if (resolveLocalRef(root, schema.$ref) === undefined) {
      addError(errors, "unresolved_local_ref", `${path}/$ref`);
    }
  }

  if (Object.hasOwn(schema, "type") && !SUPPORTED_TYPES.has(schema.type)) {
    addError(errors, "unsupported_type", `${path}/type`);
  }

  if (Object.hasOwn(schema, "enum")) {
    if (!Array.isArray(schema.enum) || schema.enum.length === 0) {
      addError(errors, "enum_must_be_nonempty", `${path}/enum`);
    }
  }

  if (Object.hasOwn(schema, "anyOf")) {
    if (!Array.isArray(schema.anyOf) || schema.anyOf.length === 0) {
      addError(errors, "anyOf_must_be_nonempty", `${path}/anyOf`);
    } else {
      schema.anyOf.forEach((branch, index) =>
        inspectSchema(branch, `${path}/anyOf/${index}`, root, errors, seen)
      );
    }
  }

  if (schema.type === "object" || Object.hasOwn(schema, "properties")) {
    if (!isRecord(schema.properties)) {
      addError(errors, "object_properties_required", `${path}/properties`);
    } else {
      const propertyNames = Object.keys(schema.properties);
      if (!Array.isArray(schema.required)) {
        addError(errors, "object_required_array_missing", `${path}/required`);
      } else {
        const required = new Set(schema.required);
        if (
          required.size !== schema.required.length ||
          propertyNames.some((name) => !required.has(name)) ||
          schema.required.some((name) => !propertyNames.includes(name))
        ) {
          addError(errors, "all_object_properties_must_be_required", `${path}/required`);
        }
      }
      if (schema.additionalProperties !== false) {
        addError(errors, "additionalProperties_must_be_false", `${path}/additionalProperties`);
      }
      for (const [name, child] of Object.entries(schema.properties)) {
        inspectSchema(child, `${path}/properties/${name}`, root, errors, seen);
      }
    }
  }

  if (schema.type === "array") {
    if (!isRecord(schema.items)) {
      addError(errors, "array_items_schema_required", `${path}/items`);
    } else {
      inspectSchema(schema.items, `${path}/items`, root, errors, seen);
    }
  }

  if (schema.type === "string") {
    if (Object.hasOwn(schema, "pattern")) {
      if (typeof schema.pattern !== "string") {
        addError(errors, "pattern_must_be_string", `${path}/pattern`);
      } else {
        try {
          new RegExp(schema.pattern);
        } catch {
          addError(errors, "pattern_must_compile", `${path}/pattern`);
        }
      }
    }
    if (
      Object.hasOwn(schema, "format") &&
      !SUPPORTED_FORMATS.has(schema.format)
    ) {
      addError(errors, "unsupported_format", `${path}/format`);
    }
  }

  if (schema.type === "number" || schema.type === "integer") {
    for (const keyword of [
      "const",
      "default",
      "minimum",
      "maximum",
      "exclusiveMinimum",
      "exclusiveMaximum",
      "multipleOf"
    ]) {
      if (Object.hasOwn(schema, keyword) && typeof schema[keyword] !== "number") {
        addError(errors, `${keyword}_must_be_number`, `${path}/${keyword}`);
      }
    }
    if (
      typeof schema.minimum === "number" &&
      typeof schema.maximum === "number" &&
      schema.minimum > schema.maximum
    ) {
      addError(errors, "minimum_exceeds_maximum", path);
    }
    if (typeof schema.multipleOf === "number" && schema.multipleOf <= 0) {
      addError(errors, "multipleOf_must_be_positive", `${path}/multipleOf`);
    }
  }

  for (const definitionKey of ["$def", "$defs"]) {
    if (Object.hasOwn(schema, definitionKey)) {
      if (!isRecord(schema[definitionKey])) {
        addError(errors, "definitions_must_be_object", `${path}/${definitionKey}`);
      } else {
        for (const [name, child] of Object.entries(schema[definitionKey])) {
          inspectSchema(child, `${path}/${definitionKey}/${name}`, root, errors, seen);
        }
      }
    }
  }
}

export function validateStrictSchema(schema) {
  const errors = [];
  inspectSchema(schema, "#", schema, errors, new WeakSet());
  return Object.freeze({
    valid: errors.length === 0,
    errorCount: errors.length,
    errors: Object.freeze(errors)
  });
}

export function validateStrictToolDefinition(
  tool,
  { baseUrl = BETA_BASE_URL } = {}
) {
  const errors = [];

  let normalizedBase = null;
  try {
    const url = new URL(baseUrl);
    normalizedBase = `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    normalizedBase = null;
  }

  if (normalizedBase !== BETA_BASE_URL) {
    addError(errors, "strict_mode_requires_beta_base_url", "#/baseUrl");
  }
  if (!isRecord(tool) || tool.type !== "function" || !isRecord(tool.function)) {
    addError(errors, "invalid_function_tool_shape", "#/tool");
  } else {
    if (tool.function.strict !== true) {
      addError(errors, "strict_true_required", "#/tool/function/strict");
    }
    if (
      typeof tool.function.name !== "string" ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(tool.function.name)
    ) {
      addError(errors, "invalid_function_name", "#/tool/function/name");
    }
    const report = validateStrictSchema(tool.function.parameters);
    errors.push(...report.errors);
  }

  return Object.freeze({
    valid: errors.length === 0,
    betaBaseUrl: BETA_BASE_URL,
    errorCount: errors.length,
    errors: Object.freeze(errors)
  });
}

export const strictSchemaContract = Object.freeze({
  betaBaseUrl: BETA_BASE_URL,
  supportedTypes: Object.freeze([...SUPPORTED_TYPES]),
  supportedFormats: Object.freeze([...SUPPORTED_FORMATS]),
  unsupportedKeywords: Object.freeze([...UNSUPPORTED_KEYWORDS])
});

export { resolveLocalRef };
