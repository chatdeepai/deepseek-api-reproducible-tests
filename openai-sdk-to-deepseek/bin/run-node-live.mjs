import { mkdir, writeFile } from 'node:fs/promises';
import { runNodeLive } from '../src/node-live.mjs';
import { assertNoSecrets } from '../src/security.mjs';

const summary = await runNodeLive({
  apiKey: process.env.DEEPSEEK_API_KEY,
  allowProviderRequests: process.env.ALLOW_PROVIDER_REQUESTS === '1',
});

const output = `${JSON.stringify(summary, null, 2)}\n`;
assertNoSecrets(output);
await mkdir(new URL('../results/', import.meta.url), { recursive: true });
await writeFile(new URL('../results/node-live-summary.json', import.meta.url), output, 'utf8');
console.log(
  JSON.stringify({
    status: summary.status,
    requests_issued: summary.requests_issued,
    requests_skipped: summary.requests_skipped,
  }),
);
