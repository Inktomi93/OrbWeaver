// domain/admin/persistence/queries — the admin READ surface over `users` (admin.md §persistence). admin
// is one of the two sanctioned direct `users` readers (the `no-direct-users-read` chokepoint exempts it)
// because every read is gated first. `userCols` is the ONE projection — it omits `passwordHash` (and any
// future secret), so a secret column can never leak into `AdminUserView` (invariant #5). The owner-
// immutability WRITE clause (`WHERE role <> 'owner'`) lives in the verbs (per-verb), NOT here — this slot
// is reads only.

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { AdminUserView } from "../contract/views";

const LIMIT_ONE = 1;

/** The secret-free `users` projection — the only column set admin reads. NO `passwordHash`. */
export const userCols = {
  id: users.id,
  handle: users.handle,
  externalId: users.externalId,
  role: users.role,
  enabled: users.enabled,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
} as const;

/** Load one user as the secret-free `AdminUserView`, or `undefined` if no such id. */
export async function loadUser(db: Db, userId: UserId): Promise<AdminUserView | undefined> {
  const rows = await db.select(userCols).from(users).where(eq(users.id, userId)).limit(LIMIT_ONE);
  return rows[0];
}

/** List every user as secret-free `AdminUserView`s (the admin user table). */
export function listAllUsers(db: Db): Promise<AdminUserView[]> {
  return db.select(userCols).from(users);
}
