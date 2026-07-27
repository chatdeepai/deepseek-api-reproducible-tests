import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateExact,
  evaluateGroundedAnswer,
  evaluateMathFinal,
  evaluateTask,
  evaluateToolProposal,
} from "../source/evaluators.mjs";
import { responseForEvaluator } from "../source/live-adapter.mjs";
import {
  evaluateJsonContract,
  validateSchemaValue,
} from "../source/schema.mjs";
import { loadFixtures } from "./helpers.mjs";

const fixtures = await loadFixtures();
const exactTask = fixtures.dataset.tasks.find(
  (item) => item.id === "exact-token",
);
const jsonTask = fixtures.dataset.tasks.find(
  (item) => item.id === "json-contract",
);
const groundedTask = fixtures.dataset.tasks.find(
  (item) => item.id === "grounded-answer",
);
const abstentionTask = fixtures.dataset.tasks.find(
  (item) => item.id === "grounded-abstention",
);
const toolTask = fixtures.dataset.tasks.find(
  (item) => item.id === "tool-selection",
);
const mathTask = fixtures.dataset.tasks.find(
  (item) => item.id === "thinking-math",
);

test("exact evaluator passes the frozen token", () => {
  assert.equal(evaluateExact("EVAL_OK", "EVAL_OK").passed, true);
  assert.equal(
    evaluateTask(exactTask, {
      text: "EVAL_OK",
      finish_reason: "stop",
      returned_model_matches: true,
      tool_call_count: 0,
    }).passed,
    true,
  );
  assert.equal(
    evaluateTask(exactTask, {
      text: "EVAL_OK",
      finish_reason: "content_filter",
      returned_model_matches: true,
      tool_call_count: 0,
    }).passed,
    false,
  );
  assert.equal(
    evaluateTask(exactTask, {
      text: "EVAL_OK",
      finish_reason: "stop",
      returned_model_matches: false,
      tool_call_count: 0,
    }).passed,
    false,
  );
});

test("exact evaluator rejects whitespace drift", () => {
  assert.equal(evaluateExact("EVAL_OK\n", "EVAL_OK").passed, false);
});

test("JSON evaluator distinguishes parse failure", () => {
  const result = evaluateJsonContract("{", jsonTask.expected.schema);
  assert.equal(result.parse_valid, false);
  assert.deepEqual(result.error_codes, ["json_parse_error"]);
});

test("JSON evaluator accepts a valid contract", () => {
  const result = evaluateJsonContract(
    '{"category":"urgent","count":3}',
    jsonTask.expected.schema,
  );
  assert.equal(result.parse_valid, true);
  assert.equal(result.schema_valid, true);
  assert.equal(
    evaluateTask(jsonTask, {
      text: '{"category":"urgent","count":3}',
      finish_reason: "stop",
      returned_model_matches: true,
      tool_call_count: 0,
    }).passed,
    true,
  );
  assert.equal(
    evaluateTask(jsonTask, {
      text: '{"category":"urgent","count":3}',
      finish_reason: "length",
      returned_model_matches: true,
      tool_call_count: 0,
    }).passed,
    false,
  );
});

test("schema validator reports a missing required property", () => {
  const errors = validateSchemaValue(
    { category: "urgent" },
    jsonTask.expected.schema,
  );
  assert.equal(
    errors.some((item) => item.code === "required_property_missing"),
    true,
  );
});

test("schema validator rejects additional properties", () => {
  const errors = validateSchemaValue(
    { category: "urgent", count: 3, note: "extra" },
    jsonTask.expected.schema,
  );
  assert.equal(
    errors.some((item) => item.code === "additional_property"),
    true,
  );
});

test("schema validator rejects an enum mismatch", () => {
  const errors = validateSchemaValue(
    { category: "unknown", count: 3 },
    jsonTask.expected.schema,
  );
  assert.equal(errors.some((item) => item.code === "enum_mismatch"), true);
});

