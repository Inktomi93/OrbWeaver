// fetch-owned — the ONE owner-scoped single-row fetch. The single-owned ownership category
// (characters / personas / presets / world_books / tags / user_credentials / workloads / assets — D23)
// shares this read: load a row by id AND owner in one query, so a non-owner gets `undefined`, never
// another user's row. `OwnedTable` is `SQLiteTable & { id; ownerId }` — it needs drizzle column types,
// so it cannot be `@orb/kit`-pure (which is why it lives in db/kit, not kit). `ownerId` is `principal.userId`
// (§7.1). NOTE: membership-scoped chats (D18) do NOT use this — they go through `requireParticipant`.

import type { UserId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Db } from "../client";

// At most one row matches a PK+owner predicate; the limit is belt-and-suspenders.
const LIMIT_ONE = 1;

/** The two columns every single-owned table exposes for the owner-scoped fetch. */
export interface OwnedColumns {
  readonly id: SQLiteColumn;
  readonly ownerId: SQLiteColumn;
}

/** A drizzle table in the single-owned category — has a branded `id` PK and an `ownerId` FK to users. */
export type OwnedTable = SQLiteTable & OwnedColumns;

/**
 * Load the row of `table` with `id` owned by `ownerId`, or `undefined`. The owner predicate is part of
 * the WHERE (not a post-filter), so the query can never return a row the caller doesn't own.
 */
export async function fetchOwned<T extends OwnedTable>(db: Db, table: T, id: string, ownerId: UserId): Promise<T["$inferSelect"] | undefined> {
  const rows = await db
    .select()
    .from(table)
    .where(and(eq(table.id, id), eq(table.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows[0] as T["$inferSelect"] | undefined;
}
