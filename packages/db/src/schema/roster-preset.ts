// schema/roster-preset — saved party presets (producer: domain/roster-preset, D61; specced in
// saved-rosters-design §2). Two tables born WHOLE into the `0000_baseline` (pre-launch squash rule):
// roster_presets · roster_preset_members. A preset is a library artifact — a named, reusable cast you
// drop into a new chat — NOT a group, membership record, or second roster (the chat's chat_participants
// stays the ONE runtime roster; a preset is a stamp that DRIVES the existing verbs, never read at turn
// time).
//
// THE LOAD-BEARING DECISIONS encoded here (saved-rosters-design §1–2):
//   • roster_presets is a TRUE PRODUCER (D23) — the row IS the user's authored artifact with no owned
//     anchor (its cast is a LIST via the junction, so no single FK reaches the owner). It STAMPS
//     `ownerId` (OwnedTable/fetchOwned class), CASCADE on user delete.
//   • roster_preset_members DERIVES its authority through the required `presetId` FK — NO `ownerId`
//     column (stamping one would mint the guardable-mismatch state D23 exists to kill). Real FKs to
//     characters (CASCADE — a deleted character drops out of every preset, never marinara's rotting
//     JSON id-array).
//   • UNIQUE(ownerId, name): a preset is picked by name in the new-chat flow — duplicate names are a UX
//     trap; rename-on-conflict is cheap.
//   • groupConfig is a NULLABLE BLOB, not columns: it is exactly chat's `GroupConfigInput`
//     (`@orb/contracts/chat`), parsed by `groupConfigSchema` at every read/write seam — re-columning a
//     sibling domain's fully-zod-defaulted config would be a second home for that shape. NULL = the
//     preset carries cast only; chat's DEFAULT_GROUP_CONFIG applies.
//   • anchorPersonaId SET NULL: a deleted persona degrades the preset (loses its {{user}} POV), never
//     blocks it.

import type { GroupConfigInput } from "@orb/contracts/chat";
import type { CharacterId, PersonaId, RosterPresetId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  // biome-ignore lint/suspicious/noDeprecatedImports: drizzle @deprecates the positional primaryKey(col) overload; we use the supported primaryKey({ columns }) object form below.
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { characters } from "./character";
import { personas } from "./persona";
import { users } from "./users";

export const rosterPresets = sqliteTable(
  "roster_presets",
  {
    // TypeID PK (`roster_preset_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
    id: text("id").$type<RosterPresetId>().primaryKey(),
    // §1: true producer — STAMPED ownerId; CASCADE so the preset dies with the owner.
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    // Chat-open {{user}} POV to apply at start (StartChatParams.anchorPersonaId). Nullable; a deleted
    // persona degrades the preset, never blocks it.
    anchorPersonaId: text("anchor_persona_id")
      .$type<PersonaId>()
      .references(() => personas.id, { onDelete: "set null" }),
    // OPTIONAL room-behavior payload: a GroupConfigInput blob (parsed by zod at write AND at apply — the
    // stored blob is lenient input, chat's setGroupConfig owns defaulting). NULL = cast only.
    groupConfig: text("group_config", { mode: "json" }).$type<GroupConfigInput>(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex("roster_presets_owner_name_unique").on(t.ownerId, t.name)],
);

export const rosterPresetMembers = sqliteTable(
  "roster_preset_members",
  {
    presetId: text("preset_id")
      .$type<RosterPresetId>()
      .notNull()
      .references(() => rosterPresets.id, { onDelete: "cascade" }),
    // Real FK — never marinara's JSON id-array; CASCADE drops a deleted character from every preset.
    characterId: text("character_id")
      .$type<CharacterId>()
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    // Founding-cast order (greet order, HUD order).
    position: integer("position").notNull(),
    // Per-member knob, applied via the EXISTING participant-control verbs at apply time. NULL = leave
    // chat's default (TALKATIVENESS_DEFAULT).
    talkativeness: real("talkativeness"),
    disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.presetId, t.characterId] }),
    index("roster_preset_members_character_idx").on(t.characterId),
  ],
);
