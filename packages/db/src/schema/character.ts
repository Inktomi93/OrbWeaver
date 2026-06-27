// schema/character — the FLAT live card + an opaque history log (producer: domain/character). Ledger D28:
// `character_versions` is GONE — there is NO version table, NO `currentVersionId`/circular FK, NO `version`
// counter, NO `raw`/`proposedTags`. The card IS the live `characters` row (identity + ALL card content in
// one place, edited in place); history is a standalone `character_snapshots` log that NOTHING FKs (browse +
// restore-in-place only, the git working-tree + commit-log split). `ownerId` is KEPT (D23 — characters are
// single-owned / `fetchOwned`).
//
// Card content rides FLAT on the row (D28): the typed promotions `regexScripts` (RegexScript[], the typed
// column — no `raw` leak), `depthPrompt` (the shared `{depth, role?}` directive + note), `extensions`
// (residual vendor keys), and `refinery` (derived pipeline signals) are JSON columns read through the
// `@orb/db/kit` parse-seam. `greetings`/`regexScripts` are ALWAYS-A-LIST columns (default `[]`, never null —
// the parseStringArray asymmetry). `importHash` (sha-256 of the whole imported file, re-import dedup) is
// DISTINCT from `contentHash` (the semantic-fields hash); both live on the flat row.

import type { CardDepthPrompt, CharacterCard, RefinerySignals } from "@orb/contracts/character";
import type { RegexScript } from "@orb/contracts/regex";
import type { AssetId, CharacterId, CharacterSnapshotId, PersonaId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
// biome-ignore lint/suspicious/noDeprecatedImports: drizzle @deprecates the positional primaryKey(col) overload; we use the supported primaryKey({ columns }) object form below.
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { assets } from "./assets";
import { personas } from "./persona";
import { users } from "./users";

export const characters = sqliteTable("characters", {
  // ── Identity (D28 flat row) ──────────────────────────────────────────────
  // TypeID PK (`character_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
  id: text("id").$type<CharacterId>().primaryKey(),
  // plain-id: the character handle is a free-form label (incl. the synthetic `__group__<chatId>`
  // namespace), NOT a branded entity id — so it carries no `.$type<…Id>()`.
  handle: text("handle").notNull(),
  // KEEP `ownerId` (D23). User hard-delete cascades the owner's characters.
  ownerId: text("owner_id")
    .$type<UserId>()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  starred: integer("starred", { mode: "boolean" }).notNull().default(false),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  // The `synthetic=true` hidden per-room group-memory identity (filtered from every user-facing query).
  synthetic: integer("synthetic", { mode: "boolean" }).notNull().default(false),
  // Tri-state: null = inherit the deployment default, true = forbid, false = allow.
  forbidExternalMedia: integer("forbid_external_media", { mode: "boolean" }),
  importedFrom: text("imported_from"),
  // sha-256 of the whole imported file (re-import dedup) — DISTINCT from `contentHash`. Null when authored.
  importHash: text("import_hash"),
  // The semantic-fields hash (always present — computed at create/edit).
  contentHash: text("content_hash").notNull(),
  // ── Card content (FLAT on the row — D28; mirrors @orb/contracts/character `characterCardSchema`) ──
  name: text("name").notNull(),
  description: text("description"),
  personality: text("personality"),
  scenario: text("scenario"),
  // ALWAYS a list (greetings[0] = first message, rest = alternates); default `[]`, never null.
  greetings: text("greetings", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  exampleMessages: text("example_messages"),
  systemPrompt: text("system_prompt"),
  postHistoryInstructions: text("post_history_instructions"),
  // Character's Note @ Depth — the shared `{depth, role?}` directive + note text, or null.
  depthPrompt: text("depth_prompt", { mode: "json" }).$type<CardDepthPrompt>(),
  creatorNotes: text("creator_notes"),
  creator: text("creator"),
  // Card author's freeform version STRING (e.g. "1.2") — NEVER an int counter (D28).
  cardVersion: text("card_version"),
  // Typed promotion (D28): the card's regex scripts. ALWAYS a list; default `[]`, never null.
  regexScripts: text("regex_scripts", { mode: "json" })
    .$type<RegexScript[]>()
    .notNull()
    .default(sql`'[]'`),
  // Residual `data.extensions` MINUS the promoted-to-column fields — genuinely-unknown vendor extras only.
  extensions: text("extensions", { mode: "json" }).$type<Record<string, unknown>>(),
  // Nullable avatar pointer. An asset delete nulls the pointer (SET NULL) — must NOT delete the character.
  avatarAssetId: text("avatar_asset_id")
    .$type<AssetId>()
    .references(() => assets.id, { onDelete: "set null" }),
  // CardRefinery pipeline signals (derived, not user-authored).
  refinery: text("refinery", { mode: "json" }).$type<RefinerySignals>(),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

// character_snapshots — the git-commit-style history log (D28). Append-only; ONE opaque JSON blob per
// snapshot (the full card snapshot — NOT a parallel set of typed columns). Restore copies a blob → the
// live `characters` row in-place. INVARIANT: NOTHING FKs character_snapshots — it is opaque history, not a
// content home, so it can never pin, block, or alter card resolution. Do NOT add an inbound FK from any
// other table to this one.
export const characterSnapshots = sqliteTable("character_snapshots", {
  // TypeID PK (`character_snapshot_…`); brand is type-only, SQL is plain TEXT.
  id: text("id").$type<CharacterSnapshotId>().primaryKey(),
  characterId: text("character_id")
    .$type<CharacterId>()
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" }),
  // The full card snapshot as ONE opaque JSON blob.
  content: text("content", { mode: "json" }).$type<CharacterCard>().notNull(),
  label: text("label"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

// character_personas — the M:N character↔persona junction, identity-keyed on `characters.id` (D28 — there
// is no cv to key on; personas survive every card edit). Composite PK; both FKs CASCADE (delete either side
// → the junction row is gone). Stays in character.ts (the association owner) even though `personas` is its
// own producer-named file.
export const characterPersonas = sqliteTable(
  "character_personas",
  {
    characterId: text("character_id")
      .$type<CharacterId>()
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    personaId: text("persona_id")
      .$type<PersonaId>()
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [primaryKey({ columns: [table.characterId, table.personaId] })],
);
