// domain/character/persistence/migrate-seeded-backgrounds — the `kind:"seeded"` retirement's CARD half
// (owner ask 2026-09-18). The `domain/settings` `migrate-seeded-background-picks` sibling, over
// `characters.background_override` instead of `user_settings.config`.
//
// WHY IT READS RAW: `themeBackgroundSchema` heals an unknown kind to `none` at every parse, so a parsed read
// of a card carrying the retired kind reports "no background" and the slug is already gone. The predicate and
// the slug come off the JSON column with `json_extract`; the WRITE stores the whole canonicalized source, so
// the persisted shape is exactly what `canonicalBackgroundSource` produces on every other write path.
//
// GC: the rewritten value is `kind:"asset"` at `characters.background_override`, which is one of the two
// carried-background JSON live-sources `selectCarriedBackgroundReferencedAssetIds` roots
// (`domain/assets/persistence/asset-refs.ts`) — so a migrated plate is pinned from the moment it lands,
// exactly like a hand-picked card background. A `seeded` value rooted nothing, which is the whole reason the
// retirement is safe: there is no reference being dropped here, only one being created.

import type { ThemeBackground } from "@orb/contracts/theme";
import { canonicalBackgroundSource } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { characters } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, eq, sql } from "drizzle-orm";

/** The empty source every non-resolving slug lands on — the schema's own "no image", spelled through the
 *  canonicalizer so a future field addition cannot be forgotten here. */
const NO_BACKGROUND: ThemeBackground = canonicalBackgroundSource({
  kind: "none",
  externalUrl: "",
  provenanceUrl: "",
  assetId: "",
  assetHash: "",
  mime: "",
});

/**
 * Re-point every `characters.background_override` this owner holds that still carries the retired
 * `kind:"seeded"`. `resolve` answers with the owner's now-owned plate asset, or `null` for a slug this pack
 * no longer ships (the four deleted landscape placeholders) — which lands `none`, the same thing the parse
 * seam would have degraded to, but stored rather than re-derived on every read.
 *
 * Idempotent by its own predicate: a rewritten row no longer matches. Returns the rows rewritten.
 */
export async function migrateSeededCardBackgrounds(
  db: Db,
  ownerId: UserId,
  resolve: (slug: string) => Promise<ThemeBackground | null>,
  at: number,
): Promise<number> {
  const kind = sql<string | null>`json_extract(${characters.backgroundOverride}, '$.kind')`;
  const slug = sql<string | null>`json_extract(${characters.backgroundOverride}, '$.seededId')`;
  const rows = await db
    .select({ id: characters.id, slug })
    .from(characters)
    .where(and(eq(characters.ownerId, ownerId), eq(kind, "seeded")));

  let rewritten = 0;
  for (const row of rows) {
    // @orb-waive no-await-db-in-loop(where): one UPDATE per AFFECTED card, and each carries a DIFFERENT
    // resolved source (its own plate), so the rewrite cannot collapse into one statement. Bounded by the
    // cards one owner carries a retired background on, once.
    const plate = row.slug === null || row.slug.length === 0 ? null : await resolve(row.slug);
    await writeCardBackground(db, row.id, plate ?? NO_BACKGROUND, at);
    rewritten++;
  }
  return rewritten;
}

async function writeCardBackground(db: Db, characterId: CharacterId, background: ThemeBackground, at: number): Promise<void> {
  await db
    .update(characters)
    .set({ backgroundOverride: canonicalBackgroundSource(background), updatedAt: at })
    .where(eq(characters.id, characterId));
}
