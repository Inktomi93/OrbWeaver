// @orb/contracts/rpg/inputs — the TRANSPORT WIRE input schemas for the `rpg.*` verb procs. The rpg
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
import { rpgActorOpSchema, rpgActorRefSchema, rpgNpcRefSchema } from "./actor.ts";
import {
  RPG_DATE_MODES,
  RPG_EXTRACTION_CONTEXTS,
  RPG_EXTRACTION_MODES,
  RPG_EXTRACTION_WINDOW_TOKENS_MAX,
  RPG_EXTRACTION_WINDOW_TOKENS_MIN,
  RPG_RECONCILE_EVERY_BEATS_MAX,
  RPG_STEERING_NOTE_MAX,
} from "./config.ts";
import { rpgCyoaChoiceBehaviorSchema, rpgGameModeSchema, rpgJournalTypeSchema, rpgQuestStatusSchema } from "./enums.ts";
import { rpgStatProfileSchema } from "./profile.ts";
import { rpgRulesetSchema } from "./ruleset.ts";
import { rpgQuestObjectiveSchema } from "./snapshot.ts";
import { RPG_HINT_MAX, rpgTrackerDefSchema } from "./tracker.ts";

/** The shared chatId trust-boundary field — game-ness + authority BOTH resolve through it (no `ownerId`, D23). */
const chatIdField = brandedId<ChatId>();

/** `createGame` — host-gated birth. `mode` rides the mode enum (`"full"` is wire-valid; the verb throws the
 *  typed PHASE refusal). `ruleset` is the game's born vocabulary (omit ⇒ `freeform`, the birth default).
 *
 *  THE `profile` ARM IS GONE (#862, owner ruling 2026-08-30): a start-time statProfile pick was the door
 *  half of a choice that is now a SETTING — one start action, and the host retunes `ruleset` on the Game tab
 *  (additively). Pre-launch NO-LEGACY: replaced, not deprecated. */
export const rpgCreateGameInputSchema = z.object({
  chatId: chatIdField,
  mode: rpgGameModeSchema,
  ruleset: rpgRulesetSchema.optional(),
});

/** `updateConfig` — the ONE config write door (host). `patch` carries the profile + steering note; `gmPresetId`
 *  is the preset-override knob (a `PresetId` sets it, explicit `null` clears, omit keeps); `extractionMode` is
 *  the delivery-model knob. `steeringNote` is length-capped at the contract's `RPG_STEERING_NOTE_MAX`. */
