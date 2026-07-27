import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  acceptInMemoryCredential,
  assertNoEnvironmentLookup
} from "../src/env-guard.mjs";
import {
  createLiveSession,
  PAID_COMPLETION_PERMIT,
  API_ORIGIN
} from "../src/live-runner.mjs";
import {
  containsForbiddenPublicField,
  redactString,
  sanitizeForPublic
} from "../src/redact.mjs";
import {
  createRotationState,
  rotationPassed,
  transitionRotation
} from "../src/rotation-state.mjs";
import { scanFiles, scanText } from "../src/secret-scan.mjs";

const suiteDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDirectory = resolve(suiteDirectory, "..");

const VALID_MEMORY_CREDENTIAL = "memory-valid-credential-00000001";
const OLD_MEMORY_CREDENTIAL = "memory-old-credential-0000000001";
const NEW_MEMORY_CREDENTIAL = "memory-new-credential-0000000001";
const REVOKED_MEMORY_CREDENTIAL = "memory-revoked-credential-000001";

function responseJson(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test("environment guard accepts only an explicit in-memory credential", async () => {
  assert.equal(
    acceptInMemoryCredential(VALID_MEMORY_CREDENTIAL, { provenance: "memory" }),
    VALID_MEMORY_CREDENTIAL
  );

  for (const provenance of ["environment", "env", "command-line", "file", "stdin"]) {
    assert.throws(
      () => acceptInMemoryCredential(VALID_MEMORY_CREDENTIAL, { provenance }),
      /in-memory/
    );
  }

  assert.throws(() => acceptInMemoryCredential("short", { provenance: "memory" }), /length/);
  assert.throws(
    () => acceptInMemoryCredential(`${VALID_MEMORY_CREDENTIAL}\n`, { provenance: "memory" }),
    /whitespace/
  );

  const liveSource = await readFile(resolve(suiteDirectory, "src/live-runner.mjs"), "utf8");
  assert.equal(assertNoEnvironmentLookup(liveSource), true);
});

test("repository and suite ignore rules cover secret-bearing paths", async () => {
  const repositoryIgnore = await readFile(resolve(repositoryDirectory, ".gitignore"), "utf8");
  const suiteIgnore = await readFile(resolve(suiteDirectory, ".gitignore"), "utf8");
  const combined = `${repositoryIgnore}\n${suiteIgnore}`;

  for (const expected of [
    ".env",
    ".env.*",
    "*.key",
    "*.pem",
    "private/",
    "secrets/",
    "results/",
    "screenshots/"
  ]) {
    assert.ok(
      combined.split(/\r?\n/).some((line) => line.trim() === expected),
      `Missing ignore rule: ${expected}`
    );
  }
});

test("redaction removes key strings, headers, raw bodies, account data, and balances", () => {
  const keyLike = "sk-" + "A".repeat(32);
  const source = {
    caseId: "safe",
    apiKey: keyLike,
    authorization: `Bearer ${keyLike}`,
    responseBody: { content: "raw provider text" },
    email: "person@example.test",
    balance_infos: [
      {
        currency: "USD",
        total_balance: "12.34"
      }
    ],
    nested: {
      safeBoolean: true,
      note: `header was Bearer ${keyLike}`
    }
  };

  const sanitized = sanitizeForPublic(source);
  const serialized = JSON.stringify(sanitized);
  assert.equal(serialized.includes(keyLike), false);
  assert.equal(serialized.includes("12.34"), false);
  assert.equal(serialized.includes("USD"), false);
  assert.equal(serialized.includes("person@example.test"), false);
  assert.equal(containsForbiddenPublicField(sanitized), true);
  assert.equal(redactString(`Bearer ${keyLike}`).includes(keyLike), false);
});

test("secret scanner reports likely credentials without returning matched text", async () => {
  const keyLike = "sk-" + "B".repeat(32);
  const findings = scanText(`const leaked = "${keyLike}";\nAuthorization: Bearer ${keyLike}`);
  assert.ok(findings.length >= 2);
  assert.deepEqual(
    Object.keys(findings[0]).sort(),
    ["column", "line", "ruleId", "source"].sort()
  );
  assert.equal(JSON.stringify(findings).includes(keyLike), false);

  const publicFiles = [
    "README.md",
    "TEST_PLAN.md",
    "SECURITY.md",
    "official-sources.md",
    "src/env-guard.mjs",
    "src/live-runner.mjs",
    "src/redact.mjs",
    "src/rotation-state.mjs"
  ].map((entry) => resolve(suiteDirectory, entry));
  assert.deepEqual(await scanFiles(publicFiles), []);
});

test("rotation state requires baseline, overlap, rejection, and active continuity", () => {
  let state = createRotationState();
  assert.equal(state.phase, "initialized");

  state = transitionRotation(state, {
    type: "baseline",
    oldKeyAuthorized: true
  });
  assert.equal(state.phase, "baseline_verified");

  state = transitionRotation(state, {
    type: "overlap",
    oldKeyAuthorized: true,
    newKeyAuthorized: true
  });
  assert.equal(state.phase, "overlap_verified");

  state = transitionRotation(state, {
    type: "revocation_poll",
    status: 200
  });
  assert.equal(state.phase, "revocation_pending");
  assert.equal(state.revocationPolls, 1);

  state = transitionRotation(state, {
    type: "revocation_poll",
    status: 401
  });
  assert.equal(state.phase, "revoked_verified");
  assert.equal(state.revocationPolls, 2);

  state = transitionRotation(state, {
    type: "post_revocation",
    activeKeyAuthorized: true
  });
  assert.equal(rotationPassed(state), true);
  assert.equal(JSON.stringify(state).includes("credential"), false);
});

test("mock authentication matrix is fixed-origin, serial, and covers five variants", async () => {
  let active = 0;
  let peak = 0;
  const requests = [];

  const fetchImpl = async (url, options) => {
    active += 1;
    peak = Math.max(peak, active);
    requests.push({
      url: String(url),
      method: options.method,
      authorization: options.headers.get("Authorization")
    });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2));
    const auth = options.headers.get("Authorization");
    active -= 1;
    return responseJson(
      auth === `Bearer ${VALID_MEMORY_CREDENTIAL}` ? { data: [] } : { error: "rejected" },
      auth === `Bearer ${VALID_MEMORY_CREDENTIAL}` ? 200 : 401
    );
  };

  const session = createLiveSession({ fetchImpl, timeoutMs: 5_000 });
  const result = await session.runAuthenticationMatrix({
    validKey: VALID_MEMORY_CREDENTIAL
  });

  assert.equal(result.requestsIssued, 5);
  assert.equal(result.allExpectationsMet, true);
  assert.equal(result.observations.length, 5);
  assert.equal(peak, 1);
  assert.ok(requests.every((entry) => new URL(entry.url).origin === API_ORIGIN));
  assert.ok(requests.every((entry) => new URL(entry.url).pathname === "/models"));
  assert.equal(requests.filter((entry) => entry.authorization === null).length, 1);
});

