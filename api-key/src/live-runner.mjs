import { acceptInMemoryCredential } from "./env-guard.mjs";
import { sanitizeForPublic } from "./redact.mjs";

export const API_ORIGIN = "https://api.deepseek.com";
export const PAID_COMPLETION_PERMIT = "ALLOW_ONE_PAID_COMPLETION";

const ENDPOINTS = Object.freeze({
  models: "/models",
  balance: "/user/balance",
  completions: "/chat/completions"
});

const ALLOWED_REQUESTS = new Set([
  "GET /models",
  "GET /user/balance",
  "POST /chat/completions"
]);

const SYNTHETIC_WRONG_SCHEME = "Basic " + "c3ludGhldGljOmNvbnRyb2w=";
const SYNTHETIC_INVALID_BEARER = "Bearer " + "not-a-real-deepseek-credential";
const LIVE_MODEL = "deepseek-v4-flash";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_REVOCATION_POLLS = 6;
const MAX_POLL_INTERVAL_MS = 30_000;

let serialTail = Promise.resolve();
let networkInFlight = 0;
let observedPeakConcurrency = 0;
let processPaidCompletionAttempts = 0;

function enqueueNetwork(task) {
  const execute = async () => {
    networkInFlight += 1;
    observedPeakConcurrency = Math.max(observedPeakConcurrency, networkInFlight);
    if (networkInFlight > 1) {
      networkInFlight -= 1;
      throw new Error("Network concurrency guard exceeded.");
    }
    try {
      return await task();
    } finally {
      networkInFlight -= 1;
    }
  };

  const result = serialTail.then(execute, execute);
  serialTail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function classifyStatus(status) {
  if (status >= 200 && status <= 299) return "success";
  if (status === 400) return "invalid_request";
  if (status === 401) return "auth_rejected";
  if (status === 402) return "insufficient_balance";
  if (status === 403) return "forbidden";
  if (status === 408) return "request_timeout";
  if (status === 422) return "invalid_parameters";
  if (status === 429) return "rate_limited";
  if (status >= 500 && status <= 599) return "provider_error";
  return "unexpected_status";
}

function outcomeForExpected(status, expected) {
  if (expected === "authorized") {
    return status === 200;
  }
  if (expected === "auth_rejected") {
    return status === 401;
  }
  return false;
}

function assertPathAndMethod(path, method) {
  if (!Object.values(ENDPOINTS).includes(path)) {
    throw new Error("Endpoint is outside the live allowlist.");
  }
  if (!ALLOWED_REQUESTS.has(`${method} ${path}`)) {
    throw new Error("Method and endpoint combination is outside the live allowlist.");
  }
}

function buildPublicBase({ caseId, path, method, expected, status, elapsedMs }) {
  const statusClass = classifyStatus(status);
  return {
    caseId,
    endpoint: path,
    method,
    expected,
    status,
    statusClass,
    httpOk: status >= 200 && status <= 299,
    expectationMet: outcomeForExpected(status, expected),
    elapsedMs
  };
}

function transportResult({ caseId, path, method, expected, elapsedMs }) {
  return {
    caseId,
    endpoint: path,
    method,
    expected,
    status: null,
    statusClass: "transport_error",
    httpOk: false,
    expectationMet: false,
    elapsedMs
  };
}

function safeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? Number(value) : null;
}

function expectationWithSchema(base, responseSchemaValid) {
  if (base.expected !== "authorized") {
    return base.expectationMet;
  }
  return base.expectationMet && responseSchemaValid === true;
}

