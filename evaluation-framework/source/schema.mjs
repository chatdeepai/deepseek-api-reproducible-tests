function error(code, location) {
  return { code, location };
}

function typeMatches(value, type) {
  if (type === "object") {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isSafeInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  if (type === "null") return value === null;
  return false;
}

export function validateSchemaValue(value, schema, location = "$") {
  const errors = [];
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error("A schema object is required.");
  }

  if (schema.type && !typeMatches(value, schema.type)) {
    return [error("type_mismatch", location)];
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(error("enum_mismatch", location));
  }

  if (schema.type === "object" && typeMatches(value, "object")) {
    const properties = schema.properties ?? {};
    const required = schema.required ?? [];
    for (const key of required) {
      if (!Object.hasOwn(value, key)) {
        errors.push(error("required_property_missing", `${location}.${key}`));
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) {
        errors.push(
          ...validateSchemaValue(child, properties[key], `${location}.${key}`),
        );
      } else if (schema.additionalProperties === false) {
        errors.push(error("additional_property", `${location}.${key}`));
      }
    }
  }

  if (schema.type === "array" && Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
      errors.push(error("minimum_items", location));
    }
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) {
      errors.push(error("maximum_items", location));
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(
          ...validateSchemaValue(item, schema.items, `${location}[${index}]`),
        );
      });
    }
  }

  if (schema.type === "string" && typeof value === "string") {
    if (
      Number.isInteger(schema.minLength) &&
      value.length < schema.minLength
    ) {
      errors.push(error("minimum_length", location));
    }
    if (
      Number.isInteger(schema.maxLength) &&
      value.length > schema.maxLength
    ) {
      errors.push(error("maximum_length", location));
    }
    if (typeof schema.pattern === "string") {
      const expression = new RegExp(schema.pattern);
      if (!expression.test(value)) errors.push(error("pattern_mismatch", location));
    }
  }

  if (
    ["integer", "number"].includes(schema.type) &&
    typeof value === "number"
  ) {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(error("minimum_value", location));
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push(error("maximum_value", location));
    }
  }

  return errors;
}

export function evaluateJsonContract(text, schema) {
  if (typeof text !== "string") {
    return {
      parse_valid: false,
      schema_valid: false,
      error_count: 1,
      error_codes: ["not_a_string"],
    };
  }

  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return {
      parse_valid: false,
      schema_valid: false,
      error_count: 1,
      error_codes: ["json_parse_error"],
    };
  }

  const errors = validateSchemaValue(value, schema);
  return {
    parse_valid: true,
    schema_valid: errors.length === 0,
    error_count: errors.length,
    error_codes: [...new Set(errors.map((item) => item.code))].sort(),
  };
}
