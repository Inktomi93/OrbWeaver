// @orb/contracts/roster-preset — the saved-roster wire (D61 B6;
// D170). A roster preset is an owner's NAMED ROSTER — a library
// artifact consumed at chat start (and additively via `applyToChat`), never read at turn time. The member
// vocabulary is NOT minted here: every membership-template lifetime PROJECTS through chat's D80
// `characterMemberSpecSchema` (contracts/chat/roster.ts — "nothing mints a flat characterId array beside
// it"), so this module only composes it into the preset's own create/update shapes and view types.
//
// `groupConfig` is chat's own `GroupConfigInput` (the providerRouting foreign-schema precedent): the wire
// validates through `groupConfigSchema` (garbage refused at the boundary), the stored blob is what that
// parse yields, and chat's `setGroupConfig` RE-parses at apply — so a stored blob that predates a
// GroupConfig evolution degrades loudly at apply, never silently at assemble. NULL = the preset carries
// its roster only and never touches a room's config.
//
// `game` (D264) is rpg's own `RpgGameTemplate`, the shape chat's `startAsGame` takes: a roster that carries one starts
// its room as a game, born in the same atomic creation batch. It is a START-time template only: an apply to
// an existing room never creates a game. NULL = the roster starts a plain chat.

import type { CharacterId, PersonaId, RosterPresetId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import type { RulePresetId, RulePresetKnobValues } from "#automation";
import { RULE_PRESET_IDS, rulePresetIdSchema, rulePresetKnobValuesSchema } from "#automation";
import type { GroupConfigInput } from "#chat";
import { characterMemberSpecSchema, groupConfigSchema } from "#chat";
import type { RpgGameTemplate } from "#rpg";
import { rpgGameTemplateSchema } from "#rpg";

/** Sanity rail on a roster's size (the program doc's "lean: 25 — matches nothing structural"). */
export const ROSTER_PRESET_MEMBER_MAX = 25;
const NAME_MAX = 200;
const DESCRIPTION_MAX = 2000;

/** One saved seat on the wire — chat's D80 character-member spec, verbatim (kind + characterId +
 *  position + the optional seat knobs). The preset write verb normalizes `position` (sort, re-stamp
 *  dense 0..n-1), so wire positions only need to ORDER, not to be contiguous. */
export const rosterPresetMemberSchema = characterMemberSpecSchema;
/** One authored seat in a roster-preset write. */
export type RosterPresetMember = z.output<typeof rosterPresetMemberSchema>;

/** The full member list: 1..MAX seats, one seat per character (the junction PK made wire-visible —
 *  a duplicate characterId would silently collapse into one row on insert otherwise). */
export const rosterPresetMembersSchema = z
  .array(rosterPresetMemberSchema)
  .min(1)
  .max(ROSTER_PRESET_MEMBER_MAX)
  .refine((members) => new Set(members.map((m) => m.characterId)).size === members.length, {
    message: "a roster lists each character once",
  });
/** The normalized, duplicate-free member list accepted by a roster-preset write. */
export type RosterPresetMembers = z.output<typeof rosterPresetMembersSchema>;

/** One captured automation rule preset on the wire (B10's rules rider — build record §6): the CLOSED
 *  catalogue id + the knob bag as the capture read it (`RuleView.rulePresetKnobs` — the room rule's own
 *  mint provenance). Shape-only here; the write verb fully re-resolves the bag against the preset's own
 *  descriptors through automation's injected belt and stores the resolved OUTPUT (the `groupConfig`
 *  posture: garbage refuses at the boundary, a stale bag degrades loudly at apply). */
export const rosterPresetRuleSchema = z.object({
  rulePresetId: rulePresetIdSchema,
  knobs: rulePresetKnobValuesSchema.default({}),
});
/** One captured automation rule in a roster-preset write. */
export type RosterPresetRule = z.output<typeof rosterPresetRuleSchema>;

/** The captured rule-preset list. Array order IS capture/apply order (re-stamped dense at the write
 *  verb — the members posture, minus the explicit position field the D80 member vocabulary carries);
 *  one instance per rule preset (the junction PK made wire-visible), bounded by the catalogue itself. */
export const rosterPresetRulesSchema = z
  .array(rosterPresetRuleSchema)
  .max(RULE_PRESET_IDS.length)
  .refine((rules) => new Set(rules.map((r) => r.rulePresetId)).size === rules.length, {
    message: "a roster lists each rule preset once",
  });
/** The normalized, duplicate-free captured-rule list. */
export type RosterPresetRules = z.output<typeof rosterPresetRulesSchema>;

/** `create` — the authored artifact: a name + the curated roster, plus the optional chat-open POV anchor
 *  and the optional room-behavior blob. `update` deliberately reuses this WHOLE shape (full replace,
 *  member list included) — a preset is small enough that patch semantics would only buy drift. */
export const createRosterPresetSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX),
  description: z.string().max(DESCRIPTION_MAX).default(""),
  /** Chat-open `{{user}}` POV to apply at start (`StartChatParams.anchorPersonaId`). Nullable — a
   *  deleted persona degrades the preset (SET NULL), never blocks it. */
  anchorPersonaId: typeIdSchema(ID_PREFIX.persona).nullable().optional(),
  groupConfig: groupConfigSchema.nullable().optional(),
  /** The game a start births with the room. Full-replace like every field, so an editor rename echoes it. */
  game: rpgGameTemplateSchema.nullable().optional(),
  members: rosterPresetMembersSchema,
  /** B10's rules rider — the room's captured ENABLED rule presets. Defaulted `[]` (a roster without
   *  rules never touches a room's rules at apply); full-replace like every other field, so the
   *  library editor's rename ECHOES the stored list back verbatim. */
  rules: rosterPresetRulesSchema.default([]),
});
/** The post-parse create payload, including schema defaults and branded ids. */
export type CreateRosterPreset = z.output<typeof createRosterPresetSchema>;
/** The LENIENT input (`z.input` — pre-default, pre-brand): what a caller hands the verb. The ROUTER
 *  parses the wire through {@link createRosterPresetSchema} (strict TypeIDs, caps); the VERB re-parses
 *  only the `groupConfig` sub-blob (the one field whose garbage would otherwise be STORED and detonate
 *  later at apply) and validates every id against the db through its ownership belts — a fabricated or
 *  foreign id is a leak-free NotFound either way, so the verb needs no second TypeID re-parse. */
