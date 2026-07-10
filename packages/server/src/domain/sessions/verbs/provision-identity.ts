import type { ResolvedIdentity, UserRole } from "@orb/contracts/identity";
import { isReservedAgentHandle } from "@orb/contracts/identity";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { newId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { ProvisionResult } from "../contract/results";
import type { SessionsContext, SessionsService } from "../contract/service";
import {
  insertUser,
  selectForProvisionByExternalId,
  selectForProvisionByHandle,
  selectOwnerUserId,
  updateUser,
} from "../persistence/users";
import { deriveIdentityAccess, reDeriveRoleOnLogin } from "../substrate/role-policy";

// The SSO seam upsert. Keys on the STABLE `externalId` first (a username rename updates `handle` on the
// SAME row — never a duplicate tenant), falling back to `handle`. The `deriveIdentityAccess` policy gates
// login (`OIDC_ALLOWED_GROUPS`) and derives the global role (owner/admin/user from IdP groups). A DENIED
// identity returns `{outcome:"denied"}` — NO row is created or updated (the seam → null → 401). `role` is
// SEEDED from the derived role on INSERT; on UPDATE it RE-DERIVES when group governance is active (or the
// legacy `RE_DERIVE_ROLE_ON_LOGIN` flag) — EXCEPT the owner, the immutable bootstrap singleton, whose role
// is never re-derived and who is never denied by the gate (matched by the EXISTING owner row). `email` is
// refreshed from the claim when carried (keep-on-null). `enabled` is NEVER reset on UPDATE (else a disabled
// user re-enables by logging in). Race-tolerant insert + re-read absorbs a concurrent first-login loser.

// The matched-row shape, DERIVED from the persistence query (one home — no re-spell). File-local.
type ExistingUser = NonNullable<Awaited<ReturnType<typeof selectForProvisionByHandle>>>;

/** Match by the stable `externalId` first (rename-safe), then by `handle`. */
async function findExisting(
  ctx: SessionsContext,
  identity: ResolvedIdentity,
): Promise<ExistingUser | undefined> {
  if (identity.externalId !== null) {
    const byExternal = await selectForProvisionByExternalId(ctx.db, identity.externalId);
    if (byExternal !== undefined) {
      return byExternal;
    }
  }
  return await selectForProvisionByHandle(ctx.db, identity.handle);
}

/** Refresh `handle`/`externalId`/`email` (rename + first-seen link + mutable contact); re-derive `role`
 *  ONLY when `allowReDerive` (owner rows pass `false` — never re-derived) AND the re-derive policy is on;
 *  never touch `enabled`. Update only when something actually changed (no per-login churn). Email is
 *  keep-on-null: a login carrying no email never wipes a stored one. */
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
    const roleChange =
      changes.role !== undefined ? { roleChanged: { from: existing.role, to: changes.role } } : {};
    getLog().info(
      { handle: identity.handle, externalId: identity.externalId, ...roleChange },
      "user: provisioned SSO identity (updated)",
    );
  }
  return {
    outcome: "provisioned",
    userId: existing.id,
    enabled: existing.enabled,
    role: effectiveRole,
  };
}

/** First-login INSERT (race-tolerant) + re-read by the keyed column to return the canonical row. */
async function insertNew(
  ctx: SessionsContext,
  identity: ResolvedIdentity,
  resolvedRole: UserRole,
): Promise<ProvisionResult> {
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
    // Unreachable: either our insert succeeded or a concurrent one did. Fail loud, never fabricate.
    throw new Error(
      `provisionIdentity: row missing after insert (handle=${identity.handle}, externalId=${identity.externalId ?? "null"})`,
    );
  }
  getLog().info(
    { handle: identity.handle, externalId: identity.externalId, role: settled.role },
    "user: provisioned SSO identity (created)",
  );
  return {
    outcome: "provisioned",
    userId: settled.id,
    enabled: settled.enabled,
    role: settled.role,
  };
}

/** D17 — the box has EXACTLY ONE owner (enforced by the `users_single_owner_unique` partial index). When the
 *  owner POLICY (OWNER_GROUP/OWNER_HANDLES) would mint a SECOND owner — a policy-matching login while a
 *  DIFFERENT owner row already exists — downgrade to `user` (warned) so the write never surfaces as a raw
 *  UNIQUE violation (a failed login with a DB error). `admin` is deliberately NOT chosen: the second
 *  would-be owner lands at least-privilege `user` and the owner may promote them (group→admin never mints a
 *  second owner). A re-login of the SAME owner row keeps `owner` (and the no-owner-yet first login mints it).
 *  `ownerId` is read once by the caller (also used for the owner-exemption check) and threaded in. */
function reconcileOwnerSingleton(
  derivedRole: UserRole,
  ownerId: UserId | undefined,
  existing: ExistingUser | undefined,
  identity: ResolvedIdentity,
): UserRole {
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

export function createProvisionIdentity(
  ctx: SessionsContext,
): Pick<SessionsService, "provisionIdentity"> {
  async function provisionIdentity(identity: ResolvedIdentity): Promise<ProvisionResult> {
    // FLAG[PD-17] / agent-principal-design/01 §3.2: refuse the reserved `__agent__` namespace (the SSO twin of
    // the ensureUser belt). An agent has no `externalId` (DDL CHECK) so it can never match the externalId key;
    // its handle is always `__agent__…`, so this closes the by-handle match/update path outright — no agent
    // row is ever matched, updated, or shadow-created via the SSO seam.
    if (isReservedAgentHandle(identity.handle)) {
      throw new DomainForbiddenError(
        "the __agent__ handle namespace is reserved for agent principals",
      );
    }
    const existing = await findExisting(ctx, identity);
    const ownerId = await selectOwnerUserId(ctx.db);
    // OWNER EXEMPTION (D17): the immutable bootstrap owner is matched by the EXISTING owner ROW (its id ===
    // the singleton owner id) — NOT by a role-literal compare (that lattice lives only in `can()`). The owner
    // is NEVER denied by the `OIDC_ALLOWED_GROUPS` gate and NEVER re-derived downward, even if the owner is
    // no longer in any configured group. Only its mutable attributes (handle/externalId/email) refresh.
    if (existing !== undefined && ownerId !== undefined && existing.id === ownerId) {
      return await updateExisting(ctx, existing, identity, {
        resolved: existing.role,
        allowReDerive: false,
      });
    }

    // Non-owner: apply the login access gate + derive the role from IdP groups. A DENIED identity (in none
    // of OIDC_ALLOWED_GROUPS, and not owner/admin) creates/updates NO row — fail-closed → the seam 401s.
    const access = deriveIdentityAccess(identity.handle, identity.groups);
    if (access.outcome === "deny") {
      getLog().warn(
        { handle: identity.handle, externalId: identity.externalId },
        "user: SSO login denied — identity is in none of OIDC_ALLOWED_GROUPS (fail-closed access gate)",
      );
      return { outcome: "denied" };
    }
    // Reconcile a policy-matched SECOND owner against the D17 singleton (downgrade to `user`) BEFORE writing.
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
