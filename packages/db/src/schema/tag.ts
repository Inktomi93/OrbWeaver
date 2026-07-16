// schema/tag — one user-scoped tag namespace + the five per-type FK junctions (producer: domain/tag).
// A tag is a named, colored, sortable label owned by exactly one user (`unique(ownerId, name)` — "one tag
// namespace, one owner"). Five entity types can be tagged; each has its OWN per-type
// FK junction (ledger D24: NO polymorphic `(type, untyped_id)` association table — only the registry-driven
// DISPATCH is polymorphic, and that lives in the domain, not here).
//
// THE LOAD-BEARING DECISIONS encoded here:
//   • D23 — the ownership-stamp rule. `tags.ownerId` is KEPT (a tag is top-level single-owned / `fetchOwned`;
//     its owner is the partition key, not a derivable mirror). The four target-derived junctions
//     (character_tags / world_book_tags / persona_tags / preset_tags) carry NO `ownerId` — the owner is
//     reached by ONE FK to the owned target (characters/world_books/personas/presets each KEEP ownerId).
//   • D30 — `chat_tags` is the ONE junction that keeps its own `ownerId`. Its target (`chats`) has no owner
//     (D18 — chats are membership-scoped), so the owner cannot be derived from the target. The junction is a
//     PER-USER OVERLAY: it carries the TAGGER's `ownerId`, and its composite PK is `(chatId, tagId, ownerId)`
//     so two members may apply the same tag to a shared chat independently (each row coexists; each sees only
//     their own). That composite PK IS the `unique(chatId, tagId, ownerId)` constraint.
//   • D28 / the two-surface redesign — `character_tags` grows a `status` enum (TAG_STATUSES pending|accepted),
//     replacing neo's `character_versions.proposedTags` JSON column (the table is gone under D28; the column
//     has no home and is NOT relocated). One surface: import / corpus distillation write `status:'pending'`
//     rows; the "Accept" action flips them to `'accepted'`; export reads the `accepted` rows.
//
// Enum columns DERIVE their one canonical tuple (never re-spelled): `tags.source` ← TAG_SOURCES,
// `tags.folderType` ← TAG_FOLDER_TYPES, `character_tags.status` ← TAG_STATUSES (all @orb/contracts/tag).
// Each gets a tuple-derived CHECK (a CHECK is DDL — a static raw fragment, no bound parameters) + a
// test-mirror over the column's `.enumValues`. Timestamps are plain `integer("x_at")` epoch-ms NUMBERS,
// born at insert via `(unixepoch() * 1000)`. Every junction FK CASCADEs (delete the tag OR the target → the
// junction row is gone).

