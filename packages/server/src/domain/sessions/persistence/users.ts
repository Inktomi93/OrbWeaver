import type { UserRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";

// domain/sessions/persistence/users — the `users`-row resolution queries (the table DEFINITION stays in
// @orb/db; this domain is its only resolution-path writer). Lookups for `ensureUser` (by handle) +
// `provisionIdentity` (by the stable externalId, then handle). Race-tolerant inserts via
// `onConflictDoNothing`. Timestamps arrive as PARAMS (the verb's injected clock — determinism).
//
// Query SHAPES are file-local (not exported): callers pass literals + read the inferred/annotated return,
// so no feature type leaks out of `persistence/` (no-inline-types).

/** The columns `provisionIdentity` needs to decide preserve-vs-update (incl. live `role`/`enabled`). */
interface ProvisionRow {
  id: UserId;
  handle: Handle;
  externalId: ExternalId | null;
  role: UserRole;
  enabled: boolean;
}

/** A fresh users row (the verb mints the id + derives the role). `enabled` defaults true at the schema. */
interface UserInsert {
  id: UserId;
  handle: Handle;
  externalId: ExternalId | null;
  role: UserRole;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/** The provision-UPDATE patch: rename `handle`, link a newly-seen `externalId`, re-derive `role` (only
 *  under RE_DERIVE_ROLE_ON_LOGIN). `enabled` is NEVER patched (a disabled user can't re-enable by login). */
interface UserPatch {
  handle?: Handle;
  externalId?: ExternalId;
  role?: UserRole;
  updatedAt: number;
}

const PROVISION_COLS = {
  id: users.id,
  handle: users.handle,
  externalId: users.externalId,
  role: users.role,
  enabled: users.enabled,
} as const;

/** `authenticate` lookup (PD-83): the local-login credential row for a handle. `passwordHash` is null for
 *  an SSO-only row (fails verification against the dummy hash — never a fast reject). */
export async function selectAuthByHandle(
  db: Db,
  handle: Handle,
): Promise<{ id: UserId; passwordHash: string | null; enabled: boolean } | undefined> {
  const rows = await db
    .select({ id: users.id, passwordHash: users.passwordHash, enabled: users.enabled })
    .from(users)
    .where(eq(users.handle, handle))
    .limit(1);
  return rows.at(0);
}

/** `loadUserById` lookup: the live row for a bare user id (the entry root's frozen-host → `Principal`
 *  bridge — PD-73). Reuses the provision column set (id/handle/externalId/role/enabled). */
export async function selectForProvisionById(
  db: Db,
  id: UserId,
): Promise<ProvisionRow | undefined> {
  const rows = await db.select(PROVISION_COLS).from(users).where(eq(users.id, id)).limit(1);
  return rows.at(0);
}

/** `ensureUser` lookup: the row id for a handle, or undefined. */
export async function selectIdByHandle(db: Db, handle: Handle): Promise<UserId | undefined> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.handle, handle))
    .limit(1);
  return rows.at(0)?.id;
}

/** `provisionIdentity` lookup by the stable SSO subject (the rename-safe key). */
export async function selectForProvisionByExternalId(
  db: Db,
  externalId: ExternalId,
): Promise<ProvisionRow | undefined> {
  const rows = await db
    .select(PROVISION_COLS)
    .from(users)
    .where(eq(users.externalId, externalId))
    .limit(1);
  return rows.at(0);
}

/** `provisionIdentity` / `ensureUser` lookup by handle (single-user rows / first SSO login of an existing
 *  handle). */
export async function selectForProvisionByHandle(
  db: Db,
  handle: Handle,
): Promise<ProvisionRow | undefined> {
  const rows = await db.select(PROVISION_COLS).from(users).where(eq(users.handle, handle)).limit(1);
  return rows.at(0);
}

/** Race-tolerant insert: `onConflictDoNothing` on either unique column (handle OR externalId) absorbs a
 *  concurrent first-login loser; the verb re-reads to return the canonical row. */
export async function insertUser(db: Db, row: UserInsert): Promise<void> {
  await db.insert(users).values(row).onConflictDoNothing();
}

/** The provision UPDATE — only the supplied keys change (`enabled` is never among them). */
export async function updateUser(db: Db, id: UserId, patch: UserPatch): Promise<void> {
  await db.update(users).set(patch).where(eq(users.id, id));
}
