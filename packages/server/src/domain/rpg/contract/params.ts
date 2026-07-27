// domain/rpg/contract/params — the internal param shapes the persistence + substrate slots + VERBS take
// (rpg-design/05 §2.4-2.5, §4.4). These are DOMAIN-INTERNAL types (a verb-to-persistence contract), homed in
// the domain's own `contract/` (never `@orb/contracts/rpg`, which is the cross-boundary wire surface). The
// verb params (below the persistence params) carry the caller's `Principal` — the authority the verb resolves
// through the injected `getMembership` op (§4.4); wire types the verb RETURNS live in `@orb/contracts/rpg`.

import type { ChatInjection } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { RpgActorRef, RpgJournalType, RpgQuestStatus, RpgSnapshotState, RpgStatProfile, RpgTrackerView, RpgWidgetDef } from "@orb/contracts/rpg";
import type {
  ChatId,
  MessageId,
  MessageVariantId,
  PresetId,
  RpgCheckpointId,
  RpgGameId,
  RpgJournalId,
  RpgQuestId,
  RpgSnapshotId,
  RpgWidgetId,
} from "@orb/kit/ids";

// ── persistence-layer params (W1a) ──────────────────────────────────────────────────────────────────────

/** The minimal game reference the snapshot resolver walks the ladder against. */
export interface SnapshotGameRef {
  readonly id: RpgGameId;
  readonly chatId: ChatId;
}

/** The 4-rung ladder inputs (rpg-design/05 §2.4). `regenMessageId` = a regen/swipe target: rung 1 resolves
 *  that message's CURRENTLY-selected sibling (≠ the new variant, so `excludeVariantId`). Absent ⇒ a fresh
 *  turn, which starts at rung 2 (the last visible assistant slot). */
export interface ResolveSnapshotOpts {
  readonly regenMessageId?: MessageId;
  readonly excludeVariantId?: MessageVariantId;
}

/** The forward-write target — the committed variant a staged/restored snapshot is keyed to (rpg-design/05
 *  §2.4). `now` is injected (no ambient clock in persistence). */
export interface ForwardSnapshotTarget {
  readonly id: RpgSnapshotId;
  readonly gameId: RpgGameId;
  readonly messageId: MessageId;
  readonly variantId: MessageVariantId;
  readonly now: number;
}

/** What the accumulator flushes for a completed turn: the effective composed state (base overlaid by every
 *  staged tool write, locks already honored) plus the staged journal entries to stamp with the committed
 *  variant. */
export interface StagedTurnFlush {
  readonly state: RpgSnapshotState;
  readonly journal: readonly StagedJournalEntry[];
}

/** A journal entry a tool staged mid-turn — flushed at commit stamped with the COMMITTED variant's id
 *  (rpg-design/05 §2.5). The `variantId`/`sourceMessageId` are supplied by the flush, not the tool. */
export interface StagedJournalEntry {
  readonly type: string;
  readonly title: string;
  readonly content: string;
}

// ── verb-layer params (W1b) ─────────────────────────────────────────────────────────────────────────────
// Every verb carries the caller's `Principal` (the authority the verb resolves through `getMembership`) plus
// the target `chatId` (game-ness + authority both resolve through the chat FK chain — no `ownerId`, D23).
// The optional fields the W2 `rpg.*` router SPREADS from a zod-`.optional()` wire schema are typed
// `?: T | undefined` (the `ListMessagesParams` chat precedent) — under `exactOptionalPropertyTypes` a bare
// `?: T` rejects the explicit `undefined` a zod-optional infers, and the transport pass-through spreads it.

/** `createGame` — the host-gated create. `mode ∈ RPG_GAME_MODES`; `"full"` throws `RpgModeUnbuiltError`.
 *  `profile` is the caller-picked packaged/imported statProfile (omit ⇒ `freeform`, lite's default). */
export interface CreateGameParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly mode: string;
  readonly profile?: RpgStatProfile | undefined;
}

/** `updateConfig` — the ONE config write door (host). `patch` carries the profile mutability matrix + the
 *  `lite.steeringNote`; `gmPresetId` is the preset-override KNOB (§4.11 #1 — a `PresetId` sets it, explicit
 *  `null` clears back to augment, omit keeps). `extractionMode` is the delivery-model knob (the amendment). */
export interface UpdateConfigParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly patch?:
    | {
        readonly statProfile?: RpgStatProfile | undefined;
        readonly steeringNote?: string | undefined;
      }
    | undefined;
  readonly gmPresetId?: PresetId | null | undefined;
  readonly extractionMode?: string | undefined;
}

/** `patchSheet` — write an actor's identity sheet (host any; a member their own `user` ref). MA-4 patch: every
 *  field optional, no defaults — an omitted field keeps its current value. Attribute keys are validated ∈ the
 *  profile vocabulary + range. */
export interface PatchSheetParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly actorRef: RpgActorRef;
  readonly patch: {
    readonly className?: string | undefined;
    readonly attributes?: Readonly<Record<string, number>> | undefined;
    readonly poolDefs?: readonly { readonly name: string; readonly max: number }[] | undefined;
    readonly maxHp?: number | null | undefined;
    readonly flavor?: string | undefined;
  };
}