import { TAG_FOLDER_TYPES, TAG_SOURCES, TAG_STATUSES } from "@orb/contracts/tag";
import type { CharacterId, ChatId, PersonaId, PresetId, TagId, UserId, WorldBookId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  // biome-ignore lint/suspicious/noDeprecatedImports: drizzle @deprecates the positional primaryKey(col) overload; we use primaryKey({ columns }).
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { characters } from "./character";
import { chats } from "./chat";
import { personas } from "./persona";
import { presets } from "./preset";
import { users } from "./users";
import { worldBooks } from "./world-info";

// A CHECK list is a static DDL fragment derived from the canonical tuple (NOT re-spelled): e.g.
// `source in ('manual', 'auto', 'card')`. A CHECK cannot carry bound parameters (chat.ts/world-info.ts pattern).
function checkList(values: readonly string[]): string {
  return values.map((v) => `'${v}'`).join(", ");
}

// `NONE` = a plain tag (the non-folder default). `OPEN`/`CLOSED` are ST's tags-as-folders states.
const DEFAULT_FOLDER_TYPE = "NONE";
// A freshly-attached character tag is a SUGGESTION awaiting the user's "Accept" (the proposedTags redesign).
const DEFAULT_TAG_STATUS = "pending";

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// tags — the per-owner label namespace. Single-owned: `ownerId` is KEPT (D23 — the tag references its owner
// directly; no owning parent to derive through), so a tag joins the `fetchOwned` category. `unique(ownerId,
// lower(name))` is the one-namespace-per-owner key — CASE-INSENSITIVE (the functional
// fold makes "Female"/"female" one tag). `color`/`color2`/`sortOrder` are NULLABLE
// (null = theme default / unordered name-fallback — mirrors TagView). `source` is a nullable provenance axis.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const tags = sqliteTable(
  "tags",
  {
    // TypeID PK (`tag_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
    id: text("id").$type<TagId>().primaryKey(),
    // KEEP `ownerId` (D23). User hard-delete cascades the owner's tags (→ all junction rows via the tag FK).
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Chip BACKGROUND color (ST tag.color). NULL = theme default.
    color: text("color"),
    // Chip TEXT color (ST tag.color2). NULL = theme default.
    color2: text("color2"),
    // manual | auto | card — derives TAG_SOURCES. NULLABLE (display-only provenance; null tolerated by the
    // CHECK since `NULL in (...)` is NULL, never FALSE).
    source: text("source", { enum: TAG_SOURCES }),
    // NONE | OPEN | CLOSED — derives TAG_FOLDER_TYPES. The tags-as-folders state; defaults to a plain tag.
    folderType: text("folder_type", { enum: TAG_FOLDER_TYPES }).notNull().default(DEFAULT_FOLDER_TYPE),
    // Manual ordering position; NULL = unordered (name fallback).
    sortOrder: integer("sort_order"),
    // ST is_hidden_on_character_card — chip suppressed on rows/cards while the tag keeps filtering.
    isHiddenOnCard: integer("is_hidden_on_card", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // One namespace per owner — the create-tag conflict target. CASE-INSENSITIVE: a
    // functional unique on `(ownerId, lower(name))`, so "Female" / "female" / "FEMALE" collapse to ONE tag
    // (the first casing is the stored display; dedupe is on the folded key). `domain/tag` normalizes the name
    // (trim + whitespace-collapse, casing kept) via `@orb/kit/tag`'s `normalizeTagName` before insert; THIS
    // index is the folded-uniqueness half — together they are the one chokepoint every tag source dedupes at.
    uniqueIndex("tags_owner_name_unique").on(t.ownerId, sql`lower(${t.name})`),
    check("tags_source_check", sql.raw(`source in (${checkList(TAG_SOURCES)})`)),
    check("tags_folder_type_check", sql.raw(`folder_type in (${checkList(TAG_FOLDER_TYPES)})`)),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// character_tags — character ↔ tag junction. Target-derived owner (D23: reach the owner via `characterId` →
// characters.ownerId — NO `ownerId` column). Composite PK `(characterId, tagId)`; both FKs CASCADE. Grows a
// `status` enum (TAG_STATUSES) — the single proposed/accepted surface that replaces neo's `proposedTags`.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const characterTags = sqliteTable(
  "character_tags",
  {
    characterId: text("character_id")
      .$type<CharacterId>()
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .$type<TagId>()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    // pending | accepted — derives TAG_STATUSES. A suggestion (import/corpus distillation) defaults to
    // `pending`; "Accept" flips it to `accepted`; export reads `accepted` rows.
    status: text("status", { enum: TAG_STATUSES }).notNull().default(DEFAULT_TAG_STATUS),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.tagId] }),
    check("character_tags_status_check", sql.raw(`status in (${checkList(TAG_STATUSES)})`)),
    // The `tagId` FK cascade child (delete tag → junction); the composite PK leads with characterId.
    index("character_tags_tag_idx").on(t.tagId),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// chat_tags — chat ↔ tag junction. THE ONE junction that keeps its own `ownerId` (D30). Its target (`chats`)
// has no owner (D18), so the owner cannot be derived from the target; instead the junction carries the
// TAGGER's `ownerId` and the composite PK is `(chatId, tagId, ownerId)` — a per-user overlay where two
// members applying the same tag to a shared chat produce two coexisting rows. That PK IS the
// `unique(chatId, tagId, ownerId)` constraint (a dup by the SAME tagger is rejected; a different tagger is a
// distinct row). All three FKs CASCADE (delete the chat, the tag, OR the tagger → that overlay row is gone).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const chatTags = sqliteTable(
  "chat_tags",
  {
    chatId: text("chat_id")
      .$type<ChatId>()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .$type<TagId>()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    // D30: the TAGGER (this junction's own owner, since `chats` carries none). CASCADE: a user hard-delete
    // removes their chat-tag overlay rows.
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  // The composite PK `(chatId, tagId, ownerId)` IS the D30 `unique(chatId, tagId, ownerId)` — per-tagger
  // uniqueness, cross-tagger coexistence. No separate unique index (it would duplicate the PK).
  (t) => [
    primaryKey({ columns: [t.chatId, t.tagId, t.ownerId] }),
    // The `tagId` FK cascade child (delete tag → junction); tagId is not the PK's leading column.
    index("chat_tags_tag_idx").on(t.tagId),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// world_book_tags · persona_tags · preset_tags — the three remaining target-derived junctions (D23: owner
// reached via the target's KEPT `ownerId` — NO `ownerId` column, NO status). Composite PK `(targetId, tagId)`;
// both FKs CASCADE (delete the target OR the tag → the junction row is gone).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const worldBookTags = sqliteTable(
  "world_book_tags",
  {
    worldBookId: text("world_book_id")
      .$type<WorldBookId>()
      .notNull()
      .references(() => worldBooks.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .$type<TagId>()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    primaryKey({ columns: [t.worldBookId, t.tagId] }),
    // The `tagId` FK cascade child (delete tag → junction); the composite PK leads with worldBookId.
    index("world_book_tags_tag_idx").on(t.tagId),
  ],
);

export const personaTags = sqliteTable(
  "persona_tags",
  {
    personaId: text("persona_id")
      .$type<PersonaId>()
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .$type<TagId>()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    primaryKey({ columns: [t.personaId, t.tagId] }),
    // The `tagId` FK cascade child (delete tag → junction); the composite PK leads with personaId.
    index("persona_tags_tag_idx").on(t.tagId),
  ],
);

export const presetTags = sqliteTable(
  "preset_tags",
  {
    presetId: text("preset_id")
      .$type<PresetId>()
      .notNull()
      .references(() => presets.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .$type<TagId>()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    primaryKey({ columns: [t.presetId, t.tagId] }),
    // The `tagId` FK cascade child (delete tag → junction); the composite PK leads with presetId.
    index("preset_tags_tag_idx").on(t.tagId),
  ],
);
