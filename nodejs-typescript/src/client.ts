import OpenAI from "openai";

export const OFFLINE_PLACEHOLDER = "offline-only-not-a-credential";
export const PROVIDER_ORIGIN = "https://api.deepseek.com";

function allowedBaseURL(value: string): boolean {
  return (
    value === PROVIDER_ORIGIN ||
    /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(value)
  );
}

export function buildClient(options: {
  apiKey: string;
  baseURL: string;
  timeoutMs: number;
}): OpenAI {
  if (
    typeof options.apiKey !== "string" ||
    options.apiKey.length < 8 ||
    !allowedBaseURL(options.baseURL)
  ) {
    throw new Error("Client configuration failed validation.");
  }
  return new OpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    timeout: options.timeoutMs,
    maxRetries: 0,
    logLevel: "off",
  });
}
