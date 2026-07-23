import type { UserRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";

// The `users`-row resolution queries. Lookups for `ensureUser` (by handle) + `provisionIdentity` (by
// externalId, then handle). Race-tolerant inserts via `onConflictDoNothing`. Timestamps arrive as params.

/** The columns `provisionIdentity` needs to decide preserve-vs-update (incl. live `role`/`enabled`/`email`). */
interface ProvisionRow {
  id: UserId;
  handle: Handle;
  externalId: ExternalId | null;
  email: string | null;
  role: UserRole;
  enabled: boolean;
}

/** A fresh users row (the verb mints the id + derives the role). `enabled` defaults true at the schema. */
interface UserInsert {
  id: UserId;
  handle: Handle;
  externalId: ExternalId | null;
  email: string | null;
  role: UserRole;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/** The provision-UPDATE patch: rename `handle`, link a newly-seen `externalId`, refresh `email`, re-derive
 *  `role` (only under the re-derive policy). `enabled` is NEVER patched (a disabled user can't re-enable by
 *  login). */
interface UserPatch {
  handle?: Handle;
  externalId?: ExternalId;
  email?: string;
  role?: UserRole;
  updatedAt: number;
}

const PROVISION_COLS = {
  id: users.id,
  handle: users.handle,
  externalId: users.externalId,
  email: users.email,
  role: users.role,
  enabled: users.enabled,
} as const;

/** `authenticate` lookup (PD-83): the local-login credential row for a handle. `passwordHash` is null for
 *  an SSO-only row (fails verification against the dummy hash — never a fast reject). */
export async function selectAuthByHandle(db: Db, handle: Handle): Promise<{ id: UserId; passwordHash: string | null; enabled: boolean } | undefined> {
  const rows = await db.select({ id: users.id, passwordHash: users.passwordHash, enabled: users.enabled }).from(users).where(eq(users.handle, handle)).limit(1);
  return rows.at(0);
}

/** `loadUserById` lookup: the live row for a bare user id. */
export async function selectForProvisionById(db: Db, id: UserId): Promise<ProvisionRow | undefined> {
  const rows = await db.select(PROVISION_COLS).from(users).where(eq(users.id, id)).limit(1);
  return rows.at(0);
}

/** `ensureUser` lookup by handle. */
export async function selectIdByHandle(db: Db, handle: Handle): Promise<UserId | undefined> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.handle, handle)).limit(1);
  return rows.at(0)?.id;
}

/** The current owner's id, or `undefined` if none exists yet. `provisionIdentity` reads this to enforce the
 *  "exactly one owner" singleton before a policy-matching second login writes `role=owner`. */
export async function selectOwnerUserId(db: Db): Promise<UserId | undefined> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.role, "owner")).limit(1);
  return rows.at(0)?.id;
}

/** `provisionIdentity` lookup by the stable SSO subject (the rename-safe key). */
export async function selectForProvisionByExternalId(db: Db, externalId: ExternalId): Promise<ProvisionRow | undefined> {
  const rows = await db.select(PROVISION_COLS).from(users).where(eq(users.externalId, externalId)).limit(1);
  return rows.at(0);
}

/** `provisionIdentity` / `ensureUser` lookup by handle (single-user rows / first SSO login of an existing
 *  handle). */
export async function selectForProvisionByHandle(db: Db, handle: Handle): Promise<ProvisionRow | undefined> {
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
