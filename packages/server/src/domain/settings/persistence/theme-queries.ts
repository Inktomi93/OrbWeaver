// All db access for the `themes` table. Reads resolve the two-armed "owned ∪ seed" union (`ownerId = caller
// OR ownerId IS NULL`); all mutations scope on `ownerId = caller`, so a seed row can never match — seeds are
// un-mutable by construction. Timestamps arrive as params.

import type { Db } from "@orb/db";
import { fetchOwned, isConstraintViolation, themes } from "@orb/db";
import type { ThemeId, UserId } from "@orb/kit/ids";
import { and, asc, eq, isNull, or } from "drizzle-orm";

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
export async function readableTheme(
  db: Db,
  ownerId: UserId,
  id: ThemeId,
): Promise<ThemeRow | undefined> {
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
  return await db
    .select()
    .from(themes)
    .where(eq(themes.ownerId, ownerId))
    .orderBy(asc(themes.createdAt));
}

/** Load an owned theme row (never a seed). */
export function loadOwnedTheme(
  db: Db,
  id: ThemeId,
  ownerId: UserId,
): Promise<ThemeRow | undefined> {
  return fetchOwned(db, themes, id, ownerId);
}

/** The caller's own theme NAMES (for the duplicate-verb's free-name-suffix computation). */
export async function listOwnedThemeNames(db: Db, ownerId: UserId): Promise<string[]> {
  const rows = await db
    .select({ name: themes.name })
    .from(themes)
    .where(eq(themes.ownerId, ownerId));
  return rows.map((r) => r.name);
}

/** Insert a new theme row (owned write or a boot seed with `ownerId: null`). A `(ownerId, name)` collision
 *  surfaces as a unique-constraint violation — the caller classifies it via `isConstraintViolation`. */
export async function insertTheme(db: Db, row: ThemeInsert): Promise<void> {
  await db.insert(themes).values(row);
}

/** Idempotent batch insert for the portable theme-backup import: skip any row whose `(ownerId, name)`
 *  already exists. Returns how many rows were newly inserted — a re-import of the same backup creates
 *  zero. */
export async function insertOwnedThemesIfAbsent(
  db: Db,
  values: readonly (typeof themes.$inferInsert)[],
): Promise<number> {
  if (values.length === 0) {
    return 0;
  }
  const inserted = await db
    .insert(themes)
    .values([...values])
    .onConflictDoNothing({ target: [themes.ownerId, themes.name] })
    .returning({ id: themes.id });
  return inserted.length;
}

/** Patch an owned row. Returns the updated row, or `undefined` when nothing matched. */
export async function updateOwnedTheme(
  db: Db,
  id: ThemeId,
  ownerId: UserId,
  patch: ThemePatch,
): Promise<ThemeRow | undefined> {
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

/** Overwrite (or first-insert) one seed row by its fixed sentinel id — the boot-reseed write. Idempotent in
 *  one round trip. */
export async function upsertSeedTheme(
  db: Db,
  row: Omit<ThemeInsert, "ownerId"> & { readonly ownerId: null },
): Promise<void> {
  await db
    .insert(themes)
    .values(row)
    .onConflictDoUpdate({
      target: themes.id,
      set: { name: row.name, override: row.override, css: row.css, updatedAt: row.updatedAt },
    });
}
