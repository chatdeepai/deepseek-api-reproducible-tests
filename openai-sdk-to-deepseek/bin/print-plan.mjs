import { loadPlan } from '../src/plan.mjs';

const plan = await loadPlan();
const counts = plan.cases.reduce((groups, item) => {
  groups[item.sdk] ??= [];
  groups[item.sdk].push(item);
  return groups;
}, {});

console.log(
  JSON.stringify(
    {
      status: plan.status,
      provider_request_cap: plan.provider_request_cap,
      planned_provider_requests: plan.planned_provider_requests,
      python_requests: counts.python?.length ?? 0,
      node_requests: counts.node?.length ?? 0,
      concurrency: plan.concurrency,
      automatic_retries: plan.automatic_retries,
    },
    null,
    2,
  ),
);