function validateModelListPayload(payload) {
  const data = Array.isArray(payload?.data) ? payload.data : [];
  const objectIsList = payload?.object === "list";
  const dataIsNonEmpty = data.length > 0;
  const everyModelHasId = dataIsNonEmpty && data.every(
    (item) => typeof item?.id === "string" && item.id.length > 0
  );
  const everyModelObjectIsModel = dataIsNonEmpty && data.every(
    (item) => item?.object === "model"
  );
  const everyModelHasOwner = dataIsNonEmpty && data.every(
    (item) => typeof item?.owned_by === "string" && item.owned_by.length > 0
  );
  const responseSchemaValid =
    objectIsList &&
    dataIsNonEmpty &&
    everyModelHasId &&
    everyModelObjectIsModel &&
    everyModelHasOwner;

  return {
    responseSchemaValid,
    objectIsList,
    dataIsNonEmpty,
    everyModelHasId,
    everyModelObjectIsModel,
    everyModelHasOwner,
    modelCount: responseSchemaValid ? data.length : null,
    modelIds: responseSchemaValid ? data.map((item) => item.id) : []
  };
}

function validateBalancePayload(payload) {
  const availabilityFieldPresent = typeof payload?.is_available === "boolean";
  const balanceInfoArrayPresent = Array.isArray(payload?.balance_infos);
  const responseSchemaValid = availabilityFieldPresent && balanceInfoArrayPresent;

  return {
    responseSchemaValid,
    availabilityFieldPresent,
    available: availabilityFieldPresent ? payload.is_available : null,
    balanceInfoArrayPresent,
    balanceInfoCount: balanceInfoArrayPresent ? payload.balance_infos.length : null
  };
}

function validateCompletionPayload(payload) {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
  const text = typeof choice?.message?.content === "string" ? choice.message.content : "";
  const normalized = text.trim();
  const usage = payload?.usage && typeof payload.usage === "object" ? payload.usage : {};
  const promptTokens = safeInteger(usage.prompt_tokens);
  const completionTokens = safeInteger(usage.completion_tokens);
  const totalTokens = safeInteger(usage.total_tokens);
  const usageReconciles =
    promptTokens !== null &&
    completionTokens !== null &&
    totalTokens !== null &&
    promptTokens + completionTokens === totalTokens;
  const model = typeof payload?.model === "string" ? payload.model : null;
  const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
  const responseObjectIsChatCompletion = payload?.object === "chat.completion";
  const choicePresent = choice !== null;
  const contentNonEmpty = normalized.length > 0;
  const exactSyntheticReferenceMatch = normalized === "AUTHENTICATED_OK";
  const returnedModelMatches = model === LIVE_MODEL;
  const finishReasonIsStop = finishReason === "stop";
  const responseSchemaValid =
    responseObjectIsChatCompletion &&
    choicePresent &&
    contentNonEmpty &&
    exactSyntheticReferenceMatch &&
    returnedModelMatches &&
    finishReasonIsStop &&
    usageReconciles;

  return {
    responseSchemaValid,
    responseObjectIsChatCompletion,
    choicePresent,
    model,
    returnedModelMatches,
    contentNonEmpty,
    contentLength: text.length,
    exactSyntheticReferenceMatch,
    finishReason,
    finishReasonIsStop,
    promptTokens,
    completionTokens,
    totalTokens,
    usageReconciles
  };
}

