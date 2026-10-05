// All db access for `user_connections` (queries only; the verbs validate). `toConnectionRow` is the ONE
// projection from the drizzle row to the cross-boundary `UserConnection` — the row is secret-free by
// construction (it names its credential by id), so the projection is a shape check, never a redaction.

import type { UserConnection } from "@orb/contracts/inference";
import { SUMMARIZE_CONCURRENCY_MAX } from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import { userConnections } from "@orb/db";
import { fetchOwned } from "@orb/db/kit";
import type { UserConnectionId, UserId } from "@orb/kit/ids";
import { and, asc, eq, getTableColumns, isNull } from "drizzle-orm";

type ConnectionRow = typeof userConnections.$inferSelect;
type ConnectionInsert = typeof userConnections.$inferInsert;

function toConnectionRow(row: ConnectionRow): UserConnection {
  const summarize = row.declared?.features?.concurrency?.summarize;
  const declared =
    summarize !== undefined && summarize > SUMMARIZE_CONCURRENCY_MAX
      ? {
          ...row.declared,
          features: { ...row.declared?.features, concurrency: { ...row.declared?.features?.concurrency, summarize: SUMMARIZE_CONCURRENCY_MAX } },
        }
      : row.declared;
  return {
    id: row.id,
    ownerId: row.ownerId,
    label: row.label,
    providerId: row.providerId,
    credentialId: row.credentialId,
    baseUrl: row.baseUrl,
    model: row.model,
    api: row.api,
    declared,
    extras: row.extras,
    transport: row.transport,
    modelCheck: row.modelCheck,
    allowBackground: row.allowBackground,
    promptCache: row.promptCache,
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
// @orb-waive owner-scoped-reads(userConnections): THE POST-FETCH ARM, deliberately one frame up. This is the runtime's `ConnectionStore.get` port, and BOTH consumers compare the owner themselves and collapse a foreign row to the SAME leak-free not-found: `resolve/resolve-task.ts#connectionFor` (`connection.ownerId !== funder` → a `connection_owner_mismatch` securityEvent + the identical `NoConnectionError` text) and `inference/index.ts#ownedConnection` (`requireOwned`). An ownerId in this WHERE would DESTROY the mismatch detection — a binding pointing at a stranger's row would read as "absent" and raise no security event. Ends if a caller ever reaches this without an owner comparison of its own.
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

type ConnectionPatch = Partial<Omit<ConnectionInsert, "id" | "ownerId" | "createdAt">>;

/** Write `prior` back, only while the row still holds every column `written` set. The owner's writes are queued, so
 *  this guards the writers outside that queue (a boot seed): an undo never overwrites a column one of them changed.
 *  It compares the written columns only, never `updatedAt`, which any writer bumps without touching them. One
 *  conditional UPDATE; each value binds through its column's own encoding, so a JSON column compares as stored text. */
export async function restoreOwnedConnectionIf(
  db: Db,
  ownerId: UserId,
  connectionId: UserConnectionId,
  args: { readonly written: ConnectionPatch; readonly prior: ConnectionPatch },
): Promise<void> {
  const columns = getTableColumns(userConnections);
  const holdsWritten = Object.entries(args.written).map(([name, value]) => {
    const column = columns[name as keyof typeof columns];
    return value === null || value === undefined ? isNull(column) : eq(column, value);
  });
  await db
    .update(userConnections)
    .set(args.prior)
    .where(and(eq(userConnections.id, connectionId), eq(userConnections.ownerId, ownerId), ...holdsWritten));
}

/** Owner-scoped delete. Bindings SET NULL, variants SET NULL, session entries CASCADE — schema physics. */
export async function deleteOwnedConnection(db: Db, ownerId: UserId, connectionId: UserConnectionId): Promise<void> {
  await db.delete(userConnections).where(and(eq(userConnections.id, connectionId), eq(userConnections.ownerId, ownerId)));
}
