// `@orb/contracts/roster-preset` — the wire shapes for saved party presets (D61; saved-rosters-design
// §3). Cross-boundary (server↔client) view types: what `RosterPresetService.get/list/applyToChat`
// return. Domain-internal params (create/update/apply inputs) live in `domain/roster-preset/contract/`
// per the §7.4 homes rule; this namespace is the client-consumed surface only.
//
// A preset is a library artifact (name + curated cast + optional room config), never a runtime roster —
// these views describe the STORED template, not chat state.

import { groupConfigSchema } from "@orb/contracts/chat";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

const rosterPresetIdSchema = typeIdSchema(ID_PREFIX.rosterPreset);
const characterIdSchema = typeIdSchema(ID_PREFIX.character);
const personaIdSchema = typeIdSchema(ID_PREFIX.persona);

/** One member of a preset's cast, projected in `position` order. The per-member knobs are applied via
 *  chat's participant-control verbs at apply time (NULL talkativeness = leave chat's default). */
export const rosterPresetMemberViewSchema = z.object({
  characterId: characterIdSchema,
  position: z.number().int().nonnegative(),
  talkativeness: z.number().nullable(),
  disabled: z.boolean(),
});
export type RosterPresetMemberView = z.infer<typeof rosterPresetMemberViewSchema>;

/** The full preset (row + ordered members) — `RosterPresetService.get`. `groupConfig` is the stored
 *  room-behavior payload parsed through chat's own `groupConfigSchema` (NULL = cast only). */
export const rosterPresetViewSchema = z.object({
  id: rosterPresetIdSchema,
  name: z.string().min(1),
  description: z.string(),
  anchorPersonaId: personaIdSchema.nullable(),
  groupConfig: groupConfigSchema.nullable(),
  members: z.array(rosterPresetMemberViewSchema),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type RosterPresetView = z.infer<typeof rosterPresetViewSchema>;

/** The owner-scoped, name-sorted list row — name + member-avatar stack + count (the picker payload). */
export const rosterPresetSummarySchema = z.object({
  id: rosterPresetIdSchema,
  name: z.string().min(1),
  description: z.string(),
  memberCount: z.number().int().nonnegative(),
  // The cast's character ids in position order — the client builds the avatar stack from these.
  memberCharacterIds: z.array(characterIdSchema),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type RosterPresetSummary = z.infer<typeof rosterPresetSummarySchema>;

/** `RosterPresetService.applyToChat` outcome — additive merge, never destructive; skipped/missing
 *  members (character deleted since save) are reported, never an abort. */
export const applyRosterPresetResultSchema = z.object({
  added: z.array(characterIdSchema),
  alreadyPresent: z.array(characterIdSchema),
  configApplied: z.boolean(),
});
export type ApplyRosterPresetResult = z.infer<typeof applyRosterPresetResultSchema>;
