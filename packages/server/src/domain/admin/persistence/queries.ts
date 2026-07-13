// domain/admin/persistence/queries — the admin read surface over `users`. admin is one of the two
// sanctioned direct `users` readers because every read is gated first. userCols omits passwordHash so a
// secret column can never leak into AdminUserView. The owner-immutability write clause lives in the verbs.

import type { UserKind } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { AdminUserView } from "../contract/views";

const LIMIT_ONE = 1;

/** ownerHandle isn't here — it needs the self-join below, which .returning() can't express. */
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

const ownerUser = alias(users, "owner_user");

const userViewCols = { ...userCols, ownerHandle: ownerUser.handle } as const;

export async function loadUser(db: Db, userId: UserId): Promise<AdminUserView | undefined> {
  const rows = await db
    .select(userViewCols)
    .from(users)
    .leftJoin(ownerUser, eq(ownerUser.id, users.ownerUserId))
    .where(eq(users.id, userId))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** kind filters the Humans/Agents tab; absent = all. */
export function listUsers(db: Db, kind?: UserKind): Promise<AdminUserView[]> {
  const base = db
    .select(userViewCols)
    .from(users)
    .leftJoin(ownerUser, eq(ownerUser.id, users.ownerUserId));
  return kind === undefined ? base : base.where(eq(users.kind, kind));
}
