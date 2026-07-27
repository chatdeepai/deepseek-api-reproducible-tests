const PHASES = Object.freeze({
  INITIALIZED: "initialized",
  BASELINE_VERIFIED: "baseline_verified",
  OVERLAP_VERIFIED: "overlap_verified",
  REVOCATION_PENDING: "revocation_pending",
  REVOKED_VERIFIED: "revoked_verified",
  COMPLETE: "complete"
});

const MAX_REVOCATION_POLLS = 6;

function freezeState(state) {
  return Object.freeze({
    ...state,
    evidence: Object.freeze({ ...state.evidence })
  });
}

export function createRotationState() {
  return freezeState({
    version: 1,
    phase: PHASES.INITIALIZED,
    revocationPolls: 0,
    evidence: {
      oldBaselineAuthorized: false,
      oldOverlapAuthorized: false,
      newOverlapAuthorized: false,
      revokedKeyRejected: false,
      activeKeyAuthorizedAfterRevocation: false,
      lastRevokedKeyStatus: null
    }
  });
}

export function transitionRotation(state, event) {
  if (!state || typeof state !== "object" || state.version !== 1) {
    throw new TypeError("A version 1 rotation state is required.");
  }
  if (!event || typeof event !== "object" || typeof event.type !== "string") {
    throw new TypeError("A typed rotation event is required.");
  }

  const evidence = { ...state.evidence };
  let phase = state.phase;
  let revocationPolls = state.revocationPolls;

  switch (event.type) {
    case "baseline": {
      if (state.phase !== PHASES.INITIALIZED) {
        throw new Error("Baseline can only be recorded from the initialized phase.");
      }
      if (event.oldKeyAuthorized !== true) {
        throw new Error("The old key baseline must be authorized before rotation.");
      }
      evidence.oldBaselineAuthorized = true;
      phase = PHASES.BASELINE_VERIFIED;
      break;
    }

    case "overlap": {
      if (state.phase !== PHASES.BASELINE_VERIFIED) {
        throw new Error("Overlap can only follow a verified baseline.");
      }
      if (event.oldKeyAuthorized !== true || event.newKeyAuthorized !== true) {
        throw new Error("Both keys must be authorized during the overlap window.");
      }
      evidence.oldOverlapAuthorized = true;
      evidence.newOverlapAuthorized = true;
      phase = PHASES.OVERLAP_VERIFIED;
      break;
    }

    case "revocation_poll": {
      if (![PHASES.OVERLAP_VERIFIED, PHASES.REVOCATION_PENDING].includes(state.phase)) {
        throw new Error("Revocation polling can only follow verified overlap.");
      }
      if (state.revocationPolls >= MAX_REVOCATION_POLLS) {
        throw new Error("The revocation poll budget is exhausted.");
      }
      if (!Number.isInteger(event.status) || event.status < 100 || event.status > 599) {
        throw new Error("A valid HTTP status is required for a revocation poll.");
      }

      revocationPolls += 1;
      evidence.lastRevokedKeyStatus = event.status;
      evidence.revokedKeyRejected = event.status === 401;
      phase = evidence.revokedKeyRejected
        ? PHASES.REVOKED_VERIFIED
        : PHASES.REVOCATION_PENDING;
      break;
    }

    case "post_revocation": {
      if (state.phase !== PHASES.REVOKED_VERIFIED) {
        throw new Error("Post-revocation continuity requires verified revoked-key rejection.");
      }
      if (event.activeKeyAuthorized !== true) {
        throw new Error("The active replacement key must remain authorized.");
      }
      evidence.activeKeyAuthorizedAfterRevocation = true;
      phase = PHASES.COMPLETE;
      break;
    }

    default:
      throw new Error(`Unsupported rotation event: ${event.type}`);
  }

  return freezeState({
    version: 1,
    phase,
    revocationPolls,
    evidence
  });
}

export function rotationPassed(state) {
  return Boolean(
    state?.phase === PHASES.COMPLETE &&
      state.evidence.oldBaselineAuthorized &&
      state.evidence.oldOverlapAuthorized &&
      state.evidence.newOverlapAuthorized &&
      state.evidence.revokedKeyRejected &&
      state.evidence.activeKeyAuthorizedAfterRevocation
  );
}

export const rotationPhases = PHASES;
export const rotationLimits = Object.freeze({ maxRevocationPolls: MAX_REVOCATION_POLLS });
