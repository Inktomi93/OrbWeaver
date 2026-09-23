// schema/roster-preset — saved rosters (producer: domain/roster-preset; D61 B6,
// D170). A roster preset is a LIBRARY artifact — a named roster the
// owner drops into rooms — never a membership record: `chat_participants` stays the ONE runtime roster,
// and a chat started from a preset carries NO back-reference (a preset is a stamp, not a live link).
//
// `roster_presets` is a TRUE PRODUCER (D23 KEEP — its character references are a LIST via the junction,
// so there is no single required FK to derive the owner through): `ownerId` is stamped, and
// `roster_preset_members` DERIVES through its required `presetId` FK (no ownerId column — stamping one
// would mint the guardable-mismatch state D23 exists to kill). Member rows are a REAL FK junction, never
// marinara's JSON id-array: a deleted character CASCADEs out of every roster instead of rotting into a
// dangling id, and per-seat knobs have a typed home.
//
// Deletion physics (the test surface, tests/server/domain/roster-preset/persistence): character delete →
// seat row gone, preset survives smaller; persona delete → anchor NULL; preset delete → members CASCADE,
// chats started from it untouched; owner delete → everything CASCADEs.

import type { RulePresetId, RulePresetKnobValues } from "@orb/contracts/automation";
import type { GroupConfigInput } from "@orb/contracts/chat";
import type { CharacterId, PersonaId, RosterPresetId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  // biome-ignore lint/suspicious/noDeprecatedImports: drizzle @deprecates the positional primaryKey(col) overload; we use primaryKey({ columns }).
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { characters } from "./character.ts";
import { personas } from "./persona.ts";
import { users } from "./users.ts";

export const rosterPresets = sqliteTable(
  "roster_presets",
  {
    // TypeID PK (`roster_preset_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
    id: text("id").$type<RosterPresetId>().primaryKey(),
    // KEEP `ownerId` (D23/D61 — true producer; ownerid-registry carries the row). User delete cascades.
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    // Chat-open {{user}} POV to apply at start (StartChatParams.anchorPersonaId). Nullable; a deleted
    // persona degrades the preset (SET NULL), never blocks it.
    anchorPersonaId: text("anchor_persona_id")
      .$type<PersonaId>()
      .references(() => personas.id, { onDelete: "set null" }),
    // OPTIONAL room-behavior payload — chat's GroupConfigInput, validated through `groupConfigSchema` at
    // the write verb and RE-parsed by chat's `setGroupConfig` at apply (a stale blob after a GroupConfig
    // evolution degrades loudly at apply, never silently). NULL = the preset carries its roster only.
    groupConfig: text("group_config", { mode: "json" }).$type<GroupConfigInput>(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // A preset is PICKED BY NAME in the new-chat flow — duplicate names are a UX trap, and the leading
    // ownerId doubles as the owner-scoped list index (`fk-columns-indexed`: the FK LEADS this composite).
    uniqueIndex("roster_presets_owner_name_unique").on(t.ownerId, t.name),
    // The anchor FK's SET-NULL parent scan (the `personas_avatar_asset_idx` shape): a persona delete
    // walks this table, and SQLite auto-indexes no child FK.
    index("roster_presets_anchor_persona_idx").on(t.anchorPersonaId),
  ],
);

export const rosterPresetMembers = sqliteTable(
  "roster_preset_members",
  {
    presetId: text("preset_id")
      .$type<RosterPresetId>()
      .notNull()
      .references(() => rosterPresets.id, { onDelete: "cascade" }),
    // Real FK — never marinara's JSON array. A character delete CASCADEs the seat out of every roster.
    characterId: text("character_id")
      .$type<CharacterId>()
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    // Founding-roster order (greet order, apply order) — dense 0..n-1, normalized at the write verb.
    position: integer("position").notNull(),
    // Per-seat knobs, applied via chat's EXISTING `setSeatKnobs` at apply time (D80 — one knob home).
    // NULL talkativeness = inherit the chat's default (TALKATIVENESS_DEFAULT).
    talkativeness: real("talkativeness"),
    disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    // One seat per character per roster; `presetId` LEADS, so the cascade + the members read are indexed.
    primaryKey({ columns: [t.presetId, t.characterId] }),
    // The character-delete cascade's parent scan (`fk-columns-indexed`: characterId sits SECOND in the
    // PK, which is unindexed for a predicate that knows only the characterId).
    index("roster_preset_members_character_idx").on(t.characterId),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// roster_preset_rules — B10's rules rider (build record §6): the roster's captured automation RULE PRESETS
// (catalogue id + the RESOLVED knob bag), re-minted through automation's own `createRuleFromPreset` at
// apply. `rule_preset_id` carries NO FK and NO CHECK — rule presets are a CODE catalogue
// (`RULE_PRESET_IDS`, @orb/contracts/automation), not rows, and the tuple grows by design; the id is
// wire-validated (closed z.enum) at write and re-checked against the live catalogue at apply (a stale id
// after a catalogue removal degrades to a reported skip, never a constraint violation). Owner scope
// DERIVES through the required `presetId` FK (D23 — the `roster_preset_members` posture; no ownerId).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const rosterPresetRules = sqliteTable(
  "roster_preset_rules",
  {
    presetId: text("preset_id")
      .$type<RosterPresetId>()
      .notNull()
      .references(() => rosterPresets.id, { onDelete: "cascade" }),
    // A member of the automation catalogue's closed id tuple (see the header for why no DDL pin).
    rulePresetId: text("rule_preset_id").$type<RulePresetId>().notNull(),
    // Capture order = apply order (dense 0..n-1, normalized at the write verb — the members posture).
    // Cross-preset mint order is SEMANTICS (one write-through CEL env per dispatch batch), so the apply
    // re-mints in this order deterministically.
    position: integer("position").notNull(),
    // The complete RESOLVED knob bag (`resolveChatRulePresetKnobs` output — validated at the write verb,
    // stored as OUTPUT: the `groupConfig` posture, re-validated by the mint at apply so a bag that
    // predates a catalogue evolution degrades loudly there, never silently).
    knobs: text("knobs", { mode: "json" }).$type<RulePresetKnobValues>().notNull(),
  },
  (t) => [
    // ONE instance of a rule preset per roster (the capture flattens a multi-mint room to its latest
    // mint's bag — build record §6.3); `presetId` LEADS, so the cascade + the rules read are indexed.
    primaryKey({ columns: [t.presetId, t.rulePresetId] }),
  ],
);
