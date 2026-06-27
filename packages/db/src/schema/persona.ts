// schema/persona — personas, the human side of the roster (producer: domain/persona). MOVED out of the
// neo `character.ts` to obey the producer-names-schema rule (persona rows are produced by the persona
// domain). Personas are single-owned: `ownerId` is KEPT (ledger D23 — the row references its owner
// directly, there is no owning-entity parent to derive through), so a persona joins the `fetchOwned`
// category exactly like characters/assets.
//
// `metadata` is the typed persona blob (`PersonaMetadata` from `@orb/contracts/persona`): the placement
// fields (`descriptionPosition` deriving `@orb/kit/persona`'s `PERSONA_DESCRIPTION_POSITIONS`, the at-depth
// `inject` directive) plus the non-lossy `createFromCharacter` provenance (`sourceCharacterId`/`swapMacros`).
// It is a JSON column read through the `@orb/db/kit` parse-seam (lenient `.catch`), never trusted raw.

import type { PersonaMetadata } from "@orb/contracts/persona";
import type { AssetId, PersonaId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { assets } from "./assets";
import { users } from "./users";

export const personas = sqliteTable("personas", {
  // TypeID PK (`persona_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
  id: text("id").$type<PersonaId>().primaryKey(),
  // KEEP `ownerId` (D23) — the persona's own partition key, not a derivable mirror. User delete cascades.
  ownerId: text("owner_id")
    .$type<UserId>()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  // Nullable avatar pointer. An asset delete nulls the pointer (SET NULL) — it must NOT delete the persona.
  avatarAssetId: text("avatar_asset_id")
    .$type<AssetId>()
    .references(() => assets.id, { onDelete: "set null" }),
  // Typed JSON blob (PersonaMetadata) — parsed at the read seam (@orb/db/kit), never trusted raw.
  metadata: text("metadata", { mode: "json" }).$type<PersonaMetadata>(),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
});
