import assert from 'node:assert/strict';
import test from 'node:test';
import { runNodeLive } from '../src/node-live.mjs';
import { loadPlan, validatePlan } from '../src/plan.mjs';
import { assertAllowlistedResult, findSecrets } from '../src/security.mjs';

test('the preregistered provider plan is exactly 20 serial requests', async () => {
  const plan = await loadPlan();
  assert.equal(validatePlan(plan), true);
  assert.equal(plan.provider_request_cap, 20);
  assert.equal(plan.planned_provider_requests, 20);
  assert.equal(plan.concurrency, 1);
  assert.equal(plan.automatic_retries, 0);
  assert.equal(plan.cases.filter((item) => item.sdk === 'python').length, 10);
  assert.equal(plan.cases.filter((item) => item.sdk === 'node').length, 10);
});

test('the matrix covers every required scenario in both SDKs', async () => {
  const plan = await loadPlan();
  const required = [
    'models_list',
    'basic_chat',
    'thinking_disabled',
    'thinking_enabled',
    'streaming',
    'json_output',
    'tool_initial',
    'tool_continuation',
    'invalid_model',
    'alias_probe',
  ];
  for (const sdk of ['python', 'node']) {
    assert.deepEqual(
      plan.cases.filter((item) => item.sdk === sdk).map((item) => item.scenario),
      required,
    );
  }
});

test('generation cases retain low token caps and both V4 variants are covered', async () => {
  const plan = await loadPlan();
  const generationCases = plan.cases.filter((item) => item.max_tokens !== null);
  assert.ok(generationCases.every((item) => item.max_tokens >= 16 && item.max_tokens <= 96));
  const thinkingModels = plan.cases
    .filter((item) => item.scenario === 'thinking_enabled')
    .map((item) => item.model);
  assert.deepEqual(thinkingModels, ['deepseek-v4-pro', 'deepseek-v4-pro']);
  assert.ok(plan.cases.some((item) => item.model === 'deepseek-v4-flash'));
});

test('live runner refuses to import the SDK or send without explicit permission', async () => {
  await assert.rejects(
    runNodeLive({ apiKey: undefined, allowProviderRequests: false }),
    /Provider requests are disabled/,
  );
});

test('result allowlist rejects raw evidence fields', () => {
  assert.throws(
    () => assertAllowlistedResult({ cases: [{ content: 'not allowed' }] }),
    /Forbidden result field/,
  );
  assert.equal(assertAllowlistedResult({ cases: [{ content_nonempty: true }] }), true);
});

test('secret scan detects credential-like strings without storing one in the fixture', () => {
  const synthetic = `sk-${'A'.repeat(24)}`;
  assert.equal(findSecrets(synthetic).length, 1);
  assert.equal(findSecrets('DEEPSEEK_API_KEY is read from the environment.').length, 0);
});

