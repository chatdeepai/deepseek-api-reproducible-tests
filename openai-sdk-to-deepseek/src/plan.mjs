import { readFile } from 'node:fs/promises';

const PLAN_URL = new URL('../fixtures/request-plan.json', import.meta.url);

export async function loadPlan() {
  const plan = JSON.parse(await readFile(PLAN_URL, 'utf8'));
  validatePlan(plan);
  return plan;
}

export function validatePlan(plan) {
  if (!plan || !Array.isArray(plan.cases)) {
    throw new Error('Plan must contain a cases array.');
  }
  if (plan.provider_request_cap !== 20) {
    throw new Error('The provider request cap must remain exactly 20.');
  }
  if (plan.planned_provider_requests !== plan.cases.length) {
    throw new Error('planned_provider_requests must match the case count.');
  }
  if (plan.cases.length > plan.provider_request_cap) {
    throw new Error('The plan exceeds the provider request cap.');
  }
  if (plan.concurrency !== 1 || plan.automatic_retries !== 0) {
    throw new Error('The plan must use concurrency 1 and zero automatic retries.');
  }

  const expectedSequences = plan.cases.map((item) => item.sequence);
  const actualSequences = Array.from({ length: plan.cases.length }, (_, index) => index + 1);
  if (JSON.stringify(expectedSequences) !== JSON.stringify(actualSequences)) {
    throw new Error('Case sequence values must be contiguous and ordered.');
  }

  const ids = new Set(plan.cases.map((item) => item.id));
  if (ids.size !== plan.cases.length) {
    throw new Error('Case IDs must be unique.');
  }

  for (const sdk of ['python', 'node']) {
    const cases = plan.cases.filter((item) => item.sdk === sdk);
    if (cases.length !== 10) {
      throw new Error(`${sdk} must have exactly ten preregistered requests.`);
    }
  }
  return true;
}

export function casesForSdk(plan, sdk) {
  return plan.cases.filter((item) => item.sdk === sdk);
}
