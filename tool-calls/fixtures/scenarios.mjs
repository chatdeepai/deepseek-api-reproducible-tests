export const inventorySchema = Object.freeze({
  type: "object",
  properties: {
    sku: { type: "string", pattern: "^SKU-[0-9]{3}$" },
    warehouse: { type: "string", enum: ["west", "east"] },
    quantity: { type: "integer", minimum: 1, maximum: 20 }
  },
  required: ["sku", "warehouse", "quantity"],
  additionalProperties: false
});

export const shippingSchema = Object.freeze({
  type: "object",
  properties: {
    postal_code: { type: "string", pattern: "^[0-9]{5}$" },
    service: { type: "string", enum: ["ground", "express"] }
  },
  required: ["postal_code", "service"],
  additionalProperties: false
});

export const totalSchema = Object.freeze({
  type: "object",
  properties: {
    unit_price: { type: "number", minimum: 0, maximum: 1000 },
    quantity: { type: "integer", minimum: 1, maximum: 20 }
  },
  required: ["unit_price", "quantity"],
  additionalProperties: false
});

export const strictToolDefinition = Object.freeze({
  type: "function",
  function: {
    name: "prepare_quote",
    description: "Prepare a synthetic quote.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        customer_email: { type: "string", format: "email" },
        request_id: { type: "string", format: "uuid" },
        priority: { type: "string", enum: ["normal", "urgent"] },
        discount_percent: {
          type: "number",
          minimum: 0,
          maximum: 25,
          multipleOf: 0.5
        },
        lines: {
          type: "array",
          items: { $ref: "#/$def/line" }
        },
        destination: {
          anyOf: [
            { type: "string", pattern: "^[0-9]{5}$" },
            { type: "string", format: "hostname" }
          ]
        }
      },
      required: [
        "customer_email",
        "request_id",
        "priority",
        "discount_percent",
        "lines",
        "destination"
      ],
      additionalProperties: false,
      $def: {
        line: {
          type: "object",
          properties: {
            sku: { type: "string", pattern: "^SKU-[0-9]{3}$" },
            quantity: { type: "integer", minimum: 1, maximum: 20 }
          },
          required: ["sku", "quantity"],
          additionalProperties: false
        }
      }
    }
  }
});

export function createSyntheticRegistryDefinitions() {
  return [
    {
      name: "lookup_inventory",
      parameters: inventorySchema,
      execute: ({ sku, warehouse, quantity }) => ({
        sku,
        warehouse,
        requested: quantity,
        available: quantity <= 8
      })
    },
    {
      name: "lookup_shipping",
      parameters: shippingSchema,
      execute: ({ postal_code, service }) => ({
        postal_code,
        service,
        days: service === "express" ? 2 : 5
      })
    },
    {
      name: "compute_total",
      parameters: totalSchema,
      execute: ({ unit_price, quantity }) => ({
        total: Number((unit_price * quantity).toFixed(2))
      })
    }
  ];
}

export const nonThinkingSingleCallTurns = Object.freeze([
  {
    finishReason: "tool_calls",
    elapsedMs: 120,
    usage: {
      prompt_tokens: 40,
      completion_tokens: 12,
      total_tokens: 52
    },
    message: {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "synthetic-call-single-1",
          type: "function",
          function: {
            name: "lookup_inventory",
            arguments: "{\"sku\":\"SKU-101\",\"warehouse\":\"west\",\"quantity\":2}"
          }
        }
      ]
    }
  },
  {
    finishReason: "stop",
    elapsedMs: 80,
    usage: {
      prompt_tokens: 64,
      completion_tokens: 18,
      total_tokens: 82
    },
    message: {
      role: "assistant",
      content: "Synthetic final answer.",
      tool_calls: null
    }
  }
]);

export const thinkingMultiToolTurns = Object.freeze([
  {
    finishReason: "tool_calls",
    elapsedMs: 200,
    usage: {
      prompt_tokens: 100,
      completion_tokens: 30,
      total_tokens: 130,
      prompt_cache_hit_tokens: 20,
      prompt_cache_miss_tokens: 80
    },
    message: {
      role: "assistant",
      content: null,
      reasoning_content: "Synthetic planning trace one.",
      tool_calls: [
        {
          id: "synthetic-call-multi-1",
          type: "function",
          function: {
            name: "lookup_inventory",
            arguments: "{\"sku\":\"SKU-202\",\"warehouse\":\"east\",\"quantity\":3}"
          }
        },
        {
          id: "synthetic-call-multi-2",
          type: "function",
          function: {
            name: "lookup_shipping",
            arguments: "{\"postal_code\":\"94105\",\"service\":\"express\"}"
          }
        }
      ]
    }
  },
  {
    finishReason: "tool_calls",
    elapsedMs: 300,
    usage: {
      prompt_tokens: 150,
      completion_tokens: 24,
      total_tokens: 174,
      prompt_cache_hit_tokens: 50,
      prompt_cache_miss_tokens: 100
    },
    message: {
      role: "assistant",
      content: null,
      reasoning_content: "Synthetic planning trace two.",
      tool_calls: [
        {
          id: "synthetic-call-multi-3",
          type: "function",
          function: {
            name: "compute_total",
            arguments: "{\"unit_price\":19.5,\"quantity\":3}"
          }
        }
      ]
    }
  },
  {
    finishReason: "stop",
    elapsedMs: 100,
    usage: {
      prompt_tokens: 180,
      completion_tokens: 20,
      total_tokens: 200,
      prompt_cache_hit_tokens: 60,
      prompt_cache_miss_tokens: 120
    },
    message: {
      role: "assistant",
      content: "Synthetic grounded final answer.",
      reasoning_content: "Synthetic final planning trace.",
      tool_calls: null
    }
  }
]);

export function withMissingReasoning() {
  const turns = structuredClone(thinkingMultiToolTurns);
  delete turns[0].message.reasoning_content;
  return turns;
}

export function withUnknownTool() {
  const turns = structuredClone(nonThinkingSingleCallTurns);
  turns[0].message.tool_calls[0].function.name = "unregistered_tool";
  return turns;
}

export function withDuplicateCallId() {
  const turns = structuredClone(thinkingMultiToolTurns);
  turns[1].message.tool_calls[0].id = turns[0].message.tool_calls[0].id;
  return turns;
}

export function endlessToolTurns(count = 5) {
  return Array.from({ length: count }, (_, index) => ({
    finishReason: "tool_calls",
    elapsedMs: 10 + index,
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15
    },
    message: {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: `synthetic-loop-call-${index + 1}`,
          type: "function",
          function: {
            name: "lookup_inventory",
            arguments: "{\"sku\":\"SKU-303\",\"warehouse\":\"west\",\"quantity\":1}"
          }
        }
      ]
    }
  }));
}