export type CreateRosterPresetInput = z.input<typeof createRosterPresetSchema>;

/** One resolved seat of a preset (`get`) — the stored junction row + the live card's display floor
 *  (name + avatar, the ParticipantView resolution posture: joined server-side, never re-derived by the
 *  client). A deleted character CASCADEs its seat out, so every returned member resolves. */
export interface RosterPresetMemberView {
  readonly characterId: CharacterId;
  readonly position: number;
  /** NULL = inherit the chat default (TALKATIVENESS_DEFAULT) at apply. */
  readonly talkativeness: number | null;
  readonly disabled: boolean;
  readonly name: string;
  readonly avatarHash: string | null;
}

/** One stored roster rule (`get`/`list`) — the captured rule preset + its resolved knob bag, in stored
 *  position order (the array carries the order; no explicit field). `rulePresetId` is projected
 *  verbatim: an id a later catalogue removal orphaned still displays (degraded, by the client's own
 *  catalogue join) and reports as skipped at apply. */
export interface RosterPresetRuleView {
  readonly rulePresetId: RulePresetId;
  readonly knobs: RulePresetKnobValues;
}

/** The full preset (`get`/`create`/`update` result) — the row + ordered members + captured rules. */
export interface RosterPresetView {
  readonly id: RosterPresetId;
  readonly name: string;
  readonly description: string;
  readonly anchorPersonaId: PersonaId | null;
  /** The stored room-behavior blob (lenient input — chat re-parses at apply). NULL = roster only. */
  readonly groupConfig: GroupConfigInput | null;
  /** The game a start births with the room. NULL = the roster starts a plain chat. */
  readonly game: RpgGameTemplate | null;
  readonly members: readonly RosterPresetMemberView[];
  /** B10's rules rider — capture order (= apply order). Empty = the roster carries no rules. */
  readonly rules: readonly RosterPresetRuleView[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** One row of the owner's library (`list`) — name-sorted; `members` is the position-ordered preview
 *  the picker renders as an avatar stack (a roster caps at {@link ROSTER_PRESET_MEMBER_MAX}, so the
 *  "preview" is simply all of them). */
export interface RosterPresetSummary {
  readonly id: RosterPresetId;
  readonly name: string;
  readonly description: string;
  /** The seated characters. A member is a human (the vocabulary map), so a roster counts characters. */
  readonly characterCount: number;
  readonly members: readonly RosterPresetMemberView[];
  readonly anchorPersonaId: PersonaId | null;
  readonly hasGroupConfig: boolean;
  /** The game a start births with the room — the start door hands it to `startChat` as `startAsGame`. */
  readonly game: RpgGameTemplate | null;
  /** B10's rules rider — the picker's "N rules" badge reads the length; a roster row caps at the
   *  catalogue size, so the "preview" is simply all of them (the members posture). */
  readonly rules: readonly RosterPresetRuleView[];
  readonly updatedAt: number;
}

/** `applyToChat`'s outcome — additive + idempotent: `added` minted fresh seats, `alreadyPresent` seats
 *  the room already held (knobs re-stamped either way), `configApplied` whether the preset carried a
 *  `groupConfig` that landed. `skipped` is the PRE-DRIVE re-verify arm only: members whose character no
 *  longer resolves under the owner when the apply re-checks (the FK CASCADE makes this a
 *  delete-between-read-and-verify race, not a steady state) are dropped from the drive and reported
 *  here. A failure INSIDE the drive (an injected chat verb throwing — e.g. the sub-verify deletion
 *  window, or the room dying mid-apply) SURFACES and aborts the loop; it is NOT collected into
 *  `skipped`. That is safe by construction: the apply is additive and every landed seat is idempotent,
 *  so a retry converges (already-landed members classify `alreadyPresent`). */
/** One roster rule the apply could not land — the EXPECTED per-preset refusal class (build record §6.4):
 *  automation's own mint validation said no (the lore presets' book-attachment consent gate in a room
 *  without the book, a knob a catalogue evolution retired, a preset no longer offered). `reason` is
 *  automation's own host-vocabulary message, surfaced verbatim. */
export interface RosterPresetRuleSkip {
  readonly rulePresetId: RulePresetId;
  readonly reason: string;
}

export interface ApplyRosterPresetResult {
  readonly added: readonly CharacterId[];
  readonly alreadyPresent: readonly CharacterId[];
  readonly skipped: readonly CharacterId[];
  readonly configApplied: boolean;
  /** B10's rules rider — rule presets minted fresh into the room (INCLUDING a re-mint that replaced a
   *  knob-drifted or incomplete earlier mint), then enabled: the apply is the host's consent act for
   *  the target room (build record §6.5). */
  readonly rulesMinted: readonly RulePresetId[];
  /** Rule presets the room already held complete with knob-equal provenance — nothing re-minted;
   *  enablement re-asserted (the member knob re-stamp posture). */
  readonly rulesAlreadyPresent: readonly RulePresetId[];
  /** The collected per-preset refusals ({@link RosterPresetRuleSkip}); a NON-refusal failure (a dying
   *  room) still surfaces and aborts — the member-drive posture, and a retry converges. */
  readonly rulesSkipped: readonly RosterPresetRuleSkip[];
}
