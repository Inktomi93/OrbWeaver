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
// CHECK (external_id IS NULL for agents) already makes the underlying `linkExternalId` write fail closed.
// The BIND-ONCE identity invariant (never rebind a bound row; refuse a subject already bound elsewhere) is
// the injected sessions `linkExternalId` capability's — the ONE externalId-linking site (spine U1). This
// verb maps its outcome union onto typed operation codes.

import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { AdminContext } from "../context.ts";
import { ADMIN_OP_CODES } from "../contract/errors.ts";
import type { LinkSsoIdentityParams } from "../contract/params.ts";
import type { AdminService } from "../contract/service.ts";
import { requireAdmin } from "../guard.ts";
import { loadUser } from "../persistence/queries.ts";

const OWNER_ROLE = "owner";

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

    const result = await ctx.sessions.linkExternalId(userId, externalId);
    // Map the capability's refusal outcomes onto typed operation codes; `linked` / `already-linked` proceed.
    if (result.outcome === "not-found") {
      // The row vanished between loadUser and the link (concurrent delete) — surface as not-found.
      throw new DomainNotFoundError("user", userId);
    }
    if (result.outcome === "target-bound") {
      throw new DomainOperationError(
        ADMIN_OP_CODES.ssoRowBound,
        "this account is already linked to a different SSO identity; unlink it first (out-of-band) before rebinding",
      );
    }
    if (result.outcome === "subject-taken") {
      throw new DomainOperationError(ADMIN_OP_CODES.ssoSubjectTaken, "that SSO identity is already linked to another account");
    }

    const at = ctx.now();
    await ctx.audit(
      {
        actorUserId: params.principal.userId,
        action: "admin.linkSsoIdentity",
        entityType: "user",
        entityId: userId,
        metadata: { externalId, idempotent: result.outcome === "already-linked" },
      },
      at,
    );
    // Return the fresh view (the externalId now reflects the link; ownerHandle unchanged for a human).
    const linked = await loadUser(ctx.db, userId);
    if (linked === undefined) {
      throw new DomainNotFoundError("user", userId);
    }
    return linked;
  };
}
