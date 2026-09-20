// verb: maybeRevokeOnAuthFailed — the post-generation `auth_failed` STRIKE-OUT (#1373). The chat engine
// injects it at all three of its generation catch seams (the main turn, the pre-turn compaction, the
// post-turn compaction hook) via the composition root.
//
// THIS IS THE ONE HOME OF THE POLICY, which is why the engine passes the classification instead of a
// verdict: exactly one kind revokes — `auth_failed`, the provider's own statement that it looked at the key
// and rejected it. `rate_limit`, `billing`, `moderation`, `refused`, `forbidden` (OUR firewall), `invalid`,
// `model_unavailable`, `server`, `max_output`, `aborted` and `unknown` must NEVER cost a user their key: a
// 429 is a minute's wait, and revoking on one turns a rate limit into a lockout. There is deliberately NO
// strike counter — one rejection is dispositive (a key the provider refuses is dead now), and the schema
// carries none.
//
// `credentialId === null` is the keyless arm (`auth: none` rows own no row), so those sources
// skip by construction rather than by a caller remembering to check. `ownerId` is the TENANT SCOPE and lands
// in the WHERE: this is the only revoke path with no Principal to prove ownership from, so a mismatch is
// refused by the query and REPORTED (`reportOwnerMismatch`) rather than trusted to the caller's discipline.
//
// Best-effort: a revoke-write failure is logged and swallowed — the caller is already inside a catch
// surfacing the generation's OWN error, and replacing it with a db error would misreport the failure.
// Idempotent (re-revoking re-stamps `revoked_at`/`revoked_reason`).

import type { ProviderErrorKind } from "@orb/inference";
import { errorMessage } from "@orb/kit/error-message";
import type { UserCredentialId, UserId } from "@orb/kit/ids";
import { getLog, securityEvent } from "#foundation/observability";
import type { CredentialContext } from "../context.ts";
import type { MaybeRevokeParams } from "../contract/params.ts";
import type { CredentialsService } from "../contract/service.ts";
import { setRevokedById } from "../persistence/queries.ts";

/** The ONE kind that revokes. `satisfies` (not an annotation) keeps the LITERAL type while still failing
 *  `tsc` if `PROVIDER_ERROR_KINDS` ever drops or renames the member — an annotation would widen it to the
 *  union and quietly turn the guard below into a comparison that proves nothing. */
const AUTH_FAILED = "auth_failed" satisfies ProviderErrorKind;

/** A strike naming a credential its claimed owner does not hold. UNREACHABLE from the live wiring — the engine
 *  can only name `ResolvedConnection.credential`, which `resolve` minted for that same principal — so reaching
 *  here means a wiring is wrong or something is naming ids it does not hold. Either way it is a fact an
 *  operator has to be able to find AFTER the fact, which is why it takes a DURABLE audit row and not just a
 *  log line. System-attributed (`actorUserId: null`): no Principal was proven at this seam, and stamping the
 *  claimed owner as the actor would launder an unverified id into the audit trail's actor column. */
async function reportOwnerMismatch(
  ctx: CredentialContext,
  args: { readonly ownerId: UserId; readonly credentialId: UserCredentialId; readonly now: number },
): Promise<void> {
  await ctx.audit(
    {
      actorUserId: null,
      action: "credential.revokeOwnerMismatch",
      entityType: "credential",
      entityId: args.credentialId,
      metadata: { claimedOwnerId: args.ownerId, path: "auth_failed" },
    },
    args.now,
  );
  securityEvent(
    "credential_revoke_owner_mismatch",
    { credentialId: args.credentialId, claimedOwnerId: args.ownerId, path: "auth_failed" },
    "credentials: a post-generation strike-out named a credential this owner does not hold — nothing revoked",
  );
}

export function createMaybeRevokeOnAuthFailed(ctx: CredentialContext): CredentialsService["maybeRevokeOnAuthFailed"] {
  return async (params: MaybeRevokeParams): Promise<void> => {
    if (params.errorKind !== AUTH_FAILED || params.credentialId === null) {
      return;
    }
    const { credentialId, ownerId } = params;
    const now = ctx.now();
    try {
      // OWNER-SCOPED: `ownerId` is the WHERE predicate, not a comment. This is the one revoke path that does
      // NOT pre-prove ownership (the runner holds an id, never a Principal), so the empty result is the only
      // place a mismatch can be noticed at all.
      const revoked = await setRevokedById(ctx.db, { ownerId, credentialId, revokedAt: now, reason: "auth_failed" });
      if (revoked.length === 0) {
        await reportOwnerMismatch(ctx, { ownerId, credentialId, now });
        return;
      }
      // No Principal exists at this runner seam, so the successful automatic revoke is system-attributed.
      // `audit` is the db-bound best-effort writer in production; keeping it inside this passenger's catch
      // preserves the generation error even if a test or alternate composition supplies a rejecting sink.
      await ctx.audit(
        {
          actorUserId: null,
          action: "credential.markRevoked",
          entityType: "credential",
          entityId: credentialId,
          metadata: { reason: params.errorMessage, path: "auth_failed" },
        },
        now,
      );
      securityEvent(
        "credential_revoked",
        { credentialId, ownerId, reason: params.errorMessage, path: "auth_failed" },
        "credentials: marked revoked (post-generation auth_failed strike-out)",
      );
    } catch (err) {
      getLog().error({ credentialId, err: errorMessage(err) }, "credentials: failed to mark revoked (suppressed — the turn's error path still surfaces)");
    }
  };
}