export const rpgUpdateConfigInputSchema = z.object({
  chatId: chatIdField,
  patch: z
    .object({
      statProfile: rpgStatProfileSchema.optional(),
      // THE RULESET SETTING (#862) — omit keeps. A CHANGED value applies that ruleset's vocabulary
      // ADDITIVELY (owner ruling: adds attributes/skills/seeded trackers beside what exists, removes
      // nothing, needs no confirmation); re-sending the CURRENT value is a no-op, so a host who deleted a
      // packaged attribute never has it resurrected by an unrelated write.
      ruleset: rpgRulesetSchema.optional(),
      steeringNote: z.string().max(RPG_STEERING_NOTE_MAX).optional(),
      // THE TRACKERS (the tracked-field unification) — the host's whole tracker set for this game, in ONE
      // write. Omit keeps the current list; a passed array REPLACES it (whole-list edit — the unified editor
      // owns the set authoritatively, exactly as the retired `castFields`/`pinnedOrbs` writes did). Every axis
      // (subject/shape/write/appliesTo/max/hint/color/icon/sort/pinned/locked) rides the DERIVED def schema.
      trackers: z.array(rpgTrackerDefSchema).optional(),
      // The per-custom-kind relationship hints + the R4c custom-journal-type hints. Omit keeps; a passed
      // record REPLACES it.
      relationshipHints: z.record(z.string(), z.string().max(RPG_HINT_MAX)).optional(),
      journalTypeHints: z.record(z.string(), z.string().max(RPG_HINT_MAX)).optional(),
      // The hidden-channel knobs + the recent-beats cap. Omit keeps the current value; a
      // passed scalar REPLACES it. `deception`/`omniscience` gate the teaching block + the member reasoning-strip;
      // `hiddenContentReveal` governs the host's reveal eye; `recentBeatsKeepLast` bounds the reminder slice.
      deception: z.boolean().optional(),
      omniscience: z.boolean().optional(),
      hiddenContentReveal: z.boolean().optional(),
      recentBeatsKeepLast: z.number().int().min(0).optional(),
      // The card knobs (teaching gate, interactivity ask, keep-last-X wire) — omit keeps; a passed value replaces.
      immersiveHtml: z.boolean().optional(),
      immersiveHtmlInteractive: z.boolean().optional(),
      cardKeepLastX: z.number().int().min(0).optional(),
      // The P5 play-style knobs (§5.4/§6.4) — CYOA standing mode + the choice-click behavior + the wand
      // Plot submenu gate. Omit keeps; a passed value replaces.
      cyoa: z.boolean().optional(),
      cyoaChoiceBehavior: rpgCyoaChoiceBehaviorSchema.optional(),
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
      // NO `prose` ARM (owner ruling 2026-08-08): the reminder teach/heading overrides are written through the
      // PRESET editor (`promptConfig.prose`), never this door — one home for authorable prompt text.
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
    // RPG-STAT-CLOBBER — the attributes record is itself a [merge-clear] PATCH (D108's grammar), not an image:
    // a named key is written, an OMITTED key is kept, and an explicit `null` CLEARS that key. The panel writes
    // ONE key per blurred cell, so whole-record replace semantics here silently erased every other attribute
    // on the sheet — the owner's "type 20 into strength, click out, it reverts to 1" (an absent key renders the
    // profile's range floor). The `null` arm is not decoration: `updateConfig` refuses to REMOVE an attribute
    // any sheet still references, so without an explicit clear a filled-in key would pin its attribute into the
    // profile forever.
    attributes: z.record(z.string(), z.number().int().nullable()).optional(),
    // The per-actor TRACKER EXCEPTIONS (the unification's applicability model): tracker KEYS this actor is
    // granted beyond its carrier class, and keys revoked from it. Omit keeps; a passed array REPLACES it.
    // Tracker DEFS are not here — they home once in `config.trackers` (`updateConfig` is their door).
    trackerGrants: z.array(z.string().min(1)).optional(),
    trackerRevokes: z.array(z.string().min(1)).optional(),
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

/** `editSnapshot` — the hand-edit door for the IMAGE-honest planes (host). `actorState` is NO LONGER one of
 *  them (R1): the per-actor volatile plane is op-shaped through `rpg.patchActor`/`rpg.dismissActor`, and a
 *  patch naming it comes back as a refusal that says so (`RPG_OP_SHAPED_PLANES`). What stays here is what a
 *  client can honestly author whole: the ambient leaves, the `trackerValues` record, `plot`, `recentEvents`,
 *  `presentCharacters`, `quests`. `patch` is a partial snapshot-state overlay under the [merge-clear]
 *  contract — an OPAQUE object the domain validates/locks (the
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

/** `patchActor` — THE op-shaped hand door for one actor's volatile plane (R1; host any actor, the
 *  member-own-volatile arm deferred at the verb). `ops` are applied IN ORDER against the TRUE resolved head,
 *  server-side (read-modify-write) — there is no client-authored image to go stale, so a model flush landing
 *  between the panel's read and this call survives every field the ops do not name. Each op stamps its own
 *  FINE lock path (`actorState.<ref>.<field>…`, the #10 pin) — the client no longer names lock paths at all.
 *  `autoLock:false` is the ONE honest opt-out: a write to a field the MODEL CANNOT REACH (an item's host-picked
 *  `icon`) has nothing to pin, and stamping a lock there would only hand the host a pin to release. Refusals
 *  (an op naming an item/condition that isn't there, a merged state the write boundary rejects) are DATA. */
export const rpgPatchActorInputSchema = z.object({
  chatId: chatIdField,
  targetRef: rpgActorRefSchema,
  ops: z.array(rpgActorOpSchema).min(1),
  autoLock: z.boolean().optional(),
});

/** `dismissActor` — THE removal gesture for the actor plane (R1; host). Drops the actor's `actorState` row AND
 *  its scene-presence row and RELEASES every lock at/below its path (the `deleteQuest` symmetric-lock
 *  precedent). Until this verb existed nothing could remove an actor at all: the plane is ADDITIVE by policy
 *  (an unnamed row is ignorance, not intent), so a hallucinated NPC stayed reachable, targetRef-enumerated and
 *  clone-forwarded forever. This is the "real gesture" that policy always named and never had. */
export const rpgDismissActorInputSchema = z.object({
  chatId: chatIdField,
  targetRef: rpgActorRefSchema,
});

/** `promoteActor` — THE promotion doorway (R4; host): a scene NPC the story kept coming back to EARNS a
 *  character card. It is `dismissActor`'s opposite — dismissal forgets the person, promotion keeps her forever — and the
 *  only rpg verb whose write reaches outside the game (it mints a durable character card + a chat participant seat
 *  through ONE injected op, then re-keys the actor row `npc:<slug>` → `character:<id>` on the snapshot plane).
 *
 *  The payload is the TARGET AND NOTHING ELSE. The card's name and handle are the SERVER's derivation off the
 *  actor's own identity row (`rpgPromotedCardDescription` + `rpgNpcSlug`), never client-authored: this door
 *  inherits R1's lesson that a client which can only see the plane in projections must not author what lands in
 *  it. `targetRef` rides {@link rpgNpcRefSchema}, not the whole actor union — promoting a `character`/`user`
 *  actor is not a refusal, it is meaningless, so the wire cannot express it.
 *
 *  Refusals are DATA (`HandDoorResult`): an untracked target, an actor with no identity row, and — the ruled
 *  collision — a chat that already has a participant carrying that NAME. */
export const rpgPromoteActorInputSchema = z.object({
  chatId: chatIdField,
  targetRef: rpgNpcRefSchema,
});

/** `upsertQuest` — the hand arm of the quest plane (host). `questId` present ⇒ update, absent ⇒ create.
 *  `status` rides the DERIVED quest-status enum. `objectives` are the authoring shape (`id` optional — a new
 *  objective omits it, the verb mints; `completed` optional) — the snapshot-resident `rpgQuestObjectiveSchema`
 *  requires `id`, so this authoring variant carries the optional-id, never a re-spell of the resident union. */
const questFields = {
  chatId: chatIdField,
  name: z.string().min(1),
  status: rpgQuestStatusSchema.optional(),
  description: z.string().optional(),
};

export const rpgUpsertQuestInputSchema = z.union([
  z.strictObject({
    ...questFields,
    questId: z.never().optional(),
    objectives: z.array(z.strictObject({ text: z.string().min(1), completed: z.boolean().optional() })).optional(),
  }),
  z.strictObject({ ...questFields, questId: brandedId<RpgQuestId>() }),
]);

/** Objective edits are operations against the server's current quest, never a client-authored list image. */
export const rpgEditQuestObjectiveInputSchema = z.strictObject({
  chatId: chatIdField,
  questId: brandedId<RpgQuestId>(),
  op: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("add"), text: z.string().min(1) }),
    z.strictObject({
      kind: z.literal("setCompleted"),
      objectiveId: rpgQuestObjectiveSchema.shape.id,
      completed: z.boolean(),
    }),
    z.strictObject({ kind: z.literal("delete"), objectiveId: rpgQuestObjectiveSchema.shape.id }),
  ]),
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

/** The `listJournal` / `listTurnToolCalls` page CEILINGS, enforced at the transport trust boundary (the
 *  `CHARACTER_LIST_MAX_LIMIT` precedent) — both are growing per-game catalogs whose verbs page an unbounded
 *  SQL `.limit()`, so an over-bound ask is a BAD_REQUEST naming the bound, never an unbounded fetch.
 *
 *  The two ceilings count DIFFERENT things, which is why the tool-calls field is `turnLimit` and the
 *  journal's is `limit`: the journal bounds ROWS, the tool-calls read bounds TURNS (message slots) and serves
 *  every record of a windowed slot. The tool-calls row count is therefore turns × that slot's swipes — still
 *  bounded, because a slot's variants are bounded by how many times a human pressed reroll. */
export const RPG_JOURNAL_LIST_MAX_LIMIT = 200;
export const RPG_TURN_TOOL_CALLS_LIST_MAX_LIMIT = 200;

/** `listJournal` — the paged lineage-projected archive (member). */
export const rpgListJournalInputSchema = z.object({
  chatId: chatIdField,
  limit: z.number().int().min(1).max(RPG_JOURNAL_LIST_MAX_LIMIT).optional(),
  offset: z.number().int().min(0).optional(),
});

/** `rpg.listTurnToolCalls` — the recorded-turn window (TOOLCALLS-INVISIBLE, arm A). No `offset`: the client
 *  indexes the whole window by `variantId` to render per-row disclosures, so paging backward would only ever
 *  half-populate that index (see `ListTurnToolCallsParams`).
 *
 *  `turnLimit`, not `limit` — the field was RENAMED with its unit (2026-08-14) when the window stopped
 *  counting rows and started counting turns; a silently re-denominated `limit` would have left every caller
 *  asking for something other than what it says. */
export const rpgListTurnToolCallsInputSchema = z.object({
  chatId: chatIdField,
  turnLimit: z.number().int().min(1).max(RPG_TURN_TOOL_CALLS_LIST_MAX_LIMIT).optional(),
});
