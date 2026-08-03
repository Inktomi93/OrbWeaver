import type { ResolvedIdentity, UserRole } from "@orb/contracts/identity";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { newId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { ProvisionResult } from "../contract/results.ts";
import type { SessionsContext, SessionsService } from "../contract/service.ts";
import { insertUser, selectForProvisionByExternalId, selectForProvisionByHandle, selectOwnerUserId, updateUser } from "../persistence/users.ts";
import { deriveIdentityAccess, reDeriveRoleOnLogin } from "../substrate/role-policy.ts";

// The SSO seam upsert. Keys on the stable `externalId` first (a username rename updates `handle` on the
// same row), falling back to `handle`. The access-gate policy gates login and derives the global role. A
// denied identity returns `{outcome:"denied"}` — no row is created or updated. `role` is seeded on insert;
// on update it re-derives when group governance is active — except the owner, whose role is never
// re-derived and who is never denied. `email` refreshes from the claim when carried (keep-on-null);
// `enabled` is never reset on update. Race-tolerant insert + re-read absorbs a concurrent first-login loser.

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
