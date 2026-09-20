// verb: recordProbeOutcome — the ROW half of a connection health probe. The connection domain resolves the
// row, dials the provider through the runtime's diagnostics, and hands the verdict here; this verb applies the
// consequences to `user_credentials` (only this domain writes it) and re-stamps `checkedAt` on its own clock.
//
// HONESTY INVARIANT (SID-01): `ok` is an EARNED green — a probe went out and the credential was accepted.
// `unchecked` carries NO row/breaker side-effect — it is the absence of a verdict, not a failure. Only a
// TRANSPORT failure strikes toward auto-revocation (3 strikes, `HEALTH_STRIKE_LIMIT`), and only an auth-class
// answer revokes outright; a loopback/LAN endpoint being unreachable is "the box is off" and strikes NOTHING
// (owner ruling). Throttled to one probe per credential per 60s window — the throttle is claimed HERE, after
// the dial, on the credential id, so a second ask inside the window answers `throttled` without a row write.

import type { CredentialHealth } from "@orb/contracts/credentials";
import type { UserCredentialId, UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { CredentialContext } from "../context.ts";
import type { RecordProbeOutcomeParams } from "../contract/params.ts";
import type { CredentialsService } from "../contract/service.ts";
import { clearRevokedOwned, fetchOwnedCredential, setRevokedById } from "../persistence/queries.ts";
import { requireOwned } from "../substrate/credential-not-found.ts";
import { beginProbe, recordStrike, resetStrikes } from "../substrate/health-throttle.ts";

interface Outcome {
  readonly ownerId: UserId;
  readonly credentialId: UserCredentialId;
  readonly revoked: boolean;
  readonly localEndpoint: boolean;
  readonly now: number;
}

async function applyOutcome(ctx: CredentialContext, args: Outcome, result: CredentialHealth): Promise<CredentialHealth> {
  const { ownerId, credentialId, now } = args;
  if (result.status === "ok") {
    if (args.revoked) {
      await clearRevokedOwned(ctx.db, ownerId, credentialId, now);
    }
    resetStrikes(credentialId);
    return { status: "ok", checkedAt: now };
  }
  if (result.status === "revoked") {
    resetStrikes(credentialId);
    // The probe reached the provider and the provider rejected the key — the SAME fact the post-generation
    // strike-out records, so it carries the same persisted reason.
    await setRevokedById(ctx.db, { ownerId, credentialId, revokedAt: now, reason: "auth_failed" });
    return { status: "revoked", checkedAt: now, reason: result.reason };
  }
  if (result.status === "unreachable") {
    if (args.localEndpoint) {
      return { status: "unreachable", checkedAt: now, reason: result.reason };
    }
    const { strikes, limitHit } = recordStrike(credentialId);
    if (limitHit) {
      // `unreachable`, NOT `auth_failed`: nothing ever answered, so nothing has judged the key.
      await setRevokedById(ctx.db, { ownerId, credentialId, revokedAt: now, reason: "unreachable" });
      getLog().warn({ credentialId, strikes }, "credentials: health probe strike-limit hit — marking revoked despite no auth classification");
      return { status: "revoked", checkedAt: now, reason: result.reason };
    }
    return { status: "unreachable", checkedAt: now, reason: result.reason };
  }
  if (result.status === "unchecked") {
    return { status: "unchecked", checkedAt: now, reason: result.reason };
  }
  return result;
}

export function createRecordProbeOutcome(ctx: CredentialContext): CredentialsService["recordProbeOutcome"] {
  return async (params: RecordProbeOutcomeParams): Promise<CredentialHealth> => {
    const ownerId = params.principal.userId;
    const { credentialId } = params;
    const row = requireOwned(await fetchOwnedCredential(ctx.db, ownerId, credentialId), credentialId);
    const now = ctx.now();
    if (params.result.status === "unchecked") {
      // No verdict claims no throttle window: nothing went out.
      return { status: "unchecked", checkedAt: now, reason: params.result.reason };
    }
    const throttledAt = beginProbe(credentialId, now);
    if (throttledAt !== null) {
      return { status: "throttled", checkedAt: throttledAt };
    }
    return applyOutcome(ctx, { ownerId, credentialId, revoked: row.revokedAt !== null, localEndpoint: params.localEndpoint, now }, params.result);
  };
}
