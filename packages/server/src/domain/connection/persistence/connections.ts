// user_connections queries read JSON as text so the by-id runtime checks ownerId before decoding.
// parseStoredConnection owns the one canonical projection; corrupt bytes never become a writeable stand-in.

import type { UserConnection } from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import { userConnections } from "@orb/db";
import type { StoredConnectionRead } from "@orb/inference";
import type { UserConnectionId, UserId } from "@orb/kit/ids";
import { and, asc, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import type { StoredConnectionRow } from "../contract/stored.ts";
import { parseStoredConnection } from "../contract/stored.ts";

type ConnectionInsert = typeof userConnections.$inferInsert;

// Drizzle's JSON decoder must not run before the by-id consumer compares the stored owner.
const storedColumns = {
  ...getTableColumns(userConnections),
  declared: sql<string | null>`${userConnections.declared}`,
  extras: sql<string | null>`${userConnections.extras}`,
  transport: sql<string | null>`${userConnections.transport}`,
  promptCache: sql<string | null>`${userConnections.promptCache}`,
};

function storedRead(row: StoredConnectionRow): StoredConnectionRead {
  return {
    ownerId: row.ownerId,
    parse: () => parseStoredConnection(row),
  };
}

/** Owner-scoped fetch of one connection — `null` if missing / not-owned (no existence oracle). */
export async function fetchOwnedConnection(db: Db, ownerId: UserId, connectionId: UserConnectionId): Promise<UserConnection | null> {
  const rows = await db
    .select(storedColumns)
    .from(userConnections)
    .where(and(eq(userConnections.id, connectionId), eq(userConnections.ownerId, ownerId)))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : parseStoredConnection(row);
}

/** The runtime's `ConnectionStore.get` — BY ID, owner-agnostic: the resolver compares `ownerId` itself and
 *  refuses (and records) a binding that names a stranger's row before calling the explicit parser. */
// THE POST-FETCH ARM, deliberately one frame up. This is the runtime's `ConnectionStore.get` port, and BOTH consumers compare the owner themselves and collapse a foreign row to the SAME leak-free not-found: `resolve/resolve-task.ts#connectionFor` (`connection.ownerId !== funder` → a `connection_owner_mismatch` securityEvent + the identical `NoConnectionError` text) and `inference/index.ts#ownedConnection` (`requireOwned`). An ownerId in this WHERE would DESTROY the mismatch detection — a binding pointing at a stranger's row would read as "absent" and raise no security event. Ends if a caller ever reaches this without an owner comparison of its own.
export async function fetchConnectionById(db: Db, connectionId: UserConnectionId): Promise<StoredConnectionRead | null> {
  const rows = await db.select(storedColumns).from(userConnections).where(eq(userConnections.id, connectionId)).limit(1);
  const row = rows[0];
  return row === undefined ? null : storedRead(row);
}

/** Every connection the user owns, ordered by label for a stable list. */
export async function listOwnedConnections(db: Db, ownerId: UserId): Promise<readonly UserConnection[]> {
  const rows = await db.select(storedColumns).from(userConnections).where(eq(userConnections.ownerId, ownerId)).orderBy(asc(userConnections.label));
  return rows.map(parseStoredConnection);
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

/** Owner-scoped delete without JSON decoding, so an owner can remove an unreadable row. FK actions remain in SQL. */
export async function deleteOwnedConnection(db: Db, ownerId: UserId, connectionId: UserConnectionId): Promise<boolean> {
  const rows = await db
    .delete(userConnections)
    .where(and(eq(userConnections.id, connectionId), eq(userConnections.ownerId, ownerId)))
    .returning({ id: userConnections.id });
  return rows[0] !== undefined;
}