test("mock balance output includes availability only and omits amounts", async () => {
  const fetchImpl = async () =>
    responseJson({
      is_available: true,
      balance_infos: [
        {
          currency: "USD",
          total_balance: "98.76",
          granted_balance: "12.34",
          topped_up_balance: "86.42"
        }
      ]
    });

  const session = createLiveSession({ fetchImpl, timeoutMs: 5_000 });
  const result = await session.runBalanceAvailability({
    validKey: VALID_MEMORY_CREDENTIAL
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.availabilityFieldPresent, true);
  assert.equal(result.available, true);
  assert.equal(serialized.includes("98.76"), false);
  assert.equal(serialized.includes("USD"), false);
  assert.equal(serialized.includes("balance_infos"), false);
});

test("mock paid completion is limited to one attempt and omits generated text", async () => {
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    calls += 1;
    const requestBody = JSON.parse(options.body);
    assert.equal(requestBody.model, "deepseek-v4-flash");
    assert.equal(requestBody.max_tokens, 16);
    return responseJson({
      id: "provider-id-must-not-leak",
      choices: [
        {
          message: { content: "AUTHENTICATED_OK" },
          finish_reason: "stop"
        }
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 1,
        total_tokens: 11
      }
    });
  };

  const session = createLiveSession({ fetchImpl, timeoutMs: 5_000 });
  const result = await session.runOnePaidCompletion({
    validKey: VALID_MEMORY_CREDENTIAL,
    permit: PAID_COMPLETION_PERMIT
  });

  assert.equal(result.paidCallIssued, true);
  assert.equal(result.contentNonEmpty, true);
  assert.equal(result.exactSyntheticReferenceMatch, true);
  assert.equal(JSON.stringify(result).includes("provider-id-must-not-leak"), false);
  assert.equal(Object.hasOwn(result, "content"), false);
  await assert.rejects(
    session.runOnePaidCompletion({
      validKey: VALID_MEMORY_CREDENTIAL,
      permit: PAID_COMPLETION_PERMIT
    }),
    /already consumed/
  );
  assert.equal(calls, 1);
});

test("mock rotation overlap and post-revocation checks preserve active continuity", async () => {
  const fetchImpl = async (_url, options) => {
    const auth = options.headers.get("Authorization");
    if (auth === `Bearer ${REVOKED_MEMORY_CREDENTIAL}`) {
      return responseJson({ error: "rejected" }, 401);
    }
    if (
      auth === `Bearer ${OLD_MEMORY_CREDENTIAL}` ||
      auth === `Bearer ${NEW_MEMORY_CREDENTIAL}`
    ) {
      return responseJson({ data: [] }, 200);
    }
    return responseJson({ error: "unexpected" }, 401);
  };

  const session = createLiveSession({ fetchImpl, timeoutMs: 5_000 });
  const overlap = await session.runRotationOverlap({
    oldKey: OLD_MEMORY_CREDENTIAL,
    newKey: NEW_MEMORY_CREDENTIAL
  });
  assert.equal(overlap.overlapContinuityVerified, true);

  const after = await session.runPostRevocationChecks({
    revokedKey: REVOKED_MEMORY_CREDENTIAL,
    activeKey: NEW_MEMORY_CREDENTIAL,
    maxPolls: 3,
    pollIntervalMs: 0
  });
  assert.equal(after.revocationPollsIssued, 1);
  assert.equal(after.revokedKeyRejected, true);
  assert.equal(after.activeKeyAuthorized, true);
  assert.equal(after.rotationContinuityVerified, true);
});

test("module-wide queue keeps concurrent mock calls at one", async () => {
  let active = 0;
  let peak = 0;
  const fetchImpl = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
    active -= 1;
    return responseJson({ data: [] }, 200);
  };

  const session = createLiveSession({ fetchImpl, timeoutMs: 5_000 });
  await Promise.all([
    session.checkActiveKey({ activeKey: NEW_MEMORY_CREDENTIAL }),
    session.checkActiveKey({ activeKey: NEW_MEMORY_CREDENTIAL }),
    session.checkActiveKey({ activeKey: NEW_MEMORY_CREDENTIAL })
  ]);
  assert.equal(peak, 1);
  assert.equal(session.getSafetyState().observedPeakConcurrency, 1);
});
