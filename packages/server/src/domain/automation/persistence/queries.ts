// domain/automation/persistence — all global_variables db access. Owner-scoped on `ownerId` throughout: a
// foreign-owned global is never returned/mutated. The table has NO surrogate id — its natural key is
// (owner_id, key), so every read/write predicate names BOTH columns (fetchOwned, which keys on a single `id` PK,
// does not apply).
//
// THE WRITE GUARD LIVES ON THE WRITE. Every writer of the plane — the set verb, and a rule arm writing a
// rendered template or a plugin tool's captured result — reaches `upsertGlobalVariable`, so its key and value
// checks run here, once, for all of them. A NUL is refused because the driver returns text cut at its first NUL,
// so a stored NUL would read back as a different string.

import type { GlobalVariableView } from "@orb/contracts/automation";
import { containsNul, GLOBAL_VARIABLE_KEY_MAX_CHARS, GLOBAL_VARIABLE_VALUE_MAX_BYTES, globalVariableKeySchema } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import { globalVariables } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { and, asc, eq } from "drizzle-orm";
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

// The plane's caps and its NUL refusal, checked before any statement runs so a refusal is typed and writes nothing.
function assertStorableGlobalVariable(key: string, value: string): void {
  if (!globalVariableKeySchema.safeParse(key).success) {
    if (key.length === 0) {
      throw new GlobalVariableInvalidError("global variable key must be non-empty");
    }
    if (key.length > GLOBAL_VARIABLE_KEY_MAX_CHARS) {
      throw new GlobalVariableInvalidError(`global variable key length ${key.length} exceeds the ${GLOBAL_VARIABLE_KEY_MAX_CHARS}-char cap`);
    }
    if (containsNul(key)) {
      throw new GlobalVariableInvalidError("global variable key must not contain a NUL character");
    }
    throw new GlobalVariableInvalidError("global variable key is invalid");
  }
  if (containsNul(value)) {
    throw new GlobalVariableInvalidError("global variable value must not contain a NUL character");
  }
  const valueBytes = Buffer.byteLength(value, "utf8");
  if (valueBytes > GLOBAL_VARIABLE_VALUE_MAX_BYTES) {
    throw new GlobalVariableInvalidError(`global variable value ${valueBytes} bytes exceeds the ${GLOBAL_VARIABLE_VALUE_MAX_BYTES}-byte cap`);
  }
}

/** Upsert an owner-scoped global (last-write-wins on the (owner_id, key) natural key).
 *  @throws {@link GlobalVariableInvalidError} for an empty, over-long or NUL-bearing key, or an over-cap or
 *  NUL-bearing value, before any write. */
export async function upsertGlobalVariable(db: Db, row: { ownerId: UserId; key: string; value: string; updatedAt: number }): Promise<void> {
  assertStorableGlobalVariable(row.key, row.value);
  await db
    .insert(globalVariables)
    .values(row)
    .onConflictDoUpdate({ target: [globalVariables.ownerId, globalVariables.key], set: { value: row.value, updatedAt: row.updatedAt } });
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