/** `editSnapshot` — the hand-edit door (host any field; a member their own actor's volatile). Writes the
 *  volatile state on the CURRENT resolved snapshot (clone-forward if the head is committed) and AUTO-LOCKS
 *  every field the patch touched. `patch` is a partial snapshot-state overlay under the [merge-clear] contract. */
export interface EditSnapshotParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly patch: Record<string, unknown>;
}

/** `createWidget` — add a HUD widget definition (host). */
export interface CreateWidgetParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly def: RpgWidgetDef;
}

/** `updateWidget` — patch a HUD widget definition's mutable columns (host). */
export interface UpdateWidgetParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly widgetId: RpgWidgetId;
  // A per-field-optional widget def patch; `| undefined` per field so the zod-`.partial()` wire shape the W2
  // router spreads is assignable under `exactOptionalPropertyTypes` (a bare `Partial<>` rejects the undefined).
  readonly patch: { readonly [K in keyof RpgWidgetDef]?: RpgWidgetDef[K] | undefined };
}

/** `deleteWidget` — remove a HUD widget definition (host). */
export interface DeleteWidgetParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly widgetId: RpgWidgetId;
}

/** `upsertQuest` — the hand arm of the quest plane (host). Writes the `quests` array on the current resolved
 *  snapshot (clone-forward + `fieldLocks` — swipe-consistent, §2.5). `questId` present ⇒ update; absent ⇒
 *  create (mints a fresh id). */
export interface UpsertQuestParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly questId?: RpgQuestId | undefined;
  readonly name: string;
  readonly status?: RpgQuestStatus | undefined;
  readonly description?: string | undefined;
  readonly objectives?: readonly { readonly id?: string | undefined; readonly text: string; readonly completed?: boolean | undefined }[] | undefined;
}

/** `deleteQuest` — remove a quest from the current resolved snapshot's array (host). */
export interface DeleteQuestParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly questId: RpgQuestId;
}

/** `addJournalEntry` — a hand journal entry (host); stamps `variantId: NULL` (every-lineage room note, §2.5). */
export interface AddJournalEntryParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly type: RpgJournalType;
  readonly title: string;
  readonly content: string;
}

/** `editJournalEntry` — patch an entry's mutable text (host; reaches model entries — the recovery path). */
export interface EditJournalEntryParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly entryId: RpgJournalId;
  readonly patch: {
    readonly type?: RpgJournalType | undefined;
    readonly title?: string | undefined;
    readonly content?: string | undefined;
  };
}

/** `deleteJournalEntry` — remove a journal entry (host). */
export interface DeleteJournalEntryParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly entryId: RpgJournalId;
}

/** `createCheckpoint` — label the current resolved snapshot (host). */
export interface CreateCheckpointParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly label: string;
}

/** `restoreCheckpoint` — clone a checkpointed snapshot forward BORN COMMITTED onto a fresh narrator slot
 *  (host). `chatId` is carried for the authority resolve; the checkpoint FK carries the game. */
export interface RestoreCheckpointParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly checkpointId: RpgCheckpointId;
}

/** `listCheckpoints` — the game's labeled bookmarks (member). */
export interface ListCheckpointsParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
}

/** `rollDice` — server CSPRNG, bake-once (member). Zero state; the result is returned for the composer stamp. */
export interface RollDiceParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly notation: string;
}

/** A read scoped to a chat's game (member for `getGame`/`getTrackerView`; host for `getConfigView`). */
export interface ReadGameParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
}

/** `listJournal` — the paged lineage-projected archive (member). */
export interface ListJournalParams {
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

// ── chat-ops-layer shapes (W1b-integration) ─────────────────────────────────────────────────────────────
// The gather's contribution + the reminder assembler's input — DOMAIN-INTERNAL feature types (§7.4 homes
// feature types in contract/, never inline at the module). The gather result is structurally the chat-side
// `ChatRpgGatherResult`; the reminder input is the pure assembler's argument.

/** The generic gather contribution (structurally the chat-side `ChatRpgGatherResult`): the macro map, the
 *  reminder injection(s), and the tool NAMES to attach. Lite contributes no macros (the injection strategy —
 *  `MODE_POLICY.lite.prompt === "injection"`; the gm-preset macro arm is full's). */
export interface RpgGatherResult {
  readonly macros: Readonly<Record<string, string>>;
  readonly injections: readonly ChatInjection[];
  readonly tools: readonly string[];
}

/** The `buildLiteReminder` inputs the gather resolves and hands in (§4.7). `steeringNote` is
 *  `config.lite.steeringNote` (the always-wins tail). No tool-capability input: the char turn is always
 *  tool-less prose (owner ruling 2026-07-27), so the reminder never carries tool-update guidance. */
export interface LiteReminderInput {
  readonly view: RpgTrackerView;
  readonly steeringNote: string;
}
