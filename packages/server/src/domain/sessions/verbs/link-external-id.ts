// B5 — the admin "link SSO identity" CAPABILITY: stamp a stable external subject onto an existing user row
// so that row's first SSO login hits by `externalId` directly (no handle-guess, no orphan). This is the
// db-surgery-free migration path for a non-owner local account whose IdP username ≠ their handle (the
// MS-W1 mode-switch orphan the auth study found), and it deliberately lives HERE, not in domain/admin: it
// is the SECOND writer of a non-null `externalId` after `provisionIdentity`, and the identity spine's U1
// rule ("external identity → ONE linking site, stable-id only") forbids a second bind-once policy. So the
// bind-once guard is reused verbatim (`isSubjectMismatch`) and no `externalId` write escapes this domain.
//
// The AUTHORIZATION (requireAdmin), the owner/agent-target refusal, and the audit are the admin verb's job
// (`domain/admin/verbs/link-sso.ts`), reached through the injected SessionAdminPort — this verb gates
// nothing (RESOLUTION tier has no `can()`); it enforces only the IDENTITY invariant. The result is a
// discriminated union the admin wrapper maps to typed operation codes.

import type { ExternalId, UserId } from "@orb/kit/ids";
import type { LinkExternalIdResult } from "../contract/results.ts";
import type { SessionsContext, SessionsService } from "../contract/service.ts";
import { claimExternalIdIfUnbound, selectForProvisionByExternalId, selectForProvisionById } from "../persistence/users.ts";
import { isSubjectMismatch } from "../substrate/role-policy.ts";

async function settleMissedClaim(ctx: SessionsContext, userId: UserId, externalId: ExternalId, failure?: unknown): Promise<LinkExternalIdResult> {
  const target = await selectForProvisionById(ctx.db, userId);
  if (target === undefined) {
    return { outcome: "not-found" };
  }
  if (target.externalId === externalId) {
    return { outcome: "already-linked", userId };
  }
  if (isSubjectMismatch(target.externalId, externalId)) {
    return { outcome: "target-bound" };
  }
  const holder = await selectForProvisionByExternalId(ctx.db, externalId);
  if (holder !== undefined && holder.id !== userId) {
    return { outcome: "subject-taken" };
  }
  if (failure !== undefined) {
    throw failure;
  }
  throw new Error("linkExternalId: conditional subject claim missed without a settled competing state");
}

export function createLinkExternalId(ctx: SessionsContext): Pick<SessionsService, "linkExternalId"> {
  async function linkExternalId(userId: UserId, externalId: ExternalId): Promise<LinkExternalIdResult> {
    const target = await selectForProvisionById(ctx.db, userId);
    if (target === undefined) {
      return { outcome: "not-found" };
    }
    // BIND-ONCE on the TARGET (the shared `isSubjectMismatch` predicate): a row already bound to a DIFFERENT
    // stable subject is never rebound — that would move `external_id` off the real identity, exactly the
    // takeover the SSO seam refuses.
    if (isSubjectMismatch(target.externalId, externalId)) {
      return { outcome: "target-bound" };
    }
    // Idempotent: the row already carries exactly this subject — a re-link is a no-op success.
    if (target.externalId === externalId) {
      return { outcome: "already-linked", userId };
    }
    // The subject must not already live on ANOTHER row — else the link would create a duplicate binding (also
    // rejected at the DB by `users_external_id_unique`, but refused HERE with a clean reason before the write).
    const holder = await selectForProvisionByExternalId(ctx.db, externalId);
    if (holder !== undefined && holder.id !== userId) {
      return { outcome: "subject-taken" };
    }
    let claimed: boolean;
    // @orb-gate-ignore caught-failure-ownership(empty:failure): propagated — `settleMissedClaim` re-reads
    // durable state to converge the concurrent loser to a typed outcome, and (comment below) RETHROWS the
    // real database error when state does not explain the failure. Never a silent swallow. Ends if
    // `settleMissedClaim` stops rethrowing an unexplained failure.
    try {
      claimed = await claimExternalIdIfUnbound(ctx.db, userId, externalId, ctx.now());
    } catch (failure) {
      // The unique index is the atomic arbiter. Re-read durable state so its concurrent loser converges to
      // the typed result; if state does not explain the failure, preserve the real database error.
      return await settleMissedClaim(ctx, userId, externalId, failure);
    }
    return claimed ? { outcome: "linked", userId } : await settleMissedClaim(ctx, userId, externalId);
  }
  return { linkExternalId };
}
