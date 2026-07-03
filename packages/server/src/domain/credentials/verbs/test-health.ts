// verb: testHealth — probe a credential against its provider's health endpoint + run the throttle and
// circuit-breaker side-effects (INVARIANT: probes by `credentialId`, NOT by
// `active=true`, so the health UI can probe INACTIVE owned credentials too). Flow:
//   1. owner check + load (any owned row, active or not).
//   2. throttle: one probe per 60s window — within it, return the last observed state (no second probe).
//   3. decrypt the SPECIFIC credential (by id; not the resolver's active-only path) — bind AAD by id.
//   4. probe (openrouter only has a probe arm today; other providers return `ok` without nagging).
//   5. side-effects: success clears a stale revocation + resets strikes; a `revoked` classification or 3
//      consecutive `unreachable` strikes mark the row revoked (the breaker catches 401s the message
//      heuristic missed).
// Determinism: `checkedAt` is the injected `ctx.now()`, never a wall-clock.

import type { CredentialHealth } from "@orb/contracts/credentials";
import type { UserCredentialId, UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { TestHealthParams } from "../contract/params";
import type { CredentialContext, CredentialsService } from "../contract/service";
import { aadFor } from "../persistence/aad";
import { clearRevokedOwned, fetchOwnedCredential, setRevokedById } from "../persistence/queries";
import { requireOwned } from "../substrate/credential-not-found";
import { decryptSealed } from "../substrate/decrypt";
import { beginProbe, recordStrike, resetStrikes } from "../substrate/health-throttle";
import { mintOpenRouter } from "../substrate/mint";

/** The openrouter probe path (decrypt-by-id → probe → side-effects). Split out to keep the verb's
 *  throttle/dispatch flow under the cognitive-complexity bar; `sealed` is the row's GCM fields. */
async function probeOpenRouterHealth(
  ctx: CredentialContext,
  args: {
    readonly ownerId: UserId;
    readonly credentialId: UserCredentialId;
    readonly sealed: { ciphertext: string; iv: string; tag: string };
    readonly revoked: boolean;
    readonly now: number;
  },
): Promise<CredentialHealth> {
  const { ownerId, credentialId, now } = args;
  const apiKey = decryptSealed(ctx.box, args.sealed, aadFor(ownerId, "openrouter"));
  if (apiKey === null) {
    return {
      status: "unreachable",
      checkedAt: now,
      reason: "credential could not be decrypted (CREDENTIALS_KEY rotated?)",
    };
  }
  const result = await ctx.probe(mintOpenRouter(apiKey, credentialId));
  if (result.status === "ok") {
    if (args.revoked) {
      await clearRevokedOwned(ctx.db, ownerId, credentialId, now);
    }
    resetStrikes(credentialId);
    return { status: "ok", checkedAt: now };
  }
  if (result.status === "revoked") {
    resetStrikes(credentialId);
    await setRevokedById(ctx.db, credentialId, now);
    return { status: "revoked", checkedAt: now, reason: result.reason };
  }
  if (result.status === "unreachable") {
    const { strikes, limitHit } = recordStrike(credentialId);
    if (limitHit) {
      await setRevokedById(ctx.db, credentialId, now);
      getLog().warn(
        { credentialId, strikes },
        "credentials: health probe strike-limit hit — marking revoked despite no auth classification",
      );
      return { status: "revoked", checkedAt: now, reason: result.reason };
    }
    return { status: "unreachable", checkedAt: now, reason: result.reason };
  }
  // `throttled` is service-side state the provider never returns; pass through for exhaustiveness.
  return result;
}

export function createTestHealth(ctx: CredentialContext): CredentialsService["testHealth"] {
  return async (params: TestHealthParams): Promise<CredentialHealth> => {
    const ownerId = params.principal.userId;
    const { credentialId } = params;
    const row = requireOwned(
      await fetchOwnedCredential(ctx.db, ownerId, credentialId),
      credentialId,
    );
    const now = ctx.now();

    const throttledAt = beginProbe(credentialId, now);
    if (throttledAt !== null) {
      return { status: "throttled", checkedAt: throttledAt };
    }

    // Only openrouter has a probe arm today; other providers can't be probed — report ok (don't nag the
    // UI status dot). A real probe for another provider lands as an added arm here + in infra/providers.
    if (row.provider !== "openrouter") {
      return { status: "ok", checkedAt: now };
    }

    return probeOpenRouterHealth(ctx, {
      ownerId,
      credentialId,
      sealed: { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag },
      revoked: row.revokedAt !== null,
      now,
    });
  };
}
