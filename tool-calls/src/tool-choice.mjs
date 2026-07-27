const TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/;
const STRING_CHOICES = new Set(["none", "auto", "required"]);
const MAX_TOOLS = 128;

function normalizeToolNames(toolNames) {
  if (!Array.isArray(toolNames)) {
    throw new TypeError("toolNames must be an array.");
  }
  if (toolNames.length > MAX_TOOLS) {
    throw new Error(`The documented tool limit is ${MAX_TOOLS}.`);
  }

  const normalized = [];
  const seen = new Set();
  for (const name of toolNames) {
    if (typeof name !== "string" || !TOOL_NAME.test(name)) {
      throw new Error("Every tool name must match the documented name contract.");
    }
    if (seen.has(name)) {
      throw new Error("Tool names must be unique.");
    }
    seen.add(name);
    normalized.push(name);
  }
  return normalized;
}

export function normalizeToolChoice(choice, { toolNames = [] } = {}) {
  const names = normalizeToolNames(toolNames);

  if (choice === undefined || choice === null) {
    return Object.freeze({
      kind: names.length > 0 ? "auto" : "none",
      requestValue: names.length > 0 ? "auto" : "none",
      namedTool: null
    });
  }

  if (typeof choice === "string") {
    if (!STRING_CHOICES.has(choice)) {
      throw new Error("tool_choice must be none, auto, required, or a named function.");
    }
    if ((choice === "auto" || choice === "required") && names.length === 0) {
      throw new Error(`${choice} requires at least one declared tool.`);
    }
    return Object.freeze({
      kind: choice,
      requestValue: choice,
      namedTool: null
    });
  }

  if (
    typeof choice === "object" &&
    choice !== null &&
    !Array.isArray(choice) &&
    choice.type === "function" &&
    typeof choice.function?.name === "string" &&
    TOOL_NAME.test(choice.function.name)
  ) {
    const namedTool = choice.function.name;
    if (!names.includes(namedTool)) {
      throw new Error("Named tool_choice must reference an allowlisted tool.");
    }
    return Object.freeze({
      kind: "named",
      requestValue: Object.freeze({
        type: "function",
        function: Object.freeze({ name: namedTool })
      }),
      namedTool
    });
  }

  throw new Error("Named tool_choice has an invalid shape.");
}

export function validateObservedCalls(choicePolicy, toolCalls) {
  if (!choicePolicy || typeof choicePolicy !== "object") {
    throw new TypeError("A normalized tool-choice policy is required.");
  }
  if (!Array.isArray(toolCalls)) {
    throw new TypeError("toolCalls must be an array.");
  }

  if (choicePolicy.kind === "none" && toolCalls.length > 0) {
    return Object.freeze({ valid: false, code: "tool_choice_none_violation" });
  }
  if (choicePolicy.kind === "required" && toolCalls.length === 0) {
    return Object.freeze({ valid: false, code: "tool_choice_required_violation" });
  }
  if (
    choicePolicy.kind === "named" &&
    (toolCalls.length === 0 ||
      toolCalls.some((call) => call?.function?.name !== choicePolicy.namedTool))
  ) {
    return Object.freeze({ valid: false, code: "tool_choice_named_violation" });
  }

  return Object.freeze({ valid: true, code: null });
}

export function buildToolChoiceMatrix({ toolNames, namedTool }) {
  const names = normalizeToolNames(toolNames);
  if (!names.includes(namedTool)) {
    throw new Error("namedTool must be present in toolNames.");
  }

  const requestedChoices = [
    "none",
    "auto",
    "required",
    { type: "function", function: { name: namedTool } }
  ];
  const matrix = [];

  for (const thinking of ["disabled", "enabled"]) {
    for (const requested of requestedChoices) {
      const policy = normalizeToolChoice(requested, { toolNames: names });
      matrix.push(
        Object.freeze({
          thinking,
          requested:
            policy.kind === "named" ? `named:${policy.namedTool}` : policy.kind,
          callPolicy:
            policy.kind === "none"
              ? "forbid"
              : policy.kind === "required"
                ? "require_one_or_more"
                : policy.kind === "named"
                  ? "require_named"
                  : "permit_zero_or_more",
          reasoningReplayRequired: thinking === "enabled" && policy.kind !== "none"
        })
      );
    }
  }

  return Object.freeze(matrix);
}

export const toolChoiceContract = Object.freeze({
  stringChoices: Object.freeze([...STRING_CHOICES]),
  maximumTools: MAX_TOOLS,
  toolNamePattern: TOOL_NAME.source
});
