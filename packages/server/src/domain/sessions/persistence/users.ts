import type { UserRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { AwaitableBatchStmt } from "@orb/db/kit";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { ProvisionCandidate } from "../contract/results.ts";

// The `users`-row resolution queries. Lookups for `ensureUser` (by handle) + `provisionIdentity` (by
// externalId, then handle). Race-tolerant inserts via `onConflictDoNothing`. Timestamps arrive as params.

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

/** `authenticate` lookup: the local-login credential row for a handle. `passwordHash` is null for
 *  an SSO-only row (fails verification against the dummy hash — never a fast reject). */
export async function selectAuthByHandle(db: Db, handle: Handle): Promise<{ id: UserId; passwordHash: string | null; enabled: boolean } | undefined> {
  const rows = await db.select({ id: users.id, passwordHash: users.passwordHash, enabled: users.enabled }).from(users).where(eq(users.handle, handle)).limit(1);
  return rows.at(0);
}

/** `loadUserById` lookup: the live row for a bare user id. */
export async function selectForProvisionById(db: Db, id: UserId): Promise<ProvisionCandidate | undefined> {
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
export async function selectForProvisionByExternalId(db: Db, externalId: ExternalId): Promise<ProvisionCandidate | undefined> {
  const rows = await db.select(PROVISION_COLS).from(users).where(eq(users.externalId, externalId)).limit(1);
  return rows.at(0);
}

/** `provisionIdentity` / `ensureUser` lookup by handle (single-user rows / first SSO login of an existing
 *  handle). */
export async function selectForProvisionByHandle(db: Db, handle: Handle): Promise<ProvisionCandidate | undefined> {
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

/** D254 — does any row carry this handle, compared case-insensitively? The signup route's check before any
 *  password hashing; the account insert repeats it inside the batch. `lower()` folds ASCII only, which is the
 *  whole signup handle alphabet (`signupHandleSchema`). */
export async function selectHandleTakenCaseless(db: Db, handle: Handle): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).where(sql`lower(${users.handle}) = lower(${handle})`).limit(1);
  return rows.length > 0;
}

/**
 * D254 — the signup account insert, UNEXECUTED, for the caller's batch. It writes a `user`-role human with the
 * password hash only where `admission` holds and no row carries the handle case-insensitively. There is no
 * `onConflictDoNothing`: an exact-handle race throws and rolls the whole batch back, never a silent no-op a
 * later statement could misread. The values are positional over the table's declared column order (the
 * `buildAuditStatementIfPrecedingWrote` precedent), so a new `users` column is a loud column-count error.
 */
export function insertSignupUserStatement(
  db: Db,
  row: { readonly id: UserId; readonly handle: Handle; readonly passwordHash: string; readonly at: number },
  admission: SQL,
): AwaitableBatchStmt<{ id: UserId }[]> {
  return db
    .insert(users)
    .select(
      sql`select ${row.id}, ${row.handle}, null, null, 'user', 1, ${row.passwordHash}, 'human', null, ${row.at}, ${row.at} where ${admission} and not exists (select 1 from ${users} where lower(${users.handle}) = lower(${row.handle}))`,
    )
    .returning({ id: users.id });
}

/** The SSO signup account a pending-join confirm writes (D254). */
interface PendingSignupAccount {
  readonly id: UserId;
  readonly handle: Handle;
  readonly externalId: ExternalId;
  readonly email: string | null;
  readonly role: UserRole;
  readonly enabled: boolean;
  readonly at: number;
}

/**
 * D254 — the OIDC pending-join confirm's account insert, UNEXECUTED, for chat's batch. It binds the subject on
 * a NEW row only, decided by `decideProvision` (the verb keeps only an insert), and writes only where the
 * pending take before it deleted a row (`changes() > 0`), `admission` (chat's opaque invite predicate) holds,
 * and no row carries the email. Handle, subject and owner collisions are the unique indexes' job: there is no
 * `onConflictDoNothing`, so a race throws and rolls the batch back. Positional over the declared column order,
 * like {@link insertSignupUserStatement}.
 */
export function insertPendingSignupUserStatement(db: Db, row: PendingSignupAccount, admission: SQL): AwaitableBatchStmt<{ id: UserId }[]> {
  const emailFree = row.email === null ? sql`1 = 1` : sql`not exists (select 1 from ${users} where ${users.email} = ${row.email})`;
  return db
    .insert(users)
    .select(
      sql`select ${row.id}, ${row.handle}, ${row.externalId}, ${row.email}, ${row.role}, ${row.enabled ? 1 : 0}, null, 'human', null, ${row.at}, ${row.at} where changes() > 0 and ${admission} and ${emailFree}`,
    )
    .returning({ id: users.id });
}

/** The provision UPDATE — only the supplied keys change (`enabled` is never among them). */
export async function updateUser(db: Db, id: UserId, patch: UserPatch): Promise<void> {
  await db.update(users).set(patch).where(eq(users.id, id));
}

/** THE ONE atomic externalId claim (U1 — both sanctioned capabilities bind through this single statement).
 *  The unbound test rides INSIDE the UPDATE (`WHERE id = ? AND external_id IS NULL`), so a concurrent rebind
 *  cannot slip between a read and the write; `users_external_id_unique` arbitrates claims by DIFFERENT rows.
 *  EMPTY rows back means this call did not bind — the row is gone, already carries a subject, or another
 *  writer won it — and the caller settles WHY from durable state.
 *
 *  UNEXECUTED and awaitable ({@link AwaitableBatchStmt}, the `revokeAllForUserStatement` shape): `await` it
 *  to run it standalone (`provisionIdentity`'s owner-flip bind), or hand it to a `db.batch` so the bind
 *  commits with its caller's other statements (#1707: the admin link's audit row). One statement either way
 *  — never a second spelling of the claim. */
export function claimExternalIdIfUnbound(db: Db, id: UserId, externalId: ExternalId, updatedAt: number): AwaitableBatchStmt<{ id: UserId }[]> {
  return db
    .update(users)
    .set({ externalId, updatedAt })
    .where(and(eq(users.id, id), isNull(users.externalId)))
    .returning({ id: users.id });
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
