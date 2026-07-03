// domain/admin/persistence/queries — the admin READ surface over `users`. admin
// is one of the two sanctioned direct `users` readers (the `no-direct-users-read` chokepoint exempts it)
// because every read is gated first. `userCols` is the ONE projection — it omits `passwordHash` (and any
// future secret), so a secret column can never leak into `AdminUserView` (invariant #5). The owner-
// immutability WRITE clause (`WHERE role <> 'owner'`) lives in the verbs (per-verb), NOT here — this slot
// is reads only.

import type { UserKind } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { AdminUserView } from "../contract/views";

const LIMIT_ONE = 1;

/** The secret-free `users` projection — NO `passwordHash`. The RETURNABLE column set (`.returning(userCols)`
 *  on the update verbs — no join). D60: includes `kind`; `ownerHandle` is NOT here (it needs the self-join
 *  below, which `.returning()` cannot express — the update verbs merge it from their pre-loaded view). */
export const userCols = {
  id: users.id,
  handle: users.handle,
  externalId: users.externalId,
  role: users.role,
  enabled: users.enabled,
  kind: users.kind,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
} as const;

/** The owner-handle self-join (D60; agent-principal-design/06 §1): an agent's owner handle, NULL for humans
 *  (a leftJoin over the nullable `users.ownerUserId`). */
const ownerUser = alias(users, "owner_user");

/** The full read view: `userCols` + the joined `ownerHandle`. The SELECT producer of `AdminUserView`. */
const userViewCols = { ...userCols, ownerHandle: ownerUser.handle } as const;

/** Load one user as the secret-free `AdminUserView` (with `kind`/`ownerHandle`), or `undefined` if no such id. */
export async function loadUser(db: Db, userId: UserId): Promise<AdminUserView | undefined> {
  const rows = await db
    .select(userViewCols)
    .from(users)
    .leftJoin(ownerUser, eq(ownerUser.id, users.ownerUserId))
    .where(eq(users.id, userId))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** List users as secret-free `AdminUserView`s (the admin user table). `kind` filters the Humans/Agents tab;
 *  absent = ALL (D60 — the containment surface never hides a principal). */
export function listUsers(db: Db, kind?: UserKind): Promise<AdminUserView[]> {
  const base = db
    .select(userViewCols)
    .from(users)
    .leftJoin(ownerUser, eq(ownerUser.id, users.ownerUserId));
  return kind === undefined ? base : base.where(eq(users.kind, kind));
}
