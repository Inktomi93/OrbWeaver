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
import { determineRole, reDeriveRoleOnLogin } from "../substrate/role-policy";

// The SSO seam upsert. Keys on the STABLE `externalId` first (a username rename updates `handle` on the
// SAME row — never a duplicate tenant), falling back to `handle`. `role` is SEEDED from the owner policy
// on INSERT; on UPDATE it is PRESERVED by default (a manual `setRole` grant survives the next login)
// UNLESS `RE_DERIVE_ROLE_ON_LOGIN`. `enabled` is NEVER reset on UPDATE (else a disabled user re-enables by
// logging in — only a fresh INSERT is enabled). Race-tolerant insert + re-read absorbs a concurrent
// first-login loser. Returns `{ userId, enabled, role }` so the seam gates + builds the `Principal`.

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

/** Refresh `handle`/`externalId` (rename + first-seen link); re-derive `role` ONLY under the opt-in flag;
 *  never touch `enabled`. Update only when something actually changed (no per-login churn). */
async function updateExisting(
  ctx: SessionsContext,
  existing: ExistingUser,
  identity: ResolvedIdentity,
  resolvedRole: UserRole,
): Promise<ProvisionResult> {
  const changes: { handle?: Handle; externalId?: ExternalId; role?: UserRole } = {};
  if (identity.externalId !== null && existing.externalId !== identity.externalId) {
    changes.externalId = identity.externalId;
  }
  if (existing.handle !== identity.handle) {
    changes.handle = identity.handle;
  }
  let effectiveRole = existing.role;
  if (reDeriveRoleOnLogin() && resolvedRole !== existing.role) {
    changes.role = resolvedRole;
    effectiveRole = resolvedRole;
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
  return { userId: existing.id, enabled: existing.enabled, role: effectiveRole };
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
  return { userId: settled.id, enabled: settled.enabled, role: settled.role };
}

/** D17 — the box has EXACTLY ONE owner (enforced by the `users_single_owner_unique` partial index). When the
 *  owner POLICY (OWNER_GROUP/OWNER_HANDLES) would mint a SECOND owner — a policy-matching login while a
 *  DIFFERENT owner row already exists — downgrade to `user` (warned) so the write never surfaces as a raw
 *  UNIQUE violation (a failed login with a DB error). `admin` is deliberately NOT chosen: D17 forbids
 *  deriving `admin` from env (it is GRANTED by the owner via `setRole`), so the second would-be owner lands
 *  at least-privilege `user` and the owner may promote them. A re-login of the SAME owner row keeps `owner`
 *  (and the no-owner-yet first login mints it). */
async function reconcileOwnerSingleton(
  ctx: SessionsContext,
  derivedRole: UserRole,
  existing: ExistingUser | undefined,
  identity: ResolvedIdentity,
): Promise<UserRole> {
  if (derivedRole !== "owner") {
    return derivedRole;
  }
  const ownerId = await selectOwnerUserId(ctx.db);
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
    const derivedRole = determineRole(identity.handle, identity.groups);
    const existing = await findExisting(ctx, identity);
    // Reconcile the derived role against the D17 owner singleton BEFORE writing (a policy-matched second
    // owner is downgraded to `user`, never looped into the `users_single_owner_unique` violation).
    const resolvedRole = await reconcileOwnerSingleton(ctx, derivedRole, existing, identity);
    return existing !== undefined
      ? await updateExisting(ctx, existing, identity, resolvedRole)
      : await insertNew(ctx, identity, resolvedRole);
  }
  return { provisionIdentity };
}
