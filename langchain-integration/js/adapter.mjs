import { ChatDeepSeek } from "@langchain/deepseek";

export const OFFLINE_PLACEHOLDER = "offline-only-not-a-credential";

export function buildChatModel({
  model,
  apiKey,
  baseURL,
  maxTokens = 64,
  thinking = "disabled",
  timeout = 30000,
  maxRetries = 0,
}) {
  if (!model || !apiKey || !baseURL) {
    throw new Error("model, apiKey, and baseURL are required.");
  }
  if (!["enabled", "disabled"].includes(thinking)) {
    throw new Error("Thinking must be explicit.");
  }
  if (!(baseURL.startsWith("https://") || /^http:\/\/(127\.0\.0\.1|localhost):/.test(baseURL))) {
    throw new Error("Only HTTPS or loopback test endpoints are allowed.");
  }
  return new ChatDeepSeek({
    model,
    apiKey,
    maxTokens,
    maxRetries,
    timeout,
    temperature: 0,
    configuration: { baseURL },
    modelKwargs: {
      thinking: { type: thinking },
    },
  });
}

export const STRUCTURED_SCHEMA = {
  title: "StructuredAnswer",
  type: "object",
  properties: {
    label: { type: "string" },
    score: { type: "integer", minimum: 0, maximum: 5 },
  },
  required: ["label", "score"],
  additionalProperties: false,
};

export const TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "SyntheticLookup",
    description: "Look up one synthetic local key.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string" },
      },
      required: ["key"],
      additionalProperties: false,
    },
  },
};

