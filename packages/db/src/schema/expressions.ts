// schema/expressions — per-character labelled sprite bindings (producer: domain/expressions, D49 #4;
// specced in expressions-design/01 §4). ONE table born into the `0000_baseline` (pre-launch squash
// rule): character_sprites. A binding maps (characterId, label) → an `assets` CAS row (the sprite
// image bytes live in assets/infra-storage, never here).
//
// THE LOAD-BEARING DECISIONS (expressions-design/01 §4):
//   • Composite PK (characterId, label) IS the upsert key — "replace the joy sprite" is the same write
//     as "add the joy sprite".
//   • BOTH FKs CASCADE: a character delete wipes its bindings; an asset hard-delete cannot strand a
//     dangling binding row.
//   • NO ownerId (D23): the owner derives via `characters.ownerId` — one FK to an owned entity.
//   • `label` is normalized (trim → NFKC → lowercase → `^[a-z0-9_-]{1,32}$`) BEFORE write; persistence
//     re-asserts via the `expressionLabelSchema` zod parse (`@orb/contracts/expressions`).
//   • `character_sprites.assetId` is a NEW asset-bearing FK — it MUST be registered in the assets
//     avatar-ref registry or `collectGarbage` sweeps every sprite blob as unreferenced (the silent-GC
//     seam; E2 registry obligation, expressions-design/01 §4 L183–189).

import type { AssetId, CharacterId } from "@orb/kit/ids";
import {
  integer,
  // biome-ignore lint/suspicious/noDeprecatedImports: drizzle @deprecates the positional primaryKey(col) overload; we use the supported primaryKey({ columns }) object form below.
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { assets } from "./assets";
import { characters } from "./character";

export const characterSprites = sqliteTable(
  "character_sprites",
  {
    characterId: text("character_id")
      .$type<CharacterId>()
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    // Normalized (§5) before write — persistence re-asserts via zod parse.
    label: text("label").notNull(),
    assetId: text("asset_id")
      .$type<AssetId>()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    // Management-UI sort + sheet-job forensics; stamped from the injected clock (test-determinism law).
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.label] })],
);
