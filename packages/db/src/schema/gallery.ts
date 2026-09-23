// schema/gallery — curated per-character media (gallery v2; D49 item 2; producer: domain/assets).
// The user↔image↔character CURATION layer over the `assets` byte index: `assets` stays the CAS metadata,
// `gallery_items` owns "this image is in my gallery, optionally as this character's". Distinct from imagery
// PROVENANCE (machine-written, one per generation) — curation is user-picked; conflating them would make
// "remove from gallery" delete provenance.
//
// NO `ownerId` column — ownership DERIVES via `asset_id → assets.ownerId` (Nate ruling 2026-07-01; D23
// derive-don't-stamp, the `character_tags`/`duplicate_pairs` precedent: a required FK to an owned row makes
// the owner always derivable, and stamping creates a guardable mismatch). `ON DELETE CASCADE` from assets:
// deleting the image erases its gallery rows; `subject_character_id SET NULL`: the item survives the
// character's deletion, un-charactered.

import type { AssetId, CharacterId, GalleryItemId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { assets } from "./assets.ts";
import { characters } from "./character.ts";

export const galleryItems = sqliteTable(
  "gallery_items",
  {
    // TypeID PK (`gallery_item_…`); brand is type-only, SQL is plain TEXT. App-minted, no DB default.
    id: text("id").$type<GalleryItemId>().primaryKey(),
    // The curated image. Owner derives through this FK (no stamped ownerId). Subordinate to the asset.
    assetId: text("asset_id")
      .$type<AssetId>()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    // Optional per-character association; SET NULL so the item survives the character's deletion.
    subjectCharacterId: text("subject_character_id")
      .$type<CharacterId>()
      .references(() => characters.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // One curation row per (asset, subject). SQLite treats NULL subjects as DISTINCT under a unique index,
    // so this index alone covers only the character-scoped half.
    uniqueIndex("gallery_items_asset_subject_unique").on(t.assetId, t.subjectCharacterId),
    // …and this PARTIAL unique index covers the other half (#1375): one un-charactered curation row per
    // asset. Without it, `addToGallery`'s conflict guard never fired for the ordinary "add to gallery, not
    // tied to a character" case and every repeat call inserted a duplicate — the verb's own docstring
    // ("a duplicate add returns the existing item (idempotent)") was false for the common path. The product
    // answer is that an asset appears ONCE in the unscoped gallery; the index is what makes that true, and
    // `insertGalleryItem` names it as its conflict target.
    uniqueIndex("gallery_items_asset_unsubjected_unique").on(t.assetId).where(sql`${t.subjectCharacterId} IS NULL`),
    index("gallery_items_character_idx").on(t.subjectCharacterId),
  ],
);
