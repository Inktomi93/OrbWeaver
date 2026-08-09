import type { UserRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";

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

/** MS-W1 collision detection: does any existing row already carry this email? `email` is a MUTABLE, non-key
 *  attribute (no UNIQUE) — this read is used ONLY to HARD-DENY a colliding JIT (never to LINK by email, which
 *  is the OpenWebUI W1 takeover). Returns the first matching row id, or undefined. */
export async function selectUserIdByEmail(db: Db, email: string): Promise<UserId | undefined> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  return rows.at(0)?.id;
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

/** B4 first-run: the owner row's password state — whether the singleton `role='owner'` row already carries
 *  a local password. `undefined` when there is no owner row (pre-seed). Drives the `localFirstRun` config
 *  flag: `hasPassword === false` ⇒ a fresh local box awaiting its in-app owner-password setup. */
export async function selectOwnerPasswordState(db: Db): Promise<{ id: UserId; hasPassword: boolean } | undefined> {
  const rows = await db.select({ id: users.id, passwordHash: users.passwordHash }).from(users).where(eq(users.role, "owner")).limit(1);
  const row = rows.at(0);
  if (row === undefined) {
    return;
  }
  return { id: row.id, hasPassword: row.passwordHash !== null };
}

/** B4 first-run: ONE-SHOT owner-password claim. Atomically writes the hash onto the owner row ONLY when its
 *  `password_hash IS NULL` (`WHERE role='owner' AND password_hash IS NULL RETURNING id`), so it can never
 *  overwrite an already-set owner credential (that is `admin.resetPassword`'s owner-gated job) and two
 *  concurrent first-run POSTs can never both win. Returns the owner `UserId` iff this call set the password,
 *  else `undefined` (already claimed / no owner row). */
export async function claimOwnerPasswordIfUnset(db: Db, passwordHash: string, at: number): Promise<UserId | undefined> {
  const updated = await db
    .update(users)
    .set({ passwordHash, updatedAt: at })
    .where(and(eq(users.role, "owner"), isNull(users.passwordHash)))
    .returning({ id: users.id });
  return updated.at(0)?.id;
}
