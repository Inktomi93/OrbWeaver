import type { ResolvedIdentity, UserRole } from "@orb/contracts/identity";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { newId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { ProvisionResult } from "../contract/results.ts";
import type { SessionsContext, SessionsService } from "../contract/service.ts";
import {
  insertUser,
  selectForProvisionByExternalId,
  selectForProvisionByHandle,
  selectForProvisionById,
  selectOwnerUserId,
  updateUser,
} from "../persistence/users.ts";
import { deriveIdentityAccess, isOwnerByPolicy, reDeriveRoleOnLogin } from "../substrate/role-policy.ts";

// The SSO seam upsert. Keys on the stable `externalId` first (a username rename updates `handle` on the
// same row), falling back to `handle`. The access-gate policy gates login and derives the global role. A
// denied identity returns `{outcome:"denied"}` — no row is created or updated. `role` is seeded on insert;
// on update it re-derives when group governance is active — except the owner, whose role is never
// re-derived and who is never denied. `email` refreshes from the claim when carried (keep-on-null);
// `enabled` is never reset on update. Race-tolerant insert + re-read absorbs a concurrent first-login loser.
//
// OWNER-FLIP RECONCILIATION (#8): an owner-by-policy OIDC login whose subject/handle does NOT resolve to the
// existing seeded (single-user/local) owner row binds ONTO that row (`bindOwnerSubject`) rather than minting
// a second row the singleton then downgrades to `user`. This is what lets the owner flip single-user → OIDC
// without db surgery; see the guarded branch below for the exact adoptability conditions.

// The matched-row shape, derived from the persistence query. File-local.
type ExistingUser = NonNullable<Awaited<ReturnType<typeof selectForProvisionByHandle>>>;

/** Match by the stable `externalId` first (rename-safe), then by `handle`. */
async function findExisting(ctx: SessionsContext, identity: ResolvedIdentity): Promise<ExistingUser | undefined> {
  if (identity.externalId !== null) {
    const byExternal = await selectForProvisionByExternalId(ctx.db, identity.externalId);
    if (byExternal !== undefined) {
      return byExternal;
    }
  }
  return await selectForProvisionByHandle(ctx.db, identity.handle);
}

/** Refresh `handle`/`externalId`/`email`; re-derive `role` only when `allowReDerive` and the re-derive
 *  policy is on; never touch `enabled`. Update only when something actually changed. */
async function updateExisting(
  ctx: SessionsContext,
  existing: ExistingUser,
  identity: ResolvedIdentity,
  role: { resolved: UserRole; allowReDerive: boolean },
): Promise<ProvisionResult> {
  const changes: { handle?: Handle; externalId?: ExternalId; email?: string; role?: UserRole } = {};
  if (identity.externalId !== null && existing.externalId !== identity.externalId) {
    changes.externalId = identity.externalId;
  }
  if (existing.handle !== identity.handle) {
    changes.handle = identity.handle;
  }
  if (identity.email !== null && existing.email !== identity.email) {
    changes.email = identity.email;
  }
  let effectiveRole = existing.role;
  if (role.allowReDerive && reDeriveRoleOnLogin() && role.resolved !== existing.role) {
    changes.role = role.resolved;
    effectiveRole = role.resolved;
  }
  if (Object.keys(changes).length > 0) {
    await updateUser(ctx.db, existing.id, { ...changes, updatedAt: ctx.now() });
    const roleChange = changes.role !== undefined ? { roleChanged: { from: existing.role, to: changes.role } } : {};
    getLog().info({ handle: identity.handle, externalId: identity.externalId, ...roleChange }, "user: provisioned SSO identity (updated)");
  }
  return {
    outcome: "provisioned",
    userId: existing.id,
    enabled: existing.enabled,
    role: effectiveRole,
  };
}

/** First-login INSERT (race-tolerant) + re-read by the keyed column to return the canonical row. */
async function insertNew(ctx: SessionsContext, identity: ResolvedIdentity, resolvedRole: UserRole): Promise<ProvisionResult> {
  const now = ctx.now();
  await insertUser(ctx.db, {
    id: newId<UserId>(),
    handle: identity.handle,
    externalId: identity.externalId,
    email: identity.email,
    role: resolvedRole,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  });
  const settled =
    identity.externalId !== null
      ? await selectForProvisionByExternalId(ctx.db, identity.externalId)
      : await selectForProvisionByHandle(ctx.db, identity.handle);
  if (settled === undefined) {
    // Unreachable: either our insert succeeded or a concurrent one did.
    throw new Error(`provisionIdentity: row missing after insert (handle=${identity.handle}, externalId=${identity.externalId ?? "null"})`);
  }
  getLog().info({ handle: identity.handle, externalId: identity.externalId, role: settled.role }, "user: provisioned SSO identity (created)");
  return {
    outcome: "provisioned",
    userId: settled.id,
    enabled: settled.enabled,
    role: settled.role,
  };
}

/**
 * OWNER-FLIP RECONCILIATION (#8, D17/D135). An owner-by-policy SSO identity whose stable subject did not
 * resolve to the owner row ADOPTS the existing UNBOUND owner row — the single-user/local seeded (or
 * owner-fallback-created) owner, whose `externalId` is still null — instead of minting a SECOND row that
 * `reconcileOwnerSingleton` would downgrade to `user`, stranding the owner's whole library under an
 * un-loginable row (the owner's daily dogfood pain: a mode flip → OIDC sign-in collides with the seeded
 * owner). Returns the bound `ProvisionResult`, or `null` when this login is NOT such an adoption (the caller
 * falls through to the normal write). Owner-by-policy is asked through `isOwnerByPolicy` — the role-policy
 * home — never a `role === "owner"` lattice compare. Guarded so it can never steal a bound identity or crash
 * on the UNIQUE `external_id`: it needs a subject to bind, an UNBOUND owner to bind onto, and a subject that
 * does not already live on another row (`existing` matched by externalId ⇒ normal update, not adoption).
 */
async function tryAdoptUnboundOwner(
  ctx: SessionsContext,
  identity: ResolvedIdentity,
  existing: ExistingUser | undefined,
  ownerId: UserId | undefined,
): Promise<ProvisionResult | null> {
  if (identity.externalId === null || ownerId === undefined || !isOwnerByPolicy(identity.handle, identity.groups)) {
    return null;
  }
  if (existing !== undefined && existing.externalId === identity.externalId) {
    return null;
  }
  const owner = await selectForProvisionById(ctx.db, ownerId);
  if (owner === undefined || owner.externalId !== null) {
    return null;
  }
  return await bindOwnerSubject(ctx, owner, identity, identity.externalId);
}

/** Bind an OIDC subject onto the existing UNBOUND owner row (owner-flip reconciliation, #8/D17/D135). Links
 *  the stable `externalId` (+ refreshes email) and keeps `role=owner`; the owner's HANDLE is deliberately
 *  left as seeded — it is the `OWNER_HANDLES` key the boot owner-seed and the owner-fallback both resolve on,
 *  so keeping it makes `externalId` the durable OIDC key while re-seed / mode-flip stay idempotent (no
 *  duplicate owner row, no db surgery). The caller has already guaranteed `externalId !== null`. */
async function bindOwnerSubject(ctx: SessionsContext, owner: ExistingUser, identity: ResolvedIdentity, externalId: ExternalId): Promise<ProvisionResult> {
  const patch: { externalId: ExternalId; email?: string; updatedAt: number } = { externalId, updatedAt: ctx.now() };
  if (identity.email !== null && owner.email !== identity.email) {
    patch.email = identity.email;
  }
  await updateUser(ctx.db, owner.id, patch);
  getLog().info(
    { handle: identity.handle, externalId, ownerId: owner.id },
    "user: bound OIDC subject to the existing owner row (owner-flip reconciliation, D17)",
  );
  return { outcome: "provisioned", userId: owner.id, enabled: owner.enabled, role: "owner" };
}

/** The box has exactly one owner. When the owner policy would mint a second owner, downgrade to `user`
 *  (warned) so the write never surfaces as a raw unique violation. A re-login of the same owner row keeps
 *  `owner`. */
function reconcileOwnerSingleton(derivedRole: UserRole, ownerId: UserId | undefined, existing: ExistingUser | undefined, identity: ResolvedIdentity): UserRole {
  if (derivedRole !== "owner") {
    return derivedRole;
  }
  if (ownerId === undefined || ownerId === existing?.id) {
    return "owner";
  }
  getLog().warn(
    { handle: identity.handle, externalId: identity.externalId, existingOwnerId: ownerId },
    "user: owner policy matched but an owner already exists (D17: exactly one owner) — provisioning as `user`; grant admin via setRole",
  );
  return "user";
}

export function createProvisionIdentity(ctx: SessionsContext): Pick<SessionsService, "provisionIdentity"> {
  async function provisionIdentity(identity: ResolvedIdentity): Promise<ProvisionResult> {
    const existing = await findExisting(ctx, identity);
    const ownerId = await selectOwnerUserId(ctx.db);
    // Owner exemption: the immutable bootstrap owner is matched by the existing owner row's id, never by a
    // role-literal compare. The owner is never denied by the access gate and never re-derived downward.
    if (existing !== undefined && ownerId !== undefined && existing.id === ownerId) {
      return await updateExisting(ctx, existing, identity, {
        resolved: existing.role,
        allowReDerive: false,
      });
    }

    // Non-owner: apply the login access gate + derive the role from IdP groups. A denied identity
    // creates/updates no row — fail-closed.
    const access = deriveIdentityAccess(identity.handle, identity.groups);
    if (access.outcome === "deny") {
      getLog().warn(
        { handle: identity.handle, externalId: identity.externalId },
        "user: SSO login denied — identity is in none of OIDC_ALLOWED_GROUPS (fail-closed access gate)",
      );
      return { outcome: "denied" };
    }
    // OWNER-FLIP RECONCILIATION (#8): bind an owner-by-policy login onto the existing unbound seeded owner row
    // rather than minting a second row the singleton downgrades to `user` (see `tryAdoptUnboundOwner`).
    const adopted = await tryAdoptUnboundOwner(ctx, identity, existing, ownerId);
    if (adopted !== null) {
      return adopted;
    }

    // Reconcile a policy-matched second owner against the singleton (downgrade to `user`) before writing.
    const resolvedRole = reconcileOwnerSingleton(access.role, ownerId, existing, identity);
    return existing !== undefined
      ? await updateExisting(ctx, existing, identity, {
          resolved: resolvedRole,
          allowReDerive: true,
        })
      : await insertNew(ctx, identity, resolvedRole);
  }
  return { provisionIdentity };
}
