import { runLive } from "./live-runner.js";

try {
  const summary = await runLive({
    allowProviderRequests: process.env.ALLOW_PROVIDER_REQUESTS === "1",
    apiKey: process.env.DEEPSEEK_API_KEY,
  });
  console.log(
    `Completed ${String(summary.provider_requests_issued)} provider requests; privacy audit passed.`,
  );
} catch {
  console.error("Live run refused or stopped without publishable raw output.");
  process.exitCode = 1;
}
