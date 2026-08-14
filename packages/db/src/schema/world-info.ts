// schema/world-info — the books/entries store + the four scope junctions (producer: domain/world-info).
// World info is BOOKS-ONLY: a `world_books` row is a container of keyword-triggered `world_entries`; a book
// attaches at one of FOUR scopes (global / character / chat / persona) via a per-scope junction, and the
// per-turn pool (a chat-assembly concern, NOT this domain) unions all four. Tier spec: `core/Tier-1-DB.md`.
//
// THE LOAD-BEARING DECISIONS encoded here:
//   • D23 — `world_books.ownerId` is KEPT (books are top-level single-owned / `fetchOwned`). `world_entries`
//     has NO `ownerId` — an entry's owner is reached by ONE FK to its book (`worldBookId` → owned book), so
//     the stamp would be a redundant mirror; ownership derives via the book (the `loadOwnedEntry`
//     inArray-over-owned-books guard is the only cross-tenant gate).
//   • D28 — there are NO character versions: `character_books` keys on `characters.id` (live identity), NOT
//     the retired `cv_id`/`CharacterVersionId`. The brand IS `CharacterId`. A "freeze lore at a snapshot"
//     feature, if ever wanted, would be a separate junction to `character_snapshots` — never a version pin.
//   • D32 — the per-entry depth-injection directive (`inject {depth, role}`) is the SHARED placement
//     primitive (`@orb/kit/injection`); its role is the canonical `MessageRole` axis. World-info does NOT
//     own it — it rides INSIDE the entry's `metadata` blob (see below).
//
// PER-ENTRY BEHAVIOR LIVES IN JSON, NOT IN COLUMNS. `scopeMode` (always-vs-keyword, ENTRY_SCOPE_MODES),
// `position` (system-half bucket, ENTRY_POSITIONS) and `inject` ({depth, role}) are NOT db columns — they
// are fields of the typed `world_entries.metadata` JSON blob (`EntryMetadata` from `@orb/contracts/world-info`,
// which composes the `@orb/kit/world-info` + `@orb/kit/injection` tuples DOWN). The kit resolvers
// (`resolveEntryScope`/`resolveEntryInjection`/`resolveEntryPosition`) read them at context-build time; the
// blob is read at the `@orb/db/kit` parse-seam, never trusted raw. The ONLY enum COLUMN in this slice is the
// per-character-attachment `role` (WORLD_BOOK_ROLES) on `character_books` (a book itself has NO role).
//
// Timestamps are plain `integer("x_at")` epoch-MS NUMBERS, born at insert via `(unixepoch() * 1000)`.
// Composite-PK junctions use `primaryKey({ columns })`; every FK CASCADEs (delete a book → its entries +
// all four junction rows vanish; delete the scope target → that target's junction rows vanish).

