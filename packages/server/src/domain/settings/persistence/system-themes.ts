// System palette writes construct shipped ids/content here; only the boot seeder imports this capability.
// The injected timestamp is metadata, never an id, owner or content source.
import type { Db } from "@orb/db";
import { themes } from "@orb/db";
import { and, inArray, isNull } from "drizzle-orm";
import { RETIRED_SEED_THEME_IDS } from "../constants.ts";
import { SEED_THEMES } from "../substrate/seed-themes.ts";

/** Drop RETIRED seed rows by their fixed sentinel ids — the converge-seeder's delete arm (TD/O-9). Bounded
 *  to `ownerId IS NULL` twice over (the id list is sentinel-only AND the predicate is explicit), so a user's
 *  own row — including a duplicate they made of a retired palette — can never be caught by it. Returns how
 *  many rows this install actually had. */
export async function deleteSeedThemes(db: Db): Promise<number> {
  const removed = await db
    .delete(themes)
    .where(and(inArray(themes.id, [...RETIRED_SEED_THEME_IDS]), isNull(themes.ownerId)))
    .returning({ id: themes.id });
  return removed.length;
}

/** Converge the shipped palettes without accepting caller-controlled ids or content. */
export async function upsertSeedThemes(db: Db, at: number): Promise<void> {
  await Promise.all(
    SEED_THEMES.map(({ id, name, override }) =>
      db
        .insert(themes)
        .values({ id, ownerId: null, name, override, css: null, createdAt: at, updatedAt: at })
        .onConflictDoUpdate({
          target: themes.id,
          setWhere: isNull(themes.ownerId),
          set: { name, override, css: null, updatedAt: at },
        }),
    ),
  );
}
