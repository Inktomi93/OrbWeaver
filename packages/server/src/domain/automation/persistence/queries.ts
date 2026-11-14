// domain/automation/persistence — all global_variables db access. Owner-scoped on `ownerId` throughout: a
// foreign-owned global is never returned/mutated. The table has NO surrogate id — its natural key is
// (owner_id, key), so every read/write predicate names BOTH columns (fetchOwned, which keys on a single `id` PK,
// does not apply).
//
// THE WRITE GUARD LIVES ON THE WRITE. Every writer of the plane — the set verb, and a rule arm writing a
// rendered template or a plugin tool's captured result, and a chat turn's `{{setglobalvar}}` — reaches
// `upsertGlobalVariableStatement`, so its key and value checks run here, once, for all of them. A NUL is refused because the driver returns text cut at its first NUL,
// so a stored NUL would read back as a different string.

import type { GlobalVariableView } from "@orb/contracts/automation";
import { containsNul, GLOBAL_VARIABLE_KEY_MAX_CHARS, GLOBAL_VARIABLE_VALUE_MAX_BYTES, globalVariableKeySchema } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import { globalVariables } from "@orb/db";
import type { RowsAffectedStmt } from "@orb/db/query";
import type { UserId } from "@orb/kit/ids";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { GlobalVariableInvalidError } from "../contract/errors.ts";

const LIMIT_ONE = 1;

type GlobalVariableRow = typeof globalVariables.$inferSelect;

function toView(row: GlobalVariableRow): GlobalVariableView {
  return { key: row.key, value: row.value };
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

/** Why the plane refuses `key` = `value` (its caps and its NUL refusal), or null when it stores it. */
export function globalVariableRefusal(key: string, value: string): string | null {
  if (!globalVariableKeySchema.safeParse(key).success) {
    if (key.length === 0) {
      return "global variable key must be non-empty";
    }
    if (key.length > GLOBAL_VARIABLE_KEY_MAX_CHARS) {
      return `global variable key length ${key.length} exceeds the ${GLOBAL_VARIABLE_KEY_MAX_CHARS}-char cap`;
    }
    if (containsNul(key)) {
      return "global variable key must not contain a NUL character";
    }
    return "global variable key is invalid";
  }
  if (containsNul(value)) {
    return "global variable value must not contain a NUL character";
  }
  const valueBytes = Buffer.byteLength(value, "utf8");
  if (valueBytes > GLOBAL_VARIABLE_VALUE_MAX_BYTES) {
    return `global variable value ${valueBytes} bytes exceeds the ${GLOBAL_VARIABLE_VALUE_MAX_BYTES}-byte cap`;
  }
  return null;
}

interface GlobalVariableWrite {
  readonly ownerId: UserId;
  readonly key: string;
  readonly value: string;
  readonly updatedAt: number;
}

/** The upsert of one owner-scoped global, unexecuted (last-write-wins on the (owner_id, key) natural key).
 *  @throws {@link GlobalVariableInvalidError} for a key or value {@link globalVariableRefusal} refuses, before any write. */
export function upsertGlobalVariableStatement(db: Db, row: GlobalVariableWrite): RowsAffectedStmt {
  const refusal = globalVariableRefusal(row.key, row.value);
  if (refusal !== null) {
    throw new GlobalVariableInvalidError(refusal);
  }
  return db
    .insert(globalVariables)
    .values(row)
    .onConflictDoUpdate({ target: [globalVariables.ownerId, globalVariables.key], set: { value: row.value, updatedAt: row.updatedAt } });
}

/** Upsert an owner-scoped global.
 *  @throws {@link GlobalVariableInvalidError} as {@link upsertGlobalVariableStatement} does, before any write. */
export async function upsertGlobalVariable(db: Db, row: GlobalVariableWrite): Promise<void> {
  await upsertGlobalVariableStatement(db, row);
}

/** How many globals the owner holds, and which of `keys` are among them. */
export async function loadGlobalVariableHoldings(
  db: Db,
  ownerId: UserId,
  keys: readonly string[],
): Promise<{ readonly count: number; readonly held: ReadonlySet<string> }> {
  const [total] = await db.select({ count: count() }).from(globalVariables).where(eq(globalVariables.ownerId, ownerId));
  const rows =
    keys.length === 0
      ? []
      : await db
          .select({ key: globalVariables.key })
          .from(globalVariables)
          .where(and(eq(globalVariables.ownerId, ownerId), inArray(globalVariables.key, [...keys])));
  return { count: total?.count ?? 0, held: new Set(rows.map((row) => row.key)) };
}

/** Remove an owner-scoped global. Idempotent — deleting an absent key is a no-op. */
export async function deleteGlobalVariable(db: Db, ownerId: UserId, key: string): Promise<void> {
  await db.delete(globalVariables).where(and(eq(globalVariables.ownerId, ownerId), eq(globalVariables.key, key)));
}

/** List the owner's globals, key-sorted. */
export async function listGlobalVariables(db: Db, ownerId: UserId): Promise<GlobalVariableView[]> {
  const rows = await db.select().from(globalVariables).where(eq(globalVariables.ownerId, ownerId)).orderBy(asc(globalVariables.key));
  return rows.map(toView);
}
