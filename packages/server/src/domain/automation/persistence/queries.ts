// domain/automation/persistence — all global_variables db access (queries only; the verbs own cap
// validation). Owner-scoped on `ownerId` throughout: a foreign-owned global is never returned/mutated.
// The table has NO surrogate id — its natural key is (owner_id, key), so every read/write predicate names
// BOTH columns (fetchOwned, which keys on a single `id` PK, does not apply).

import type { GlobalVariableView } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import { globalVariables } from "@orb/db";
import { escapeLikeTerm } from "@orb/db/kit";
import type { UserId } from "@orb/kit/ids";
import { and, asc, eq, sql } from "drizzle-orm";

const LIMIT_ONE = 1;

type GlobalVariableRow = typeof globalVariables.$inferSelect;

function toView(row: GlobalVariableRow): GlobalVariableView {
  return { key: row.key, value: row.value, updatedAt: row.updatedAt };
}

/** Read one owner-scoped global's value, or `null` (a foreign-owned/absent key reads as null — the owner
 *  predicate is in the WHERE). */
export async function selectGlobalVariable(db: Db, ownerId: UserId, key: string): Promise<string | null> {
  const rows = await db
    .select({ value: globalVariables.value })
    .from(globalVariables)
    .where(and(eq(globalVariables.ownerId, ownerId), eq(globalVariables.key, key)))
    .limit(LIMIT_ONE);
  return rows[0]?.value ?? null;
}

/** Upsert an owner-scoped global (last-write-wins on the (owner_id, key) natural key). */
export async function upsertGlobalVariable(db: Db, row: { ownerId: UserId; key: string; value: string; updatedAt: number }): Promise<void> {
  await db
    .insert(globalVariables)
    .values(row)
    .onConflictDoUpdate({ target: [globalVariables.ownerId, globalVariables.key], set: { value: row.value, updatedAt: row.updatedAt } });
}

/** Remove an owner-scoped global. Idempotent — deleting an absent key is a no-op. */
export async function deleteGlobalVariable(db: Db, ownerId: UserId, key: string): Promise<void> {
  await db.delete(globalVariables).where(and(eq(globalVariables.ownerId, ownerId), eq(globalVariables.key, key)));
}

/** List the owner's globals (key-sorted), optionally narrowed to a key prefix. The prefix's LIKE
 *  metacharacters (`\`, `%`, `_`) are escaped under an explicit `ESCAPE` clause so a literal `%`/`_` in
 *  the filter never acts as a wildcard. */
export async function listGlobalVariables(db: Db, ownerId: UserId, prefix?: string): Promise<GlobalVariableView[]> {
  const owned = eq(globalVariables.ownerId, ownerId);
  const where = prefix !== undefined && prefix !== "" ? and(owned, sql`${globalVariables.key} LIKE ${`${escapeLikeTerm(prefix)}%`} ESCAPE '\\'`) : owned;
  const rows = await db.select().from(globalVariables).where(where).orderBy(asc(globalVariables.key));
  return rows.map(toView);
}
