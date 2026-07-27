import { evaluateJsonContract, validateSchemaValue } from "./schema.mjs";

export function evaluateExact(text, expected) {
  const actual = typeof text === "string" ? text : "";
  return {
    passed: actual === expected,
    score: actual === expected ? 1 : 0,
    exact_match: actual === expected,
    expected_chars: expected.length,
    observed_chars: actual.length,
    response_text_retained: false,
  };
}

export function evaluateGroundedAnswer(text, expected) {
  const actual = typeof text === "string" ? text.trim() : "";
  if (expected.should_abstain) {
    const abstained = actual === expected.abstention_token;
    return {
      passed: abstained,
      score: abstained ? 1 : 0,
      abstention_expected: true,
      abstention_observed: abstained,
      required_fact_count: 0,
      matched_fact_count: 0,
      forbidden_fact_match_count: 0,
      response_text_retained: false,
    };
  }

  const normalized = actual.toLowerCase();
  const matchedFacts = expected.required_facts.filter((fact) =>
    normalized.includes(fact.toLowerCase()),
  ).length;
  const forbiddenMatches = expected.forbidden_facts.filter((fact) =>
    normalized.includes(fact.toLowerCase()),
  ).length;
  const passed =
    matchedFacts === expected.required_facts.length && forbiddenMatches === 0;
  return {
    passed,
    score:
      forbiddenMatches > 0
        ? 0
        : expected.required_facts.length === 0
        ? passed
          ? 1
          : 0
        : Number((matchedFacts / expected.required_facts.length).toFixed(6)),
    abstention_expected: false,
    abstention_observed: false,
    required_fact_count: expected.required_facts.length,
    matched_fact_count: matchedFacts,
    forbidden_fact_match_count: forbiddenMatches,
    response_text_retained: false,
  };
}

function sameJsonValue(left, right) {
  if (left === right) return true;
  if (
    !left ||
    !right ||
    typeof left !== "object" ||
    typeof right !== "object" ||
    Array.isArray(left) !== Array.isArray(right)
  ) {
    return false;
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key, index) =>
      key === rightKeys[index] && sameJsonValue(left[key], right[key]),
  );
}

export function evaluateToolProposal(toolCall, task) {
  const expectedName = task.expected.tool_name;
  const declared = task.tools.find((item) => item.name === toolCall?.name);
  let parsedArguments = null;
  let jsonValid = false;
  if (typeof toolCall?.arguments === "string") {
    try {
      parsedArguments = JSON.parse(toolCall.arguments);
      jsonValid = true;
    } catch {
      jsonValid = false;
    }
  }
  const schemaErrors =
    jsonValid && declared
      ? validateSchemaValue(parsedArguments, declared.schema)
      : [{ code: "schema_not_evaluated" }];
  const nameMatch = toolCall?.name === expectedName;
  const argumentsExact =
    jsonValid && sameJsonValue(parsedArguments, task.expected.arguments);
  const passed =
    nameMatch && Boolean(declared) && schemaErrors.length === 0 && argumentsExact;

  return {
    passed,
    score: passed ? 1 : 0,
    tool_name_match: nameMatch,
    tool_allowlisted: Boolean(declared),
    arguments_json_valid: jsonValid,
    arguments_schema_valid: schemaErrors.length === 0,
    arguments_exact_match: argumentsExact,
    tool_executed: false,
    tool_arguments_retained: false,
    provider_tool_call_id_retained: false,
  };
}

export function evaluateMathFinal(text, expectedFinal) {
  const actual = typeof text === "string" ? text : "";
  const match = actual.match(/FINAL:\s*([+-]?\d+(?:\.\d+)?)\s*$/);
  const correct = Boolean(match) && match[1] === expectedFinal;
  return {
    passed: correct,
    score: correct ? 1 : 0,
    final_answer_present: Boolean(match),
    final_answer_correct: correct,
    reasoning_retained: false,
    response_text_retained: false,
  };
}

function evaluateResponseContract(task, response) {
  const expectedFinishReason =
    task.kind === "tool" ? "tool_calls" : "stop";
  const observedToolCallCount = Number.isInteger(response.tool_call_count)
    ? response.tool_call_count
    : null;
  const toolCallCountOk =
    task.kind !== "tool" || observedToolCallCount === 1;
  const finishReasonOk = response.finish_reason === expectedFinishReason;
  const returnedModelMatches = response.returned_model_matches === true;

  return {
    finish_reason_expected: expectedFinishReason,
    finish_reason_observed:
      typeof response.finish_reason === "string"
        ? response.finish_reason
        : null,
    finish_reason_ok: finishReasonOk,
    returned_model_matches: returnedModelMatches,
    tool_call_count: observedToolCallCount,
    tool_call_count_ok: toolCallCountOk,
    response_contract_passed:
      finishReasonOk && returnedModelMatches && toolCallCountOk,
  };
}

export function evaluateTask(task, response) {
  let taskDetail;
  if (task.kind === "exact") {
    taskDetail = evaluateExact(response.text, task.expected.exact);
  } else if (task.kind === "json_schema") {
    const detail = evaluateJsonContract(
      response.text,
      task.expected.schema,
    );
    taskDetail = {
      passed: detail.parse_valid && detail.schema_valid,
      score: detail.parse_valid && detail.schema_valid ? 1 : 0,
      ...detail,
      response_text_retained: false,
    };
  } else if (task.kind === "grounded_qa") {
    taskDetail = evaluateGroundedAnswer(response.text, task.expected);
  } else if (task.kind === "tool") {
    taskDetail = evaluateToolProposal(response.tool_call, task);
  } else if (task.kind === "math") {
    taskDetail = evaluateMathFinal(response.text, task.expected.final_answer);
  } else {
    throw new Error(`Unsupported task kind: ${String(task.kind)}`);
  }

  const responseContract = evaluateResponseContract(task, response);
  const passed = taskDetail.passed && responseContract.response_contract_passed;
  return {
    ...taskDetail,
    task_logic_passed: taskDetail.passed,
    ...responseContract,
    passed,
    score: passed ? taskDetail.score : 0,
  };
}
