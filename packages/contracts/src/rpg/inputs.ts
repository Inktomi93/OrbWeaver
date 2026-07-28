// @orb/contracts/rpg/inputs — the TRANSPORT WIRE input schemas for the `rpg.*` verb procs (W2). The rpg
// router is a thin pass-through (`ctx.services.rpg.<verb>({ principal: ctx.auth, ...input })`), so each proc
// needs a wire schema for the caller-supplied fields (chatId + the authored payload) MINUS the `principal`
// (the transport seam mints that from the resolved identity — never client input). These are the cross-
// boundary trust-boundary shapes, so they home HERE (not the domain-internal `contract/params.ts`, which
// carries `Principal` and is server-only) — the `chatInjectionInputSchema` precedent `chat.ts` extends.
//
// DERIVE, NEVER RE-SPELL (§5.5): every union/owned shape a sibling module already owns is REUSED —
// `rpgActorRefSchema` (the discriminated actor union), `rpgWidgetDefSchema` (+ `.partial()` for the patch),
// `rpgStatProfileSchema`, and the enum schemas. Only the plain payload envelopes (chatId + scalar fields the
// contract has no schema for, e.g. a checkpoint `label`, a dice `notation`) are spelled here. `chatId` +
// the branded ids ride `brandedId<T>()` (the `no-raw-id` seam; the OWNER/MEMBER gate inside each verb is the
// authority — a wire-valid-but-foreign id collapses to a leak-free NOT_FOUND, never a router-tier gate).