export const liveResponseValidators = Object.freeze({
  modelList: validateModelListPayload,
  balance: validateBalancePayload,
  completion: validateCompletionPayload
});

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function createLiveSession({
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch-compatible function is required.");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
    throw new Error("timeoutMs must be an integer between 1,000 and 60,000.");
  }

  let sessionPaidCompletionAttempts = 0;

  async function request({
    caseId,
    path,
    method = "GET",
    expected,
    authorization,
    jsonBody,
    parseMode = "none"
  }) {
    assertPathAndMethod(path, method);
    const url = new URL(path, API_ORIGIN);
    if (url.origin !== API_ORIGIN || url.pathname !== path || url.search !== "") {
      throw new Error("Fixed-origin URL assertion failed.");
    }

    return enqueueNetwork(async () => {
      const started = performance.now();
      const headers = new Headers({ Accept: "application/json" });
      if (authorization !== undefined) {
        headers.set("Authorization", authorization);
      }
      if (jsonBody !== undefined) {
        headers.set("Content-Type", "application/json");
      }

      try {
        const response = await fetchImpl(url, {
          method,
          headers,
          body: jsonBody === undefined ? undefined : JSON.stringify(jsonBody),
          redirect: "error",
          signal: AbortSignal.timeout(timeoutMs)
        });
        const elapsedMs = Math.round(performance.now() - started);
        const base = buildPublicBase({
          caseId,
          path,
          method,
          expected,
          status: response.status,
          elapsedMs
        });

        if (parseMode === "models") {
          let parsed = null;
          try {
            parsed = await response.json();
          } catch {
            parsed = null;
          }
          const validation = validateModelListPayload(parsed);
          const successfulResponse = response.status === 200;
          parsed = null;
          return sanitizeForPublic({
            ...base,
            expectationMet: expectationWithSchema(base, validation.responseSchemaValid),
            responseSchemaValid: successfulResponse
              ? validation.responseSchemaValid
              : null,
            objectIsList: successfulResponse ? validation.objectIsList : null,
            dataIsNonEmpty: successfulResponse ? validation.dataIsNonEmpty : null,
            everyModelHasId: successfulResponse ? validation.everyModelHasId : null,
            everyModelObjectIsModel: successfulResponse
              ? validation.everyModelObjectIsModel
              : null,
            everyModelHasOwner: successfulResponse
              ? validation.everyModelHasOwner
              : null,
            modelCount: successfulResponse ? validation.modelCount : null,
            modelIds: successfulResponse ? validation.modelIds : []
          });
        }

        if (parseMode === "balance") {
          let parsed = null;
          try {
            parsed = await response.json();
          } catch {
            parsed = null;
          }
          const validation = validateBalancePayload(parsed);
          const successfulResponse = response.status === 200;
          parsed = null;
          return sanitizeForPublic({
            ...base,
            expectationMet: expectationWithSchema(base, validation.responseSchemaValid),
            responseSchemaValid: successfulResponse
              ? validation.responseSchemaValid
              : null,
            availabilityFieldPresent: successfulResponse
              ? validation.availabilityFieldPresent
              : null,
            available: successfulResponse ? validation.available : null,
            balanceInfoArrayPresent: successfulResponse
              ? validation.balanceInfoArrayPresent
              : null,
            balanceInfoCount: successfulResponse ? validation.balanceInfoCount : null
          });
        }

        if (parseMode === "completion") {
          let parsed = null;
          try {
            parsed = await response.json();
          } catch {
            parsed = null;
          }
          const validation = validateCompletionPayload(parsed);
          const successfulResponse = response.status === 200;
          const completionResult = {
            ...base,
            expectationMet: expectationWithSchema(base, validation.responseSchemaValid),
            paidCallIssued: true,
            responseSchemaValid: successfulResponse
              ? validation.responseSchemaValid
              : null,
            responseObjectIsChatCompletion: successfulResponse
              ? validation.responseObjectIsChatCompletion
              : null,
            choicePresent: successfulResponse ? validation.choicePresent : null,
            model: successfulResponse ? validation.model : null,
            returnedModelMatches: successfulResponse
              ? validation.returnedModelMatches
              : null,
            contentNonEmpty: successfulResponse ? validation.contentNonEmpty : null,
            contentLength: successfulResponse ? validation.contentLength : null,
            exactSyntheticReferenceMatch: successfulResponse
              ? validation.exactSyntheticReferenceMatch
              : null,
            finishReason: successfulResponse ? validation.finishReason : null,
            finishReasonIsStop: successfulResponse
              ? validation.finishReasonIsStop
              : null,
            promptTokens: successfulResponse ? validation.promptTokens : null,
            completionTokens: successfulResponse ? validation.completionTokens : null,
            totalTokens: successfulResponse ? validation.totalTokens : null,
            usageReconciles: successfulResponse ? validation.usageReconciles : null
          };
          parsed = null;
          return sanitizeForPublic(completionResult);
        }

        if (response.body) {
          await response.body.cancel();
        }
        return sanitizeForPublic(base);
      } catch {
        const elapsedMs = Math.round(performance.now() - started);
        return sanitizeForPublic(
          transportResult({ caseId, path, method, expected, elapsedMs })
        );
      }
    });
  }

  async function authenticatedModelProbe({ caseId, validKey, expected = "authorized" }) {
    let credential = acceptInMemoryCredential(validKey, { provenance: "memory" });
    const authorization = `Bearer ${credential}`;
    credential = null;
    return request({
      caseId,
      path: ENDPOINTS.models,
      method: "GET",
      expected,
      authorization,
      parseMode: "models"
    });
  }

  async function runAuthenticationMatrix({ validKey }) {
    let credential = acceptInMemoryCredential(validKey, { provenance: "memory" });
    const cases = [
      {
        caseId: "A1-valid-bearer",
        expected: "authorized",
        authorization: `Bearer ${credential}`
      },
      {
        caseId: "A2-missing-header",
        expected: "auth_rejected",
        authorization: undefined
      },
      {
        caseId: "A3-empty-bearer",
        expected: "auth_rejected",
        authorization: "Bearer "
      },
      {
        caseId: "A4-wrong-scheme",
        expected: "auth_rejected",
        authorization: SYNTHETIC_WRONG_SCHEME
      },
      {
        caseId: "A5-synthetic-invalid",
        expected: "auth_rejected",
        authorization: SYNTHETIC_INVALID_BEARER
      }
    ];
    credential = null;

    const observations = [];
    for (const testCase of cases) {
      observations.push(
        await request({
          ...testCase,
          path: ENDPOINTS.models,
          method: "GET",
          parseMode: "models"
        })
      );
    }

    return sanitizeForPublic({
      suite: "authentication_matrix",
      requestsIssued: observations.length,
      genericRetries: 0,
      maximumConcurrency: 1,
      allExpectationsMet: observations.every((item) => item.expectationMet),
      observations
    });
  }

  async function runBalanceAvailability({ validKey }) {
    let credential = acceptInMemoryCredential(validKey, { provenance: "memory" });
    const authorization = `Bearer ${credential}`;
    credential = null;
    return request({
      caseId: "B1-balance-availability",
      path: ENDPOINTS.balance,
      method: "GET",
      expected: "authorized",
      authorization,
      parseMode: "balance"
    });
  }

  async function runOnePaidCompletion({ validKey, permit }) {
    if (permit !== PAID_COMPLETION_PERMIT) {
      throw new Error("The exact one-paid-completion permit is required.");
    }
    if (sessionPaidCompletionAttempts >= 1 || processPaidCompletionAttempts >= 1) {
      throw new Error("The one-paid-completion budget is already consumed.");
    }

    let credential = acceptInMemoryCredential(validKey, { provenance: "memory" });
    sessionPaidCompletionAttempts += 1;
    processPaidCompletionAttempts += 1;
    const authorization = `Bearer ${credential}`;
    credential = null;

    return request({
      caseId: "C1-one-paid-completion",
      path: ENDPOINTS.completions,
      method: "POST",
      expected: "authorized",
      authorization,
      jsonBody: {
        model: LIVE_MODEL,
        messages: [
          {
            role: "user",
            content: "Reply with exactly AUTHENTICATED_OK and nothing else."
          }
        ],
        max_tokens: 16,
        temperature: 0,
        thinking: { type: "disabled" },
        stream: false
      },
      parseMode: "completion"
    });
  }

  async function runRotationOverlap({ oldKey, newKey }) {
    const oldObservation = await authenticatedModelProbe({
      caseId: "D1-old-key-overlap",
      validKey: oldKey
    });
    const newObservation = await authenticatedModelProbe({
      caseId: "D2-new-key-overlap",
      validKey: newKey
    });

    return sanitizeForPublic({
      suite: "rotation_overlap",
      requestsIssued: 2,
      genericRetries: 0,
      oldKeyAuthorized: oldObservation.expectationMet,
      newKeyAuthorized: newObservation.expectationMet,
      overlapContinuityVerified:
        oldObservation.expectationMet &&
        newObservation.expectationMet,
      observations: [oldObservation, newObservation]
    });
  }

  async function pollRevokedKey({
    revokedKey,
    maxPolls = MAX_REVOCATION_POLLS,
    pollIntervalMs = 2_000
  }) {
    if (!Number.isInteger(maxPolls) || maxPolls < 1 || maxPolls > MAX_REVOCATION_POLLS) {
      throw new Error(`maxPolls must be between 1 and ${MAX_REVOCATION_POLLS}.`);
    }
    if (
      !Number.isInteger(pollIntervalMs) ||
      pollIntervalMs < 0 ||
      pollIntervalMs > MAX_POLL_INTERVAL_MS
    ) {
      throw new Error(`pollIntervalMs must be between 0 and ${MAX_POLL_INTERVAL_MS}.`);
    }

    let credential = acceptInMemoryCredential(revokedKey, { provenance: "memory" });
    const observations = [];

    for (let poll = 1; poll <= maxPolls; poll += 1) {
      const observation = await request({
        caseId: `E1-revoked-key-poll-${poll}`,
        path: ENDPOINTS.models,
        method: "GET",
        expected: "auth_rejected",
        authorization: `Bearer ${credential}`
      });
      observations.push(observation);

      if (observation.status === 401) {
        break;
      }
      if (observation.statusClass === "transport_error") {
        break;
      }
      if (observation.status !== 200) {
        break;
      }
      if (poll < maxPolls && pollIntervalMs > 0) {
        await sleep(pollIntervalMs);
      }
    }
    credential = null;

    return sanitizeForPublic({
      suite: "revoked_key_propagation",
      declaredPolls: true,
      pollsIssued: observations.length,
      maximumPolls: maxPolls,
      genericRetries: 0,
      revokedObserved: observations.some((item) => item.status === 401),
      observations
    });
  }

  async function checkActiveKey({ activeKey }) {
    return authenticatedModelProbe({
      caseId: "E2-active-key-after-revocation",
      validKey: activeKey
    });
  }

  async function runPostRevocationChecks({
    revokedKey,
    activeKey,
    maxPolls = MAX_REVOCATION_POLLS,
    pollIntervalMs = 2_000
  }) {
    const revoked = await pollRevokedKey({
      revokedKey,
      maxPolls,
      pollIntervalMs
    });
    const active = await checkActiveKey({ activeKey });

    return sanitizeForPublic({
      suite: "post_revocation_continuity",
      genericRetries: 0,
      revocationPollsIssued: revoked.pollsIssued,
      activeKeyChecksIssued: 1,
      revokedKeyRejected: revoked.revokedObserved,
      activeKeyAuthorized: active.expectationMet,
      rotationContinuityVerified:
        revoked.revokedObserved && active.expectationMet,
      revoked,
      active
    });
  }

  function getSafetyState() {
    return Object.freeze({
      apiOrigin: API_ORIGIN,
      maximumConcurrency: 1,
      observedPeakConcurrency,
      genericRetries: 0,
      processPaidCompletionAttempts,
      sessionPaidCompletionAttempts,
      maximumPaidCompletionsPerProcess: 1,
      maximumRevocationPolls: MAX_REVOCATION_POLLS
    });
  }

  return Object.freeze({
    runAuthenticationMatrix,
    runBalanceAvailability,
    runOnePaidCompletion,
    runRotationOverlap,
    pollRevokedKey,
    checkActiveKey,
    runPostRevocationChecks,
    getSafetyState
  });
}

export const liveSafetyContract = Object.freeze({
  apiOrigin: API_ORIGIN,
  endpoints: Object.freeze({ ...ENDPOINTS }),
  model: LIVE_MODEL,
  maximumConcurrency: 1,
  genericRetries: 0,
  maximumPaidCompletionsPerProcess: 1,
  paidCompletionMaxTokens: 16,
  paidCompletionThinking: "disabled",
  authorizedStatus: 200,
  authenticationRejectionStatus: 401,
  maximumRevocationPolls: MAX_REVOCATION_POLLS,
  maximumPollIntervalMs: MAX_POLL_INTERVAL_MS
});
