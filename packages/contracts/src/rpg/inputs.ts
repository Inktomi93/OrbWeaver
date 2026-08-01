// @orb/contracts/rpg/inputs — the TRANSPORT WIRE input schemas for the `rpg.*` verb procs (W2). The rpg
// router is a thin pass-through (`ctx.services.rpg.<verb>({ principal: ctx.auth, ...input })`), so each proc
// needs a wire schema for the caller-supplied fields (chatId + the authored payload) MINUS the `principal`
// (the transport seam mints that from the resolved identity — never client input). These are the cross-
// boundary trust-boundary shapes, so they home HERE (not the domain-internal `contract/params.ts`, which
// carries `Principal` and is server-only) — the `chatInjectionInputSchema` precedent `chat.ts` extends.
//
// DERIVE, NEVER RE-SPELL (§5.5): every union/owned shape a sibling module already owns is REUSED —
// `rpgActorRefSchema` (the discriminated actor union), `rpgTrackerDefSchema` (the whole tracker set write),
// `rpgStatProfileSchema`, and the enum schemas. Only the plain payload envelopes (chatId + scalar fields the
// contract has no schema for, e.g. a checkpoint `label`, a dice `notation`) are spelled here. `chatId` +
// the branded ids ride `brandedId<T>()` (the `no-raw-id` seam; the OWNER/MEMBER gate inside each verb is the
// authority — a wire-valid-but-foreign id collapses to a leak-free NOT_FOUND, never a router-tier gate).

import type { ChatId, PresetId, RpgCheckpointId, RpgJournalId, RpgQuestId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { MAX_USER_MACROS, userMacroSchema } from "#preset";
import { rpgActorRefSchema } from "./actor";
import {
  RPG_DATE_MODES,
  RPG_EXTRACTION_CONTEXTS,
  RPG_EXTRACTION_MODES,
  RPG_EXTRACTION_WINDOW_TOKENS_MAX,
  RPG_EXTRACTION_WINDOW_TOKENS_MIN,
  RPG_RECONCILE_EVERY_BEATS_MAX,
  RPG_STEERING_NOTE_MAX,
} from "./config";
import { RPG_CYOA_CHOICE_BEHAVIORS, rpgGameModeSchema, rpgJournalTypeSchema, rpgQuestStatusSchema } from "./enums";
import { rpgStatProfileSchema } from "./profile";
import { RPG_HINT_MAX, rpgTrackerDefSchema } from "./tracker";

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
      // THE TRACKERS (the tracked-field unification) — the host's whole tracker set for this game, in ONE
      // write. Omit keeps the current list; a passed array REPLACES it (whole-list edit — the unified editor
      // owns the set authoritatively, exactly as the retired `castFields`/`pinnedOrbs` writes did). Every axis
      // (subject/shape/write/appliesTo/max/hint/color/icon/sort/pinned/locked) rides the DERIVED def schema.
      trackers: z.array(rpgTrackerDefSchema).optional(),
      // The per-custom-kind relationship hints (M1) + the R4c custom-journal-type hints. Omit keeps; a passed
      // record REPLACES it.
      relationshipHints: z.record(z.string(), z.string().max(RPG_HINT_MAX)).optional(),
      journalTypeHints: z.record(z.string(), z.string().max(RPG_HINT_MAX)).optional(),
      // P3 hidden-channel knobs (§3.3/§3.6) + the recent-beats cap (P3 fold). Omit keeps the current value; a
      // passed scalar REPLACES it. `deception`/`omniscience` gate the teaching block + the member reasoning-strip;
      // `hiddenContentReveal` (M4) governs the host's reveal eye; `recentBeatsKeepLast` bounds the reminder slice.
      deception: z.boolean().optional(),
      omniscience: z.boolean().optional(),
      hiddenContentReveal: z.boolean().optional(),
      recentBeatsKeepLast: z.number().int().min(0).optional(),
      // The P4 card knobs (parity-plus §9 #7 + M2/M3) — omit keeps; a passed value replaces.
      immersiveHtml: z.boolean().optional(),
      immersiveHtmlInteractive: z.boolean().optional(),
      cardKeepLastX: z.number().int().min(0).optional(),
      // The P5 play-style knobs (§5.4/§6.4) — CYOA standing mode + the choice-click behavior + the wand
      // Plot submenu gate. Omit keeps; a passed value replaces.
      cyoa: z.boolean().optional(),
      cyoaChoiceBehavior: z.enum(RPG_CYOA_CHOICE_BEHAVIORS).optional(),
      plotProgression: z.boolean().optional(),
      // The FRONT-DOOR toggle (#40): `false` disengages the game from the turn assembly + hides the
      // panel, state PRESERVED (reversible). The verb also re-writes the chat pointer mirror.
      engaged: z.boolean().optional(),
      // The #9 ambient-date mode — `narrated` (freeform date string, no day counter) | `structured`.
      dateMode: z.enum(RPG_DATE_MODES).optional(),
      // The §1.3 extraction-depth knobs — how much story the state round reads (`beat`/`window`/`full`), the
      // `window` arm's token budget, and the reconcile cadence. Bounds mirror the config schema. Omit keeps.
      extractionContext: z.enum(RPG_EXTRACTION_CONTEXTS).optional(),
      extractionWindowTokens: z.number().int().min(RPG_EXTRACTION_WINDOW_TOKENS_MIN).max(RPG_EXTRACTION_WINDOW_TOKENS_MAX).optional(),
      reconcileEveryBeats: z.number().int().min(0).max(RPG_RECONCILE_EVERY_BEATS_MAX).optional(),
      // WAVE MU (owner ruling #20's game half): the GAME's authored user macros — the whole set in ONE write
      // (whole-list replace, the `trackers` semantics). Omit keeps the current set. The turn registers these
      // BESIDE the preset's, the game winning a name clash (`shadowPresetUserMacros`).
      userMacros: z.array(userMacroSchema).max(MAX_USER_MACROS).optional(),
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
    // The per-actor TRACKER EXCEPTIONS (the unification's applicability model): tracker KEYS this actor is
    // granted beyond its carrier class, and keys revoked from it. Omit keeps; a passed array REPLACES it.
    // Tracker DEFS are not here — they home once in `config.trackers` (`updateConfig` is their door).
    trackerGrants: z.array(z.string().min(1)).optional(),
    trackerRevokes: z.array(z.string().min(1)).optional(),
    maxHp: z.number().int().nullable().optional(),
    flavor: z.string().optional(),
    // `level` (§2.6) — hand-only; a member/host patch sets it (nullable: explicit null clears). No TURN can
    // write it (absent from the extraction schema + tool args); the only other door is the host born-state
    // round (`populateFromCharacter`), which fills it once, from the card, while it is still null.
    level: z.number().int().min(0).nullable().optional(),
  }),
});