import type { ChatId, PresetId, RpgCheckpointId, RpgJournalId, RpgQuestId, RpgWidgetId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { rpgActorRefSchema } from "./actor";
import { RPG_EXTRACTION_MODES, RPG_HINT_MAX, RPG_STEERING_NOTE_MAX, rpgCastFieldSchema } from "./config";
import { rpgGameModeSchema, rpgJournalTypeSchema, rpgQuestStatusSchema } from "./enums";
import { rpgStatProfileSchema } from "./profile";
import { rpgWidgetDefSchema } from "./snapshot";

/** The shared chatId trust-boundary field — game-ness + authority BOTH resolve through it (no `ownerId`, D23). */
const chatIdField = brandedId<ChatId>();

/** `createGame` — host-gated birth. `mode` rides the mode enum (`"full"` is wire-valid; the verb throws the
 *  typed PHASE refusal). `profile` is the caller-picked packaged/imported statProfile (omit ⇒ freeform). */
export const rpgCreateGameInputSchema = z.object({
  chatId: chatIdField,
  mode: rpgGameModeSchema,
  profile: rpgStatProfileSchema.optional(),
});

/** `updateConfig` — the ONE config write door (host). `patch` carries the profile + steering note; `gmPresetId`
 *  is the preset-override knob (a `PresetId` sets it, explicit `null` clears, omit keeps); `extractionMode` is
 *  the delivery-model knob. `steeringNote` is length-capped at the contract's `RPG_STEERING_NOTE_MAX`. */
export const rpgUpdateConfigInputSchema = z.object({
  chatId: chatIdField,
  patch: z
    .object({
      statProfile: rpgStatProfileSchema.optional(),
      steeringNote: z.string().max(RPG_STEERING_NOTE_MAX).optional(),
      // The parity-plus feature knobs (§2.8/§2.1 M1) — the host defines the tracked cast-field schemas + the
      // per-custom-kind relationship hints. Omit keeps the current features; a passed array/record REPLACES it
      // (whole-list edit, the host owns the schema authoritatively).
      castFields: z.array(rpgCastFieldSchema).optional(),
      relationshipHints: z.record(z.string(), z.string().max(RPG_HINT_MAX)).optional(),
    })
    .optional(),
  gmPresetId: brandedId<PresetId>().nullable().optional(),
  extractionMode: z.enum(RPG_EXTRACTION_MODES).optional(),
});

/** `patchSheet` — write an actor's identity sheet (host any; a member their OWN `user` ref). MA-4 patch: every
 *  field optional, no defaults; `actorRef` rides the DERIVED discriminated union. Attribute VALUES ride the
 *  profile vocabulary + range INSIDE the verb (a wire int passes; the verb owns attribute legality). */
export const rpgPatchSheetInputSchema = z.object({
  chatId: chatIdField,
  actorRef: rpgActorRefSchema,
  patch: z.object({
    className: z.string().optional(),
    attributes: z.record(z.string(), z.number().int()).optional(),
    poolDefs: z.array(z.object({ name: z.string().min(1), max: z.number().int().min(1) })).optional(),
    maxHp: z.number().int().nullable().optional(),
    flavor: z.string().optional(),
    // `level` (§2.6) — hand-only; a member/host patch sets it (nullable: explicit null clears). It is NOT a
    // model-writable field (absent from the extraction schema + tool args) — patchSheet is its ONLY write door.
    level: z.number().int().min(0).nullable().optional(),
  }),
});

/** `editSnapshot` — the hand-edit door (host any; a member their own actor's volatile). `patch` is a partial
 *  snapshot-state overlay under the [merge-clear] contract — an OPAQUE object the domain validates/locks (the
 *  `editSnapshot` verb owns the per-path legality; a bad path is errors-as-data, never a wire reject). */
export const rpgEditSnapshotInputSchema = z.object({
  chatId: chatIdField,
  patch: z.record(z.string(), z.unknown()),
});

/** `createWidget` — add a HUD widget definition (host). `def` is the DERIVED `rpgWidgetDefSchema`. */
export const rpgCreateWidgetInputSchema = z.object({
  chatId: chatIdField,
  def: rpgWidgetDefSchema,
});

/** `updateWidget` — patch a HUD widget definition's mutable columns (host). `patch` DERIVES from the widget
 *  def (`.partial()` — every field optional), never a re-spell. */
export const rpgUpdateWidgetInputSchema = z.object({
  chatId: chatIdField,
  widgetId: brandedId<RpgWidgetId>(),
  patch: rpgWidgetDefSchema.partial(),
});

/** `deleteWidget` — remove a HUD widget definition (host). */
export const rpgDeleteWidgetInputSchema = z.object({
  chatId: chatIdField,
  widgetId: brandedId<RpgWidgetId>(),
});

/** `upsertQuest` — the hand arm of the quest plane (host). `questId` present ⇒ update, absent ⇒ create.
 *  `status` rides the DERIVED quest-status enum. `objectives` are the authoring shape (`id` optional — a new
 *  objective omits it, the verb mints; `completed` optional) — the snapshot-resident `rpgQuestObjectiveSchema`
 *  requires `id`, so this authoring variant carries the optional-id, never a re-spell of the resident union. */
export const rpgUpsertQuestInputSchema = z.object({
  chatId: chatIdField,
  questId: brandedId<RpgQuestId>().optional(),
  name: z.string().min(1),
  status: rpgQuestStatusSchema.optional(),
  description: z.string().optional(),
  objectives: z.array(z.object({ id: z.string().min(1).optional(), text: z.string().min(1), completed: z.boolean().optional() })).optional(),
});

/** `deleteQuest` — remove a quest from the current resolved snapshot's array (host). */
export const rpgDeleteQuestInputSchema = z.object({
  chatId: chatIdField,
  questId: brandedId<RpgQuestId>(),
});

/** `addJournalEntry` — a hand journal entry (host); `type` rides the DERIVED journal-type enum. */
export const rpgAddJournalEntryInputSchema = z.object({
  chatId: chatIdField,
  type: rpgJournalTypeSchema,
  title: z.string().min(1),
  content: z.string(),
});

/** `editJournalEntry` — patch an entry's mutable text (host; reaches model entries — the recovery path). */
export const rpgEditJournalEntryInputSchema = z.object({
  chatId: chatIdField,
  entryId: brandedId<RpgJournalId>(),
  patch: z.object({
    type: rpgJournalTypeSchema.optional(),
    title: z.string().min(1).optional(),
    content: z.string().optional(),
  }),
});

/** `deleteJournalEntry` — remove a journal entry (host). */
export const rpgDeleteJournalEntryInputSchema = z.object({
  chatId: chatIdField,
  entryId: brandedId<RpgJournalId>(),
});

/** `createCheckpoint` — label the current resolved snapshot (host). */
export const rpgCreateCheckpointInputSchema = z.object({
  chatId: chatIdField,
  label: z.string().min(1),
});

/** `restoreCheckpoint` — clone a checkpointed snapshot forward BORN COMMITTED onto a fresh narrator slot (host). */
export const rpgRestoreCheckpointInputSchema = z.object({
  chatId: chatIdField,
  checkpointId: brandedId<RpgCheckpointId>(),
});

/** `rollDice` — server CSPRNG, bake-once (member). `notation` is the dice string the server rolls authoritatively. */
export const rpgRollDiceInputSchema = z.object({
  chatId: chatIdField,
  notation: z.string().min(1),
});

/** A read scoped to a chat's game (member for getGame/getTrackerView; host for getConfigView; member for
 *  listCheckpoints). The chatId-only envelope — the verb's `getMembership` gate is the authority. */
export const rpgReadGameInputSchema = z.object({
  chatId: chatIdField,
});

/** `listJournal` — the paged lineage-projected archive (member). */
export const rpgListJournalInputSchema = z.object({
  chatId: chatIdField,
  limit: z.number().int().min(1).optional(),
  offset: z.number().int().min(0).optional(),
});