test("grounded evaluator requires every frozen fact", () => {
  const result = evaluateGroundedAnswer(
    "The date is 14 March 2032 and the color is amber.",
    groundedTask.expected,
  );
  assert.equal(result.passed, true);
  assert.equal(result.matched_fact_count, 2);
});

test("grounded evaluator gives a bounded partial score", () => {
  const result = evaluateGroundedAnswer(
    "The designated color is amber.",
    groundedTask.expected,
  );
  assert.equal(result.passed, false);
  assert.equal(result.score, 0.5);
});

test("grounded evaluator zeroes a forbidden-fact answer", () => {
  const result = evaluateGroundedAnswer(
    "14 March 2032, amber, budget.",
    groundedTask.expected,
  );
  assert.equal(result.passed, false);
  assert.equal(result.score, 0);
});

test("abstention evaluator is strict", () => {
  assert.equal(
    evaluateGroundedAnswer(
      "INSUFFICIENT_CONTEXT",
      abstentionTask.expected,
    ).passed,
    true,
  );
  assert.equal(
    evaluateGroundedAnswer(
      "Insufficient context",
      abstentionTask.expected,
    ).passed,
    false,
  );
});

test("tool evaluator validates but never executes", () => {
  const functionCall = {
    name: "lookup_synthetic_record",
    arguments: '{"key":"DEMO_7"}',
  };
  const result = evaluateToolProposal(functionCall, toolTask);
  assert.equal(result.passed, true);
  assert.equal(result.tool_executed, false);
  assert.equal(result.tool_arguments_retained, false);

  const oneCall = responseForEvaluator(toolTask, {
    message: { tool_calls: [{ function: functionCall }] },
    finishReason: "tool_calls",
    returnedModelMatches: true,
  });
  assert.equal(oneCall.tool_call_count, 1);
  assert.equal(evaluateTask(toolTask, oneCall).passed, true);

  const twoCalls = responseForEvaluator(toolTask, {
    message: {
      tool_calls: [
        { function: functionCall },
        {
          function: {
            name: "summarize_synthetic_record",
            arguments: '{"key":"DEMO_7"}',
          },
        },
      ],
    },
    finishReason: "tool_calls",
    returnedModelMatches: true,
  });
  const extraCallResult = evaluateTask(toolTask, twoCalls);
  assert.equal(extraCallResult.tool_call_count, 2);
  assert.equal(extraCallResult.tool_call_count_ok, false);
  assert.equal(extraCallResult.passed, false);
  assert.equal(
    evaluateTask(toolTask, { ...oneCall, finish_reason: "stop" }).passed,
    false,
  );
});

test("tool evaluator rejects a wrong allowlisted tool", () => {
  const result = evaluateToolProposal(
    {
      name: "summarize_synthetic_record",
      arguments: '{"key":"DEMO_7"}',
    },
    toolTask,
  );
  assert.equal(result.passed, false);
  assert.equal(result.tool_allowlisted, true);
  assert.equal(result.tool_name_match, false);
});

test("tool evaluator rejects invalid arguments without executing", () => {
  const result = evaluateToolProposal(
    {
      name: "lookup_synthetic_record",
      arguments: '{"key":"not allowed"}',
    },
    toolTask,
  );
  assert.equal(result.arguments_json_valid, true);
  assert.equal(result.arguments_schema_valid, false);
  assert.equal(result.tool_executed, false);
});

test("math evaluator checks a terminal final answer only", () => {
  const result = evaluateMathFinal("Work omitted.\nFINAL: 331", "331");
  assert.equal(result.passed, true);
  assert.equal(result.reasoning_retained, false);
  assert.equal(
    evaluateTask(mathTask, {
      text: "Work omitted.\nFINAL: 331",
      finish_reason: "stop",
      returned_model_matches: true,
      tool_call_count: 0,
    }).passed,
    true,
  );
});

test("math evaluator rejects text after the final answer", () => {
  assert.equal(
    evaluateMathFinal("FINAL: 331\nAdditional claim", "331").passed,
    false,
  );
});