/** `populateFromCharacter` — the HOST born-state round over ONE character's card + the room's opening (owner
 *  ruling 2026-08-01). Chat-scoped + actor-scoped; the verb resolves the HOST floor (a member can never trigger
 *  the host-principal model call) and refuses an actor with no card. No corpus/window args: the round reads the
 *  card + the opening message, both server-resolved — a caller cannot feed it prose. */
export const rpgPopulateFromCharacterInputSchema = z.object({
  chatId: chatIdField,
  actorRef: rpgActorRefSchema,
});

/** `editSnapshot` — the hand-edit door (host any; a member their own actor's volatile). `patch` is a partial
 *  snapshot-state overlay under the [merge-clear] contract — an OPAQUE object the domain validates/locks (the
 *  `editSnapshot` verb owns the per-path legality; a bad path is errors-as-data, never a wire reject).
 *  `releaseLocks` (§12.3 lock-release) are dotted lock paths to CLEAR from `fieldLocks` — the host's Release
 *  affordance ("let the model write this again"). Clearing rides the SAME verb (not a null on the lock path):
 *  a lock is snapshot-metadata, not a state leaf, so it clears via the `applyHandEdit` lock-DELTA, not a
 *  [merge-clear] null. Omit/`[]` = no release. A release may accompany an empty `patch` (release-only).
 *  `lockPaths` (#10 per-field pin) names the FINE dotted paths this edit stamps (the client knows exactly
 *  which value it edited — `actorState.user:<id>.pools.<name>`); omit ⇒ the coarse top-level-key default. */
export const rpgEditSnapshotInputSchema = z.object({
  chatId: chatIdField,
  patch: z.record(z.string(), z.unknown()),
  releaseLocks: z.array(z.string().min(1)).optional(),
  lockPaths: z.array(z.string().min(1)).optional(),
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
  // R4c — the free gloss carried when `type === "custom"` (the relationship-kind shape). Omit ⇒ "".
  label: z.string().optional(),
  title: z.string().min(1),
  content: z.string(),
});

/** `editJournalEntry` — patch an entry's mutable text (host; reaches model entries — the recovery path). */
export const rpgEditJournalEntryInputSchema = z.object({
  chatId: chatIdField,
  entryId: brandedId<RpgJournalId>(),
  patch: z.object({
    type: rpgJournalTypeSchema.optional(),
    label: z.string().optional(),
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
