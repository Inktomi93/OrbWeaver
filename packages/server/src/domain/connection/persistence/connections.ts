// All db access for `user_connections` (queries only; the verbs validate). `toConnectionRow` is the ONE
// projection from the drizzle row to the cross-boundary `UserConnection` — the row is secret-free by
// construction (it names its credential by id), so the projection is a shape check, never a redaction.

import type { UserConnection } from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import { userConnections } from "@orb/db";
import { fetchOwned } from "@orb/db/kit";
import type { UserConnectionId, UserId } from "@orb/kit/ids";
import { and, asc, eq } from "drizzle-orm";

type ConnectionRow = typeof userConnections.$inferSelect;
type ConnectionInsert = typeof userConnections.$inferInsert;

function toConnectionRow(row: ConnectionRow): UserConnection {
  return {
    id: row.id,
    ownerId: row.ownerId,
    label: row.label,
    providerId: row.providerId,
    credentialId: row.credentialId,
    baseUrl: row.baseUrl,
    model: row.model,
    api: row.api,
    declared: row.declared,
    extras: row.extras,
    transport: row.transport,
    modelListed: row.modelListed,
    allowBackground: row.allowBackground,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Owner-scoped fetch of one connection — `null` if missing / not-owned (no existence oracle). */
export async function fetchOwnedConnection(db: Db, ownerId: UserId, connectionId: UserConnectionId): Promise<UserConnection | null> {
  const row = await fetchOwned(db, userConnections, connectionId, ownerId);
  return row === undefined ? null : toConnectionRow(row);
}

/** The runtime's `ConnectionStore.get` — BY ID, owner-agnostic: the resolver compares `ownerId` itself and
 *  refuses (and records) a binding that names a stranger's row. */
export async function fetchConnectionById(db: Db, connectionId: UserConnectionId): Promise<UserConnection | null> {
  const rows = await db.select().from(userConnections).where(eq(userConnections.id, connectionId)).limit(1);
  const row = rows[0];
  return row === undefined ? null : toConnectionRow(row);
}

/** Every connection the user owns, ordered by label for a stable list. */
export async function listOwnedConnections(db: Db, ownerId: UserId): Promise<readonly UserConnection[]> {
  const rows = await db.select().from(userConnections).where(eq(userConnections.ownerId, ownerId)).orderBy(asc(userConnections.label));
  return rows.map(toConnectionRow);
}

/** The labels the user already holds — the auto-label's collision suffix reads this. */
export async function listOwnedLabels(db: Db, ownerId: UserId): Promise<readonly string[]> {
  const rows = await db.select({ label: userConnections.label }).from(userConnections).where(eq(userConnections.ownerId, ownerId));
  return rows.map((row) => row.label);
}

export async function insertConnection(db: Db, values: ConnectionInsert): Promise<void> {
  await db.insert(userConnections).values(values);
}

/** Owner-scoped FIELD-WISE update (ground5 M6): only the keys present are written. */
export async function updateOwnedConnection(
  db: Db,
  ownerId: UserId,
  connectionId: UserConnectionId,
  patch: Partial<Omit<ConnectionInsert, "id" | "ownerId" | "createdAt">>,
): Promise<void> {
  await db
    .update(userConnections)
    .set(patch)
    .where(and(eq(userConnections.id, connectionId), eq(userConnections.ownerId, ownerId)));
}

/** Owner-scoped delete. Bindings SET NULL, variants SET NULL, session entries CASCADE — schema physics. */
export async function deleteOwnedConnection(db: Db, ownerId: UserId, connectionId: UserConnectionId): Promise<void> {
  await db.delete(userConnections).where(and(eq(userConnections.id, connectionId), eq(userConnections.ownerId, ownerId)));
}
