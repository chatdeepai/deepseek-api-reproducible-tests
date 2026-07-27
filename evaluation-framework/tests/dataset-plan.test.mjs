import assert from "node:assert/strict";
import test from "node:test";
import {
  validateGoldenDataset,
  validateOfflineResponses,
} from "../source/dataset.mjs";
import {
  canonicalPlanJson,
  hashLivePlan,
  validateLivePlan,
} from "../source/plan.mjs";
import { clone, loadFixtures } from "./helpers.mjs";

const fixtures = await loadFixtures();

test("golden dataset validates six public synthetic inputs", () => {
  const result = validateGoldenDataset(fixtures.dataset);
  assert.equal(result.task_count, 6);
  assert.equal(result.synthetic_fixture_inputs_public, true);
  assert.equal(result.kinds.length, 5);
});

test("golden dataset rejects duplicate task IDs", () => {
  const dataset = clone(fixtures.dataset);
  dataset.tasks[1].id = dataset.tasks[0].id;
  assert.throws(() => validateGoldenDataset(dataset), /unique/);
});

test("golden dataset rejects non-ASCII fixture text", () => {
  const dataset = clone(fixtures.dataset);
  dataset.tasks[0].instruction += String.fromCodePoint(233);
  assert.throws(() => validateGoldenDataset(dataset), /ASCII/);
});

test("golden dataset requires tools to remain non-executing", () => {
  const dataset = clone(fixtures.dataset);
  dataset.tasks.find((item) => item.kind === "tool").expected.execute = true;
  assert.throws(() => validateGoldenDataset(dataset), /forbid tool execution/);
});

test("offline responses validate twelve rows and six pairs", () => {
  const result = validateOfflineResponses(
    fixtures.responses,
    fixtures.dataset,
    fixtures.livePlan,
  );
  assert.deepEqual(
    { responses: result.response_count, pairs: result.pair_count },
    { responses: 12, pairs: 6 },
  );
});

test("offline responses reject a missing planned row", () => {
  const responses = clone(fixtures.responses);
  responses.responses.pop();
  assert.throws(
    () =>
      validateOfflineResponses(
        responses,
        fixtures.dataset,
        fixtures.livePlan,
      ),
    /count/,
  );
});

test("offline responses reject unreconciled usage", () => {
  const responses = clone(fixtures.responses);
  responses.responses[0].usage.total_tokens += 1;
  assert.throws(
    () =>
      validateOfflineResponses(
        responses,
        fixtures.dataset,
        fixtures.livePlan,
      ),
    /reconcile/,
  );
});

test("live plan validates hard safety limits", () => {
  const result = validateLivePlan(fixtures.livePlan);
  assert.deepEqual(
    {
      status: result.status,
      requests: result.planned_provider_requests,
      concurrency: result.concurrency,
      retries: result.automatic_retries,
    },
    { status: "not_run", requests: 12, concurrency: 1, retries: 0 },
  );
});

test("live plan rejects concurrency drift", () => {
  const plan = clone(fixtures.livePlan);
  plan.concurrency = 2;
  assert.throws(() => validateLivePlan(plan), /safety limits/);
});

test("live plan rejects retry drift", () => {
  const plan = clone(fixtures.livePlan);
  plan.automatic_retries = 1;
  assert.throws(() => validateLivePlan(plan), /safety limits/);
});

test("canonical plan JSON is independent of object key order", () => {
  const reversed = Object.fromEntries(
    Object.entries(fixtures.livePlan).reverse(),
  );
  assert.equal(
    canonicalPlanJson(reversed),
    canonicalPlanJson(fixtures.livePlan),
  );
});

test("frozen live plan has the expected SHA-256 digest", () => {
  assert.equal(
    hashLivePlan(fixtures.livePlan),
    "135c8d1b4682d88824d0cf4f9f9ad2e084480cdad08c9d9abd3155658033d1ed",
  );
});
