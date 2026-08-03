// All db access for the `themes` table. Reads resolve the two-armed "owned ∪ seed" union (`ownerId = caller
// OR ownerId IS NULL`); all mutations scope on `ownerId = caller`, so a seed row can never match — seeds are
// un-mutable by construction. Timestamps arrive as params.
// ONE exception touches `user_settings`: `clearSelectedThemeIds`, the seed-retirement heal. It is keyed by
// THEME ids and exists only to keep a retired row from leaving a dangling pointer, so it homes with the
// retirement it serves rather than in the general settings-blob queries.

import type { Db } from "@orb/db";
import { themes, userSettings } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, isConstraintViolation } from "@orb/db/kit";
import type { ThemeId, UserId } from "@orb/kit/ids";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";

type ThemeRow = typeof themes.$inferSelect;

interface ThemeInsert {
  readonly id: ThemeId;
  readonly ownerId: UserId | null;
  readonly name: string;
  readonly override: ThemeRow["override"];
  readonly css: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

interface ThemePatch {
  readonly name?: string;
  readonly override?: ThemeRow["override"];
  readonly css?: string | null;
  readonly updatedAt: number;
}

/** The caller's own themes PLUS every seed palette (`ownerId IS NULL`), oldest-first (seeds sort first —
 *  they are always inserted at boot before any owned row exists). */
export async function listReadableThemes(db: Db, ownerId: UserId): Promise<ThemeRow[]> {
  return await db
    .select()
    .from(themes)
    .where(or(eq(themes.ownerId, ownerId), isNull(themes.ownerId)))
    .orderBy(asc(themes.createdAt));
}

/** One theme readable by this owner: their own row OR any seed. */
export async function readableTheme(db: Db, ownerId: UserId, id: ThemeId): Promise<ThemeRow | undefined> {
  const rows = await db
    .select()
    .from(themes)
    .where(and(eq(themes.id, id), or(eq(themes.ownerId, ownerId), isNull(themes.ownerId))))
    .limit(1);
  return rows.at(0);
}

/** The caller's owned theme rows only (never a seed), oldest-first. The portable theme-backup export reads
 *  this — seeds are code-authored and never travel. */
export async function listOwnedThemes(db: Db, ownerId: UserId): Promise<ThemeRow[]> {
  return await db.select().from(themes).where(eq(themes.ownerId, ownerId)).orderBy(asc(themes.createdAt));
}

/** The caller's own theme NAMES (for the duplicate-verb's free-name-suffix computation). */
export async function listOwnedThemeNames(db: Db, ownerId: UserId): Promise<string[]> {
  const rows = await db.select({ name: themes.name }).from(themes).where(eq(themes.ownerId, ownerId));
  return rows.map((r) => r.name);
}

/** Insert a new theme row (owned write or a boot seed with `ownerId: null`). A `(ownerId, name)` collision
 *  surfaces as a unique-constraint violation — the caller classifies it via `isConstraintViolation`. */
export async function insertTheme(db: Db, row: ThemeInsert): Promise<void> {
  await db.insert(themes).values(row);
}

/** Idempotent batch RESTORE for the portable theme-backup import (O-3: restore-wins). A `(ownerId, name)`
 *  that already exists is UPDATED in place — "restore my backup" means the backup's palette, not the one
 *  the user has been editing since; the row identity (and every reference to it) survives. Returns the
 *  newly-inserted count, so a re-import of the same backup still reports `created: 0`. */
export async function restoreOwnedThemes(db: Db, ownerId: UserId, values: readonly (typeof themes.$inferInsert)[]): Promise<number> {
  if (values.length === 0) {
    return 0;
  }
  const existing = await listOwnedThemeNames(db, ownerId);
  // Each carried theme's payload differs, so the restore is N statements — but ONE batch, not N awaits.
  const updates: BatchStmt[] = values
    .filter((row) => existing.includes(row.name))
    .map((row) =>
      db
        .update(themes)
        .set({ override: row.override, css: row.css, updatedAt: row.updatedAt })
        .where(and(eq(themes.ownerId, ownerId), eq(themes.name, row.name))),
    );
  if (updates.length > 0) {
    await db.batch(batchMany(updates));
  }
  const fresh = values.filter((row) => !existing.includes(row.name));
  if (fresh.length === 0) {
    return 0;
  }
  const inserted = await db
    .insert(themes)
    .values([...fresh])
    .onConflictDoNothing({ target: [themes.ownerId, themes.name] })
    .returning({ id: themes.id });
  return inserted.length;
}

/** Patch an owned row. Returns the updated row, or `undefined` when nothing matched. */
export async function updateOwnedTheme(db: Db, id: ThemeId, ownerId: UserId, patch: ThemePatch): Promise<ThemeRow | undefined> {
  const updated = await db
    .update(themes)
    .set(patch)
    .where(and(eq(themes.id, id), eq(themes.ownerId, ownerId)))
    .returning();
  return updated.at(0);
}

/** Delete an owned row. Returns `true` iff a row was actually removed. */
export async function deleteOwnedTheme(db: Db, id: ThemeId, ownerId: UserId): Promise<boolean> {
  const removed = await db
    .delete(themes)
    .where(and(eq(themes.id, id), eq(themes.ownerId, ownerId)))
    .returning({ id: themes.id });
  return removed.length > 0;
}

/** `true` iff `err` is the `(ownerId, name)` unique-constraint violation. */
export function isThemeNameConflict(err: unknown): boolean {
  return isConstraintViolation(err)?.kind === "unique";
}

/** Drop RETIRED seed rows by their fixed sentinel ids — the converge-seeder's delete arm (TD/O-9). Bounded
 *  to `ownerId IS NULL` twice over (the id list is sentinel-only AND the predicate is explicit), so a user's
 *  own row — including a duplicate they made of a retired palette — can never be caught by it. Returns how
 *  many rows this install actually had. */
export async function deleteSeedThemes(db: Db, ids: readonly ThemeId[]): Promise<number> {
  if (ids.length === 0) {
    return 0;
  }
  const removed = await db
    .delete(themes)
    .where(and(inArray(themes.id, [...ids]), isNull(themes.ownerId)))
    .returning({ id: themes.id });
  return removed.length;
}

/** ONLY-IF-SET heal: any user whose `theme.selectedThemeId` names one of `ids` falls back to `null` (the
 *  Hearth default). A JSON write, not a column write — `selectedThemeId` is a field inside the settings
 *  blob, so the WHERE is a `json_extract` probe (the `asset-refs` precedent) and the SET is a `json_set`.
 *  A blob that names nothing, or names something else, is not touched at all. Returns the healed count. */
export async function clearSelectedThemeIds(db: Db, ids: readonly ThemeId[], at: number): Promise<number> {
  if (ids.length === 0) {
    return 0;
  }
  const selected = sql`json_extract(${userSettings.config}, '$.theme.selectedThemeId')`;
  const healed = await db
    .update(userSettings)
    .set({ config: sql`json_set(${userSettings.config}, '$.theme.selectedThemeId', json('null'))`, updatedAt: at })
    .where(inArray(selected, [...ids]))
    .returning({ userId: userSettings.userId });
  return healed.length;
}

/** Overwrite (or first-insert) one seed row by its fixed sentinel id — the boot-reseed write. Idempotent in
 *  one round trip. The conflict target is the PK, so the DO UPDATE arm is bounded to `ownerId IS NULL`: the
 *  reseed can only ever overwrite a SEED row, and never a user's theme that somehow reached a sentinel id. */
export async function upsertSeedTheme(db: Db, row: Omit<ThemeInsert, "ownerId"> & { readonly ownerId: null }): Promise<void> {
  await db
    .insert(themes)
    .values(row)
    .onConflictDoUpdate({
      target: themes.id,
      setWhere: isNull(themes.ownerId),
      set: { name: row.name, override: row.override, css: row.css, updatedAt: row.updatedAt },
    });
}
