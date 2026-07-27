const TASK_KINDS = new Set([
  "exact",
  "json_schema",
  "grounded_qa",
  "tool",
  "math",
]);
const VARIANTS = new Set(["baseline", "candidate"]);

function assertAscii(value, label) {
  const serialized = JSON.stringify(value);
  if (/[^\x00-\x7F]/u.test(serialized)) {
    throw new Error(`${label} must contain ASCII data only.`);
  }
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function requireNonemptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a nonempty string.`);
  }
  return value;
}

function validateTask(task) {
  requireObject(task, "Task");
  requireNonemptyString(task.id, "Task ID");
  if (!TASK_KINDS.has(task.kind)) {
    throw new Error(`Task ${task.id} has an unsupported kind.`);
  }
  if (task.critical !== true) {
    throw new Error(`Task ${task.id} must declare its criticality.`);
  }
  requireObject(task.expected, `Task ${task.id} expected contract`);

  if (task.kind === "exact") {
    requireNonemptyString(task.instruction, `Task ${task.id} instruction`);
    requireNonemptyString(task.expected.exact, `Task ${task.id} exact value`);
  } else if (task.kind === "json_schema") {
    requireNonemptyString(task.instruction, `Task ${task.id} instruction`);
    requireObject(task.expected.schema, `Task ${task.id} schema`);
  } else if (task.kind === "grounded_qa") {
    requireNonemptyString(task.context, `Task ${task.id} context`);
    requireNonemptyString(task.question, `Task ${task.id} question`);
    if (typeof task.expected.should_abstain !== "boolean") {
      throw new Error(`Task ${task.id} must declare should_abstain.`);
    }
    if (task.expected.should_abstain) {
      requireNonemptyString(
        task.expected.abstention_token,
        `Task ${task.id} abstention token`,
      );
    } else if (
      !Array.isArray(task.expected.required_facts) ||
      !Array.isArray(task.expected.forbidden_facts)
    ) {
      throw new Error(`Task ${task.id} must declare fact arrays.`);
    }
  } else if (task.kind === "tool") {
    requireNonemptyString(task.instruction, `Task ${task.id} instruction`);
    if (!Array.isArray(task.tools) || task.tools.length === 0) {
      throw new Error(`Task ${task.id} must declare tools.`);
    }
    const names = task.tools.map((tool) => {
      requireObject(tool, `Task ${task.id} tool`);
      requireObject(tool.schema, `Task ${task.id} tool schema`);
      return requireNonemptyString(tool.name, `Task ${task.id} tool name`);
    });
    if (new Set(names).size !== names.length) {
      throw new Error(`Task ${task.id} tool names must be unique.`);
    }
    if (!names.includes(task.expected.tool_name)) {
      throw new Error(`Task ${task.id} expected tool is not allowlisted.`);
    }
    requireObject(task.expected.arguments, `Task ${task.id} arguments`);
    if (task.expected.execute !== false) {
      throw new Error(`Task ${task.id} must forbid tool execution.`);
    }
  } else if (task.kind === "math") {
    requireNonemptyString(task.instruction, `Task ${task.id} instruction`);
    requireNonemptyString(
      task.expected.final_answer,
      `Task ${task.id} final answer`,
    );
  }
}

export function validateGoldenDataset(dataset) {
  requireObject(dataset, "Golden dataset");
  if (dataset.schema_version !== 1) {
    throw new Error("Golden dataset schema version must be 1.");
  }
  requireNonemptyString(dataset.dataset_id, "Dataset ID");
  if (dataset.language !== "English" || dataset.synthetic !== true) {
    throw new Error("Golden dataset must be English and synthetic.");
  }
  if (!Array.isArray(dataset.tasks) || dataset.tasks.length !== 6) {
    throw new Error("Golden dataset must contain six tasks.");
  }
  dataset.tasks.forEach(validateTask);
  const ids = dataset.tasks.map((task) => task.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Golden task IDs must be unique.");
  }
  assertAscii(dataset, "Golden dataset");
  return {
    dataset_id: dataset.dataset_id,
    task_count: dataset.tasks.length,
    kinds: [...new Set(dataset.tasks.map((task) => task.kind))].sort(),
    synthetic_fixture_inputs_public: true,
  };
}

function validateUsage(usage, taskId) {
  requireObject(usage, `Response ${taskId} usage`);
  for (const field of [
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "prompt_cache_hit_tokens",
    "prompt_cache_miss_tokens",
    "reasoning_tokens",
  ]) {
    if (!Number.isSafeInteger(usage[field]) || usage[field] < 0) {
      throw new Error(`Response ${taskId} has invalid ${field}.`);
    }
  }
  if (
    usage.prompt_cache_hit_tokens + usage.prompt_cache_miss_tokens !==
      usage.prompt_tokens ||
    usage.prompt_tokens + usage.completion_tokens !== usage.total_tokens ||
    usage.reasoning_tokens > usage.completion_tokens
  ) {
    throw new Error(`Response ${taskId} usage does not reconcile.`);
  }
}

export function validateOfflineResponses(fixture, dataset, plan) {
  requireObject(fixture, "Offline response fixture");
  if (fixture.schema_version !== 1 || fixture.synthetic !== true) {
    throw new Error("Offline responses must be schema version 1 and synthetic.");
  }
  requireNonemptyString(fixture.fixture_id, "Response fixture ID");
  if (
    !Array.isArray(fixture.responses) ||
    fixture.responses.length !== plan.planned_provider_requests
  ) {
    throw new Error("Offline response count must match the frozen plan.");
  }

  const taskIds = new Set(dataset.tasks.map((task) => task.id));
  const seen = new Set();
  for (const response of fixture.responses) {
    requireObject(response, "Offline response");
    if (!taskIds.has(response.task_id)) {
      throw new Error("An offline response references an unknown task.");
    }
    if (!VARIANTS.has(response.variant)) {
      throw new Error("An offline response variant is invalid.");
    }
    const key = `${response.task_id}:${response.variant}`;
    if (seen.has(key)) {
      throw new Error("An offline task variant cannot appear twice.");
    }
    seen.add(key);
    const planned = plan.cases.find(
      (item) =>
        item.task_id === response.task_id && item.variant === response.variant,
    );
    if (!planned || planned.model !== response.model) {
      throw new Error("An offline response does not match the frozen plan.");
    }
    const task = dataset.tasks.find((item) => item.id === response.task_id);
    if (task.kind === "tool") {
      requireObject(response.tool_call, `Response ${response.task_id} tool call`);
    } else if (typeof response.text !== "string") {
      throw new Error(`Response ${response.task_id} must contain text.`);
    }
    validateUsage(response.usage, response.task_id);
  }
  if (seen.size !== dataset.tasks.length * VARIANTS.size) {
    throw new Error("Every task must have baseline and candidate responses.");
  }
  assertAscii(fixture, "Offline response fixture");
  return {
    fixture_id: fixture.fixture_id,
    response_count: fixture.responses.length,
    pair_count: dataset.tasks.length,
    synthetic: true,
  };
}
