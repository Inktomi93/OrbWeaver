// schema/regex — the regex SCRIPT LIBRARY + its four scope junctions (producer: domain/regex). D121-E:
// the library is a first-class scoped store — a top-level owner-stamped entity plus per-type FK junctions
// (D23/D24), "the world-info pattern — one store, attached at scopes" (`Core-0-Architecture-and-Structure.md`
// §6, which says verbatim that regex reuses it). The three embed-by-value carriers it replaces
// (`UserSettings.regex.scripts`, `PromptConfig.regexScripts`, `characters.regex_scripts`) are GONE,
// NO-LEGACY, on the same regenerated baseline. Tier spec: `core/Tier-1-DB.md`.
//
// THE LOAD-BEARING DECISIONS encoded here:
//   • D23 — `regex_scripts.ownerId` is KEPT: a script is the user's authored artifact with no owning parent
//     to derive through (the `world_books` twin). No junction carries an `ownerId` — a junction row's scope
//     derives through the script (and, for the character/preset/chat scopes, through the target).
//   • D24 — attachment is per-TYPE FK junctions, never a `(type, untyped_id)` polymorphic store. This is
//     also what satisfies D53's surviving "never polymorphic" clause.
//   • BEHAVIOR LIVES IN JSON, NOT IN COLUMNS (the `world_entries.metadata` precedent). `findRegex`/
//     `replaceString`/`placement`/the four ST flags/`substituteRegex` are fields of the typed `behavior`
//     blob (`RegexScriptBehavior` from `@orb/contracts/regex`), read at the `@orb/db/kit` parse seam and
//     never trusted raw. Only `name` and `enabled` are promoted — they are the LIST-panel hot fields
//     (sort/filter/toggle) and the ones a picker reads without parsing a blob. The shape is still shedding
//     ST fields, so a body change stays schema-bump-free.
//   • ORDER IS DATA. `executeRegexScripts` applies its input list IN ORDER, so each junction carries a
//     `position` within its scope; the tier order (global → preset → cast → chat) is the resolver's
//     (`domain/chat/substrate/regex-tier`), and a script attached at two scopes runs once, earliest tier.
//
// Timestamps are plain `integer("x_at")` epoch-MS NUMBERS, born at insert via `(unixepoch() * 1000)`.
// Composite-PK junctions use `primaryKey({ columns })`; every FK CASCADEs (delete a script → all four
// junction rows vanish; delete the scope target → that target's junction rows vanish).

import type { RegexScriptBehavior } from "@orb/contracts/regex";
import type { CharacterId, ChatId, PresetId, RegexScriptId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
// biome-ignore lint/suspicious/noDeprecatedImports: drizzle @deprecates the positional primaryKey(col) overload; we use the supported primaryKey({ columns }) object form below.
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { characters } from "./character.ts";
import { chats } from "./chat.ts";
import { presets } from "./preset.ts";
import { users } from "./users.ts";

/** Junction sort key — attachments render and EXECUTE in ascending `position` within their scope. */
const DEFAULT_POSITION = 0;

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// regex_scripts — the top-level library row. Single-owned: `ownerId` is KEPT (D23 — the script references
// its owner directly; no owning parent to derive through).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const regexScripts = sqliteTable(
  "regex_scripts",
  {
    // TypeID PK (`regex_script_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
    id: text("id").$type<RegexScriptId>().primaryKey(),
    // KEEP `ownerId` (D23). User hard-delete cascades the owner's scripts (→ every junction row).
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Promoted so a list/picker toggles without parsing the blob; the executor reads it as the first gate.
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    // The typed behavior blob (see header). NOT NULL — a script with no behavior is not a script.
    behavior: text("behavior", { mode: "json" }).$type<RegexScriptBehavior>().notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // Owner-scoped list (`fetchOwned`).
    index("regex_scripts_owner_idx").on(t.ownerId),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// The four scope junctions. A script is attached at a scope by ONE row per (target, script); the host-tier
// resolver unions global → preset → cast → chat and dedupes by script id (earliest tier wins). Every FK
// CASCADEs both ways. No junction carries an `ownerId` (D23 — derive through the script/target).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

// global_regex_scripts — "applies to every chat you host" (the `global_books` twin). One row per script;
// the PK IS the script id (a script is either global or not — no second key). Carries `position` because
// the global tier is itself an ORDERED list the executor walks.
export const globalRegexScripts = sqliteTable(
  "global_regex_scripts",
  {
    regexScriptId: text("regex_script_id")
      .$type<RegexScriptId>()
      .primaryKey()
      .references(() => regexScripts.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(DEFAULT_POSITION),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  // No secondary index: `regexScriptId` IS the single-column PK — already indexed; a `*_script_idx` would
  // just duplicate it (the `global_books` note).
);

// character_regex_scripts — script attached to a character (D28: keys on `characters.id`, live identity —
// there is no version table). This is the junction the card LIFT writes and the card RE-EMBED walks.
export const characterRegexScripts = sqliteTable(
  "character_regex_scripts",
  {
    characterId: text("character_id")
      .$type<CharacterId>()
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    regexScriptId: text("regex_script_id")
      .$type<RegexScriptId>()
      .notNull()
      .references(() => regexScripts.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(DEFAULT_POSITION),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.regexScriptId] }),
    // The `regexScriptId` FK cascade child (the composite PK leads with characterId).
    index("character_regex_scripts_script_idx").on(t.regexScriptId),
  ],
);

// preset_regex_scripts — script attached to a preset. Replaces `PromptConfig.regexScripts`: the preset's
// set is now a REFERENCE list, so the same authored script can serve several presets (the cross-carrier
// picking the embedded shape made impossible).
export const presetRegexScripts = sqliteTable(
  "preset_regex_scripts",
  {
    presetId: text("preset_id")
      .$type<PresetId>()
      .notNull()
      .references(() => presets.id, { onDelete: "cascade" }),
    regexScriptId: text("regex_script_id")
      .$type<RegexScriptId>()
      .notNull()
      .references(() => regexScripts.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(DEFAULT_POSITION),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [primaryKey({ columns: [t.presetId, t.regexScriptId] }), index("preset_regex_scripts_script_idx").on(t.regexScriptId)],
);

// chat_regex_scripts — script attached to a room (the `chat_books` twin, D121-E fork O-1 arm b: "this
// room's transcript quirk"). Chats are OWNERLESS (D18), so authority is the membership chain: the host
// attaches/detaches, every member's turns assemble against it.
export const chatRegexScripts = sqliteTable(
  "chat_regex_scripts",
  {
    chatId: text("chat_id")
      .$type<ChatId>()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    regexScriptId: text("regex_script_id")
      .$type<RegexScriptId>()
      .notNull()
      .references(() => regexScripts.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(DEFAULT_POSITION),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [primaryKey({ columns: [t.chatId, t.regexScriptId] }), index("chat_regex_scripts_script_idx").on(t.regexScriptId)],
);