import type { EntryMetadata } from "@orb/contracts/world-info";
import { WORLD_BOOK_ROLES } from "@orb/contracts/world-info";
import type { CharacterId, ChatId, PersonaId, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
// biome-ignore lint/suspicious/noDeprecatedImports: drizzle @deprecates the positional primaryKey(col) overload; we use the supported primaryKey({ columns }) object form below.
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { checkList } from "#kit";
import { characters } from "./character.ts";
import { chats } from "./chat.ts";
import { personas } from "./persona.ts";
import { users } from "./users.ts";

// `primary` = the card-bound book (travels on export/import; at-most-one per character, enforced at the verb
// layer); `auxiliary` = a per-installation extra. The non-special default.
const DEFAULT_BOOK_ROLE = "auxiliary";

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// world_books — the top-level book container. Single-owned: `ownerId` is KEPT (D23 — the book references its
// owner directly; no owning parent to derive through). A book has NO `role` column — role is a
// per-character-attachment property that rides on `character_books` (BookAttachmentView).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const worldBooks = sqliteTable(
  "world_books",
  {
    // TypeID PK (`world_book_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
    id: text("id").$type<WorldBookId>().primaryKey(),
    // KEEP `ownerId` (D23). User hard-delete cascades the owner's books (→ entries + junctions).
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // NOTE: a book carries NO `role` — role is a per-character-ATTACHMENT property (`character_books.role`,
    // BookAttachmentView), "only meaningful on the character scope" (contracts/world-info). One book can be
    // primary for char A and auxiliary for char B, so role cannot live on the book.
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    // The EDITED stamp (the regex_scripts X-16 precedent — "any user-edited-in-place entity a list pane
    // sorts/discriminates gets `updated_at`, maintained by write verbs"). Restamped by every update verb
    // from the injected clock (never a DB trigger).
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // Owner-scoped list (`fetchOwned`).
    index("world_books_owner_idx").on(t.ownerId),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// world_entries — a single keyword-triggered lore entry inside a book. NO `ownerId` (D23 — owned via the
// book; ownership derives through `worldBookId`). Per-entry behavior (`scopeMode`/`position`/`inject`) is NOT
// columns — it lives in the typed `metadata` JSON blob. `keys` is a NULLABLE list (absent ⇒ null, distinct
// from an empty trigger set). `worldBookId` CASCADEs on book delete.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const worldEntries = sqliteTable(
  "world_entries",
  {
    // TypeID PK (`world_entry_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
    id: text("id").$type<WorldEntryId>().primaryKey(),
    // The owning book. CASCADE: deleting a book removes its entries (entries have no independent existence).
    worldBookId: text("world_book_id")
      .$type<WorldBookId>()
      .notNull()
      .references(() => worldBooks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    // Author-facing memo (= ST's `comment`); rendered in the entry list, NEVER injected. Nullable.
    description: text("description"),
    // What the model sees when the entry fires.
    content: text("content").notNull(),
    // Keyword triggers for `scope: keyword` entries. NULLABLE list (absent ⇒ null, NOT `[]`) — the
    // parseStringArrayColumn asymmetry; mirrors `EntryView.keys: string[] | null`.
    keys: text("keys", { mode: "json" }).$type<string[]>(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    priority: integer("priority").notNull().default(0),
    // Opt-out of the per-turn WI token budget — must-have lore that should never be silently dropped.
    ignoreBudget: integer("ignore_budget", { mode: "boolean" }).notNull().default(false),
    // The typed per-entry blob (`EntryMetadata`): { scopeMode?, position?, inject? {depth, role?} } + any
    // preserved unknown ST keys. NOT columns — read at the `@orb/db/kit` seam / the `@orb/kit/world-info`
    // resolvers, never trusted raw.
    metadata: text("metadata", { mode: "json" }).$type<EntryMetadata>(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    // The EDITED stamp (the regex_scripts X-16 precedent — see `worldBooks.updatedAt`'s comment).
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // Entry-by-book hot path + the `worldBookId` FK cascade child (delete book → its entries).
    index("world_entries_book_idx").on(t.worldBookId),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// The four scope junctions — a book is attached at exactly one scope per junction row; the per-turn pool
// unions all four. Every FK CASCADEs both ways (delete the book OR the scope target → the junction row is
// gone). Owner derives via the book (and, for chat/character/persona, via the target). No junction carries
// an `ownerId` (D23 — derive through the book/target).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

// chat_books — book attached to a chat (the chat-scoped pool slice; emits WiBusEvent at the verb layer).
export const chatBooks = sqliteTable(
  "chat_books",
  {
    chatId: text("chat_id")
      .$type<ChatId>()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    worldBookId: text("world_book_id")
      .$type<WorldBookId>()
      .notNull()
      .references(() => worldBooks.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    primaryKey({ columns: [t.chatId, t.worldBookId] }),
    // The `worldBookId` FK cascade child (the composite PK leads with chatId).
    index("chat_books_book_idx").on(t.worldBookId),
  ],
);

// character_books — book attached to a character. D28: keys on `characters.id` (live identity — there is NO
// `cv_id`/`CharacterVersionId`). Carries the per-attachment `role` (WORLD_BOOK_ROLES): at-most-one `primary`
// per character is enforced atomically at the verb layer (db.batch demote+upsert), not by a schema constraint.
export const characterBooks = sqliteTable(
  "character_books",
  {
    characterId: text("character_id")
      .$type<CharacterId>()
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    worldBookId: text("world_book_id")
      .$type<WorldBookId>()
      .notNull()
      .references(() => worldBooks.id, { onDelete: "cascade" }),
    // primary | auxiliary — derives WORLD_BOOK_ROLES. The per-character attachment role (see header).
    role: text("role", { enum: WORLD_BOOK_ROLES }).notNull().default(DEFAULT_BOOK_ROLE),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.worldBookId] }),
    check("character_books_role_check", sql.raw(`role in (${checkList(WORLD_BOOK_ROLES)})`)),
    // The `worldBookId` FK cascade child (the composite PK leads with characterId).
    index("character_books_book_idx").on(t.worldBookId),
  ],
);

// global_books — book attached at the deployment-global scope (fires for every chat). One row per book; the
// PK IS the book id (a book is either global or not — no second key).
export const globalBooks = sqliteTable(
  "global_books",
  {
    worldBookId: text("world_book_id")
      .$type<WorldBookId>()
      .primaryKey()
      .references(() => worldBooks.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  // No secondary index: unlike the other three junctions (where the book id is the NON-leading PK column),
  // here `worldBookId` IS the single-column PK — already indexed; a `*_book_idx` would just duplicate it.
);

// persona_books — book attached to a persona (pool's persona-book slice; `{{user}}` resolves against the
// speaking participant's active persona — a pool.ts source-tagging detail, not a schema concern).
export const personaBooks = sqliteTable(
  "persona_books",
  {
    personaId: text("persona_id")
      .$type<PersonaId>()
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    worldBookId: text("world_book_id")
      .$type<WorldBookId>()
      .notNull()
      .references(() => worldBooks.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    primaryKey({ columns: [t.personaId, t.worldBookId] }),
    // The `worldBookId` FK cascade child (the composite PK leads with personaId).
    index("persona_books_book_idx").on(t.worldBookId),
  ],
);
