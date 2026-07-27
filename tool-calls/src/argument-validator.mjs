import { resolveLocalRef } from "./strict-schema.mjs";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameJsonValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function addError(errors, code, path) {
  errors.push(Object.freeze({ code, path }));
}

function matchesType(value, type) {
  if (type === "object") return isRecord(value);
  if (type === "array") return Array.isArray(value);
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "boolean") return typeof value === "boolean";
  return false;
}

function formatMatches(value, format) {
  if (format === "email") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
  if (format === "hostname") {
    return (
      value.length <= 253 &&
      value
        .split(".")
        .every(
          (label) =>
            /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label)
        )
    );
  }
  if (format === "ipv4") {
    const parts = value.split(".");
    return (
      parts.length === 4 &&
      parts.every(
        (part) =>
          /^(?:0|[1-9]\d{0,2})$/.test(part) &&
          Number(part) >= 0 &&
          Number(part) <= 255
      )
    );
  }
  if (format === "ipv6") {
    if (!/^[0-9A-Fa-f:]+$/.test(value) || !value.includes(":")) return false;
    const compressed = value.includes("::");
    if (compressed && value.indexOf("::") !== value.lastIndexOf("::")) return false;
    const groups = value.split(":").filter((group) => group.length > 0);
    return (
      groups.every((group) => /^[0-9A-Fa-f]{1,4}$/.test(group)) &&
      (compressed ? groups.length < 8 : groups.length === 8)
    );
  }
  if (format === "uuid") {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    );
  }
  return true;
}

function validateValue(value, schema, root, path, errors, refStack) {
  if (!isRecord(schema)) {
    addError(errors, "invalid_schema", path);
    return;
  }

  if (typeof schema.$ref === "string") {
    if (refStack.has(schema.$ref)) {
      addError(errors, "recursive_ref_not_evaluated", path);
      return;
    }
    const target = resolveLocalRef(root, schema.$ref);
    if (!isRecord(target)) {
      addError(errors, "unresolved_local_ref", path);
      return;
    }
    const nextStack = new Set(refStack);
    nextStack.add(schema.$ref);
    validateValue(value, target, root, path, errors, nextStack);
    return;
  }

  if (Array.isArray(schema.anyOf)) {
    const branchValid = schema.anyOf.some((branch) => {
      const branchErrors = [];
      validateValue(value, branch, root, path, branchErrors, new Set(refStack));
      return branchErrors.length === 0;
    });
    if (!branchValid) {
      addError(errors, "anyOf_no_match", path);
    }
    return;
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => sameJsonValue(entry, value))) {
    addError(errors, "enum_mismatch", path);
    return;
  }

  if (schema.type && !matchesType(value, schema.type)) {
    addError(errors, "type_mismatch", path);
    return;
  }

  if (schema.type === "object") {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required : [];

    for (const field of required) {
      if (!Object.hasOwn(value, field)) {
        addError(errors, "required_property_missing", `${path}/${field}`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const field of Object.keys(value)) {
        if (!Object.hasOwn(properties, field)) {
          addError(errors, "unexpected_property", `${path}/${field}`);
        }
      }
    }
    for (const [field, child] of Object.entries(properties)) {
      if (Object.hasOwn(value, field)) {
        validateValue(value[field], child, root, `${path}/${field}`, errors, refStack);
      }
    }
  }

  if (schema.type === "array") {
    value.forEach((entry, index) =>
      validateValue(entry, schema.items, root, `${path}/${index}`, errors, refStack)
    );
  }

  if (schema.type === "string") {
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      addError(errors, "pattern_mismatch", path);
    }
    if (typeof schema.format === "string" && !formatMatches(value, schema.format)) {
      addError(errors, "format_mismatch", path);
    }
  }

  if (schema.type === "number" || schema.type === "integer") {
    if (typeof schema.const === "number" && value !== schema.const) {
      addError(errors, "const_mismatch", path);
    }
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      addError(errors, "below_minimum", path);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      addError(errors, "above_maximum", path);
    }
    if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) {
      addError(errors, "not_above_exclusive_minimum", path);
    }
    if (typeof schema.exclusiveMaximum === "number" && value >= schema.exclusiveMaximum) {
      addError(errors, "not_below_exclusive_maximum", path);
    }
    if (typeof schema.multipleOf === "number") {
      const quotient = value / schema.multipleOf;
      if (Math.abs(quotient - Math.round(quotient)) > 1e-9) {
        addError(errors, "multipleOf_mismatch", path);
      }
    }
  }
}

function parseAndValidate(argumentText, schema) {
  if (typeof argumentText !== "string") {
    return {
      report: Object.freeze({
        parsed: false,
        valid: false,
        errorCount: 1,
        errors: Object.freeze([
          Object.freeze({ code: "arguments_must_be_json_string", path: "#" })
        ])
      }),
      value: undefined
    };
  }

  let value;
  try {
    value = JSON.parse(argumentText);
  } catch {
    return {
      report: Object.freeze({
        parsed: false,
        valid: false,
        errorCount: 1,
        errors: Object.freeze([
          Object.freeze({ code: "arguments_json_parse_failed", path: "#" })
        ])
      }),
      value: undefined
    };
  }

  const errors = [];
  validateValue(value, schema, schema, "#", errors, new Set());
  return {
    report: Object.freeze({
      parsed: true,
      valid: errors.length === 0,
      errorCount: errors.length,
      errors: Object.freeze(errors)
    }),
    value: errors.length === 0 ? value : undefined
  };
}

export function validateArguments(argumentText, schema) {
  return parseAndValidate(argumentText, schema).report;
}

export function compileArgumentsForLocalExecution(argumentText, schema) {
  return parseAndValidate(argumentText, schema);
}
