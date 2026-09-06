// verb: linkSsoIdentity (B5) — stamp a STABLE SSO subject onto an existing local row so its first SSO login
// hits by `externalId` directly. This is the db-surgery-free fix for the non-owner mode-switch orphan the
// auth study found (MS-W1): a local user whose IdP username ≠ their handle would otherwise mint a NEW row on
// first OIDC login and strand the old one. admin-gated (owner ∪ admin), audited.
//
// ONE target refusal BEFORE the bind (a privilege belt, mirroring setRole/setEnabled owner-immutability):
//   • the OWNER row is never admin-linked — owner binding is automatic via provisionIdentity's
//     tryAdoptUnboundOwner, and letting an admin choose which IdP subject becomes owner is a takeover path.
// No agent-target guard is needed TODAY: `USER_KINDS` is the single-member `["human"]` (agent principals are
// unbuilt — the `users_kind_check` CHECK derives from that tuple, so an agent row is unrepresentable). When
// the seat wave re-adds `agent`, add a `kind !== "human"` refusal here — and note the DB `users_agent_shape`
// CHECK (external_id IS NULL for agents) already makes the underlying claim statement fail closed.
// The BIND-ONCE identity invariant (never rebind a bound row; refuse a subject already bound elsewhere) is
// the injected sessions capability's — the ONE externalId-linking site (spine U1). This verb gates, orders
// the batch, and maps the refusal vocabulary onto typed operation codes.
//
// THE BIND AND ITS AUDIT ROW ARE ONE BATCH (#1707, closing #1691's last hole). An SSO bind is a durable
// identity write — it decides which IdP subject owns an account — and it used to run inside the sessions
// capability with its audit tail on the best-effort `ctx.audit` (`logAudit`: suppress → count → drop), so a
// degraded audit channel returned 200 for an account newly bound to an SSO identity with NO forensic row.
// Now the UNEXECUTED claim rides `substrate/audited-write.ts` as statement 1 and the `changes()`-guarded
// audit insert is statement 2, exactly like setRole: a failed audit rolls the bind back, and a claim that
// bound nothing writes no row claiming it did.
//
// THE OUTCOME IS DERIVED FROM THE STATEMENT, NOT FROM A PRE-READ. `db.batch` is the only atomic unit and it
// carries no SELECT ahead of its writes, so nothing is read before the claim: NON-EMPTY `RETURNING` is the
// bind, and EMPTY (or a rejected batch) is handed to `settleUnclaimedLink`, which re-reads SETTLED durable
// state and names the refusal — or rethrows the original failure when state does not explain it. That is
// also why an `already-linked` no-op writes no audit row: the row is a biconditional with the WRITE, and a
// re-link of the same subject writes nothing (the `setRole` owner→owner no-op precedent).

import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import type { AdminContext } from "../context.ts";
import { ADMIN_OP_CODES } from "../contract/errors.ts";
import type { LinkSsoIdentityParams } from "../contract/params.ts";
import type { UnclaimedLinkOutcome } from "../contract/results.ts";
import type { AdminService } from "../contract/service.ts";
import { requireAdmin } from "../guard.ts";
import { loadUser } from "../persistence/queries.ts";
import { commitAuditedWrite } from "../substrate/audited-write.ts";

const OWNER_ROLE = "owner";

/** Map a claim that bound nothing onto this verb's typed refusals. `already-linked` is NOT a refusal — the
 *  row already carries exactly this subject, so the caller proceeds to the same success view it would have
 *  returned for a fresh bind (idempotent), just without an audit row (nothing was written). */
function refusalFor(settled: UnclaimedLinkOutcome, userId: UserId): Error | undefined {
  switch (settled.outcome) {
    case "already-linked":
      return;
    // The row vanished between loadUser and the claim (concurrent delete) — surface as not-found.
    case "not-found":
      return new DomainNotFoundError("user", userId);
    case "target-bound":
      return new DomainOperationError(
        ADMIN_OP_CODES.ssoRowBound,
        "this account is already linked to a different SSO identity; unlink it first (out-of-band) before rebinding",
      );
    case "subject-taken":
      return new DomainOperationError(ADMIN_OP_CODES.ssoSubjectTaken, "that SSO identity is already linked to another account");
  }
}

export function createLinkSsoIdentity(ctx: AdminContext): AdminService["linkSsoIdentity"] {
  return async (params: LinkSsoIdentityParams) => {
    requireAdmin(params.principal);
    const { userId, externalId } = params;

    const target = await loadUser(ctx.db, userId);
    if (target === undefined) {
      throw new DomainNotFoundError("user", userId);
    }
    // The owner is never admin-linked — its SSO binding is the automatic owner-flip adoption, and choosing
    // the owner's subject here would be box takeover.
    if (target.role === OWNER_ROLE) {
      throw new DomainOperationError(
        ADMIN_OP_CODES.cannotModifyOwner,
        "the owner's SSO identity cannot be set here — it binds automatically on the owner's first SSO login",
      );
    }

    const at = ctx.now();
    const entry = {
      actorUserId: params.principal.userId,
      action: "admin.linkSsoIdentity",
      entityType: "user",
      entityId: userId,
      metadata: { externalId },
    };
    let bound: readonly { readonly id: UserId }[];
    try {
      bound = await commitAuditedWrite(ctx, { write: ctx.sessions.linkExternalIdStatement(userId, externalId, at), entry, at });
    } catch (failure) {
      // NOTHING IS SWALLOWED HERE. The batch rolled back whole — no bind, no audit row — and the only reason
      // this frame catches is to ask durable state whether the rejection WAS an identity refusal (the unique
      // index arbitrating a subject already held elsewhere). If it was not one, `settleUnclaimedLink` rethrows
      // `failure` itself, and the `?? failure` below re-raises it here too: a rejected audit insert surfaces
      // as the database error it is, never as a fabricated refusal code.
      const settled = await ctx.sessions.settleUnclaimedLink(userId, externalId, failure);
      throw refusalFor(settled, userId) ?? failure;
    }
    if (bound.length === 0) {
      // Nothing was bound, so (by the `changes()` guard) nothing was audited either. `already-linked` is the
      // one settlement that is not a refusal — it falls through to the success view below.
      const refusal = refusalFor(await ctx.sessions.settleUnclaimedLink(userId, externalId), userId);
      if (refusal !== undefined) {
        throw refusal;
      }
    }
    // Return the fresh view (the externalId now reflects the link; ownerHandle unchanged for a human).
    const linked = await loadUser(ctx.db, userId);
    if (linked === undefined) {
      throw new DomainNotFoundError("user", userId);
    }
    return linked;
  };
}
