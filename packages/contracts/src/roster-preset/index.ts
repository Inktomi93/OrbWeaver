// @orb/contracts/roster-preset — the saved-party wire (D61 B6; build record:
// docs/design/saved-rosters-build-record.md). A roster preset is an owner's NAMED CAST — a library
// artifact consumed at chat start (and additively via `applyToChat`), never read at turn time. The member
// vocabulary is NOT minted here: every membership-template lifetime PROJECTS through chat's D80
// `characterMemberSpecSchema` (contracts/chat/roster.ts — "nothing mints a flat characterId array beside
// it"), so this module only composes it into the preset's own create/update shapes and view types.
//
// `groupConfig` is chat's own `GroupConfigInput` (the providerRouting foreign-schema precedent): the wire
// validates through `groupConfigSchema` (garbage refused at the boundary), the stored blob is what that
// parse yields, and chat's `setGroupConfig` RE-parses at apply — so a stored blob that predates a
// GroupConfig evolution degrades loudly at apply, never silently at assemble. NULL = the preset carries
// cast only and never touches a room's config.

import type { CharacterId, PersonaId, RosterPresetId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import type { GroupConfigInput } from "#chat";
import { characterMemberSpecSchema, groupConfigSchema } from "#chat";

/** Sanity rail on a party's size (the program doc's "lean: 25 — matches nothing structural"). */
export const ROSTER_PRESET_MEMBER_MAX = 25;
const NAME_MAX = 200;
const DESCRIPTION_MAX = 2000;

/** One saved seat on the wire — chat's D80 character-member spec, verbatim (kind + characterId +
 *  position + the optional seat knobs). The preset write verb normalizes `position` (sort, re-stamp
 *  dense 0..n-1), so wire positions only need to ORDER, not to be contiguous. */
export const rosterPresetMemberSchema = characterMemberSpecSchema;

/** The full member list: 1..MAX seats, one seat per character (the junction PK made wire-visible —
 *  a duplicate characterId would silently collapse into one row on insert otherwise). */
export const rosterPresetMembersSchema = z
  .array(rosterPresetMemberSchema)
  .min(1)
  .max(ROSTER_PRESET_MEMBER_MAX)
  .refine((members) => new Set(members.map((m) => m.characterId)).size === members.length, {
    message: "a party lists each character once",
  });

/** `create` — the authored artifact: a name + the curated cast, plus the optional chat-open POV anchor
 *  and the optional room-behavior blob. `update` deliberately reuses this WHOLE shape (full replace,
 *  member list included) — a preset is small enough that patch semantics would only buy drift. */
export const createRosterPresetSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX),
  description: z.string().max(DESCRIPTION_MAX).default(""),
  /** Chat-open `{{user}}` POV to apply at start (`StartChatParams.anchorPersonaId`). Nullable — a
   *  deleted persona degrades the preset (SET NULL), never blocks it. */
  anchorPersonaId: typeIdSchema(ID_PREFIX.persona).nullable().optional(),
  groupConfig: groupConfigSchema.nullable().optional(),
  members: rosterPresetMembersSchema,
});
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

/** The full preset (`get`/`create`/`update` result) — the row + ordered members. */
export interface RosterPresetView {
  readonly id: RosterPresetId;
  readonly name: string;
  readonly description: string;
  readonly anchorPersonaId: PersonaId | null;
  /** The stored room-behavior blob (lenient input — chat re-parses at apply). NULL = cast only. */
  readonly groupConfig: GroupConfigInput | null;
  readonly members: readonly RosterPresetMemberView[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** One row of the owner's library (`list`) — name-sorted; `members` is the position-ordered preview
 *  the picker renders as an avatar stack (a party caps at {@link ROSTER_PRESET_MEMBER_MAX}, so the
 *  "preview" is simply all of them). */
export interface RosterPresetSummary {
  readonly id: RosterPresetId;
  readonly name: string;
  readonly description: string;
  readonly memberCount: number;
  readonly members: readonly RosterPresetMemberView[];
  readonly anchorPersonaId: PersonaId | null;
  readonly hasGroupConfig: boolean;
  readonly updatedAt: number;
}

/** `applyToChat`'s outcome — additive + idempotent, never an abort: `added` minted fresh seats,
 *  `alreadyPresent` seats the room already held (knobs re-stamped either way), `skipped` members whose
 *  character vanished mid-apply (the FK CASCADE makes this a race arm, not a steady state — reported,
 *  never thrown), `configApplied` whether the preset carried a `groupConfig` that landed. */
export interface ApplyRosterPresetResult {
  readonly added: readonly CharacterId[];
  readonly alreadyPresent: readonly CharacterId[];
  readonly skipped: readonly CharacterId[];
  readonly configApplied: boolean;
}
