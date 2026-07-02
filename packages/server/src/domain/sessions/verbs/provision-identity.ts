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
  derivedRole: UserRole,
): Promise<ProvisionResult> {
  const changes: { handle?: Handle; externalId?: ExternalId; role?: UserRole } = {};
  if (identity.externalId !== null && existing.externalId !== identity.externalId) {
    changes.externalId = identity.externalId;
  }
  if (existing.handle !== identity.handle) {
    changes.handle = identity.handle;
  }
  let effectiveRole = existing.role;
  if (reDeriveRoleOnLogin() && derivedRole !== existing.role) {
    changes.role = derivedRole;
    effectiveRole = derivedRole;
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
  derivedRole: UserRole,
): Promise<ProvisionResult> {
  const now = ctx.now();
  await insertUser(ctx.db, {
    id: newId<UserId>(),
    handle: identity.handle,
    externalId: identity.externalId,
    role: derivedRole,
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
    return existing !== undefined
      ? await updateExisting(ctx, existing, identity, derivedRole)
      : await insertNew(ctx, identity, derivedRole);
  }
  return { provisionIdentity };
}
