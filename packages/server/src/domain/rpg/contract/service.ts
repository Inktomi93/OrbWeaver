// domain/rpg/contract/service — the persistence-layer ROW aliases + the composed snapshot-STATE bridge
// (rpg-design/05 §2.4-2.5) AND the domain's public API surface: `RpgContext` (the DI bundle the verbs close
// over, wired at compose) + `RpgService` (the verb interface, §4.4). The db table splits the swipe-volatile
// plane into columns; `RpgSnapshotState` (@orb/contracts/rpg) is the composed read shape the staging
// accumulator overlays and clone-forwards. This module homes the row aliases (derived from the db tables —
// one home, `$inferSelect`/`$inferInsert`, never re-spelled) and the two total projections between a parsed
// row and the composed state.
//
// THE INJECTED-OP SEAM (the cross-feature pattern, §0/§3): rpg's verbs need chat/connection ops they do NOT
// own — authority (`getMembership`), the opaque pointer write (`setRpgPointer`), the roster projection
// (`resolveRoster`), the narrator-slot mint for restore (`postNarratorMessage`), and the honest-arms
// capability verdict (`resolveStateDelivery`). These are declared HERE as typed members of `RpgContext`
// and WIRED at the composition root (W1b-integration/W1c) — a verb closes over the DECLARED op, never reaches
// sideways into chat (§2 one-directional flow). The runtime impls are chat/connection's, not this wave's.

import type { ParticipantRole } from "@orb/contracts/identity";
import type {
  ChatRpgPointer,
  EmitRpgEvent,
  RpgActorRef,
  RpgConfigView,
  RpgExtractionMode,
  RpgGameView,
  RpgJournalEntryView,
  RpgRevealView,
  RpgSnapshotState,
  RpgToolCall,
  RpgTrackerView,
} from "@orb/contracts/rpg";
import type { Db, rpgCheckpoints, rpgGames, rpgJournal, rpgSheets, rpgSnapshots } from "@orb/db";
import type {
  ChatId,
  ChatTurnId,
  MessageId,
  MessageVariantId,
  PresetId,
  RpgCheckpointId,
  RpgGameId,
  RpgJournalId,
  RpgQuestId,
  RpgSheetId,
  RpgSnapshotId,
  UserId,
} from "@orb/kit/ids";
import type { WireTool } from "#infra/providers";
import type { RpgTurnContext, RpgTurnTranscriptMessage } from "../../chat";
import type {
  AddJournalEntryParams,
  CreateCheckpointParams,
  CreateGameParams,
  DeleteJournalEntryParams,
  DeleteQuestParams,
  DetachDanglingPointerParams,
  EditJournalEntryParams,
  EditSnapshotParams,
  ListCheckpointsParams,
  ListJournalParams,
  PatchSheetParams,
  ReadGameParams,
  RestoreCheckpointParams,
  ResyncFromStoryParams,
  RollDiceParams,
  StagedJournalEntry,
  StagedTurnFlush,
  UpdateConfigParams,
  UpsertQuestParams,
} from "./params";
import type { CreateGameResult, RollDiceResult } from "./results";

export type RpgGameRow = typeof rpgGames.$inferSelect;
export type NewRpgGame = typeof rpgGames.$inferInsert;

export type RpgSnapshotRow = typeof rpgSnapshots.$inferSelect;
export type NewRpgSnapshot = typeof rpgSnapshots.$inferInsert;

/** The outcome of the F1 write-boundary backstop (`writeStagedSnapshot`, `persistence/snapshots.ts`). `ok:true`
 *  carries the inserted row; `ok:false` carries the human-readable schema failure (which field / why) so the
 *  DROP is never silent — the flush logs it (the visibility violation the parity-plus program exists to kill:
 *  a backstop that refuses in silence). Homed here — a type has no home in the persistence I/O file
 *  (substrate-not-a-type-home). */
export type WriteStagedSnapshotResult = { readonly ok: true; readonly row: RpgSnapshotRow } | { readonly ok: false; readonly reason: string };

export type RpgSheetRow = typeof rpgSheets.$inferSelect;

export type RpgJournalRow = typeof rpgJournal.$inferSelect;
export type NewRpgJournal = typeof rpgJournal.$inferInsert;

export type RpgCheckpointRow = typeof rpgCheckpoints.$inferSelect;
export type NewRpgCheckpoint = typeof rpgCheckpoints.$inferInsert;

/** One assistant slot's selected-variant body for the HOST-REVEAL read (§3.6): the slot id (the reveal eye
 *  keys per message) + the stored content the tokenizer scans for hidden spans. Chronological (`seq` asc) so
 *  the standing-lie inventory's most-recent-wins fold reads in emission order. The `persistence/reveal` query
 *  returns it; the pure `substrate/reveal` projection consumes it. */
export interface RevealBodyRow {
  readonly messageId: MessageId;
  readonly seq: number;
  readonly content: string;
}

/** Project a parsed snapshot row onto the composed swipe-volatile STATE (the shape the accumulator overlays).
 *  The row's JSON columns arrive already-parsed by `parseSnapshotRow`; nullable-array columns collapse their
 *  null (an empty-born row) to `[]` so the state is total. */
export function snapshotRowToState(row: RpgSnapshotRow): RpgSnapshotState {
  return {
    clock: row.clock,
    calendarDate: row.calendarDate,
    location: row.location,
    weather: row.weather,
    presentCharacters: [...(row.presentCharacters ?? [])],
    recentEvents: [...(row.recentEvents ?? [])],
    actorState: [...(row.actorState ?? [])],
    trackerValues: { ...(row.trackerValues ?? {}) },
    quests: [...(row.quests ?? [])],
    // P5 — clone-forward like quests, never a SHARED ref: a forwarded snapshot's plot must not alias its
    // base row's parsed object (swipe-consistency by copy — the quests spread precedent, one level deeper
    // because plot nests the acts array).
    plot: row.plot === null ? null : { ...row.plot, acts: row.plot.acts.map((a) => ({ ...a })) },
    fieldLocks: row.fieldLocks,
  };
}

/** The staging accumulator's public interface (impl: the feature-root `staging.ts` singleton — a STATEFUL
 *  in-memory collaborator, the `chat/active-turns.ts` precedent). Homed here (a type has no home in the
 *  stateful root file nor in zero-state `substrate/`; memory: substrate-not-a-type-home). Buckets are
 *  process-local, `ChatTurnId`-keyed, and turn-scoped (a bucket lives from first `ensure`/`stage` to
 *  `take`/`clear`). */
export interface RpgStagingStore {
  /** Seed a turn's bucket from the resolution-ladder base if it has none yet; returns the CURRENT effective
   *  state (read-through — a later tool sees earlier staged writes). Idempotent per turn: a second call with
   *  a different base does NOT reseed (the first tool's base + every overlay is the turn's truth). */
  readonly ensure: (turnId: ChatTurnId, base: RpgSnapshotState) => RpgSnapshotState;
  /** The current effective state for a turn, or `undefined` if untouched. */
  readonly peek: (turnId: ChatTurnId) => RpgSnapshotState | undefined;
  /** Overlay a tool-authored patch onto the turn's effective state (locks honored, [merge-clear]). Requires
   *  the bucket to exist (`ensure` first — a tool always resolves its base before writing). Returns the new
   *  effective state. */
  readonly stage: (turnId: ChatTurnId, patch: Record<string, unknown>) => RpgSnapshotState;
  /** Stage a journal entry (flushed at commit stamped with the committed variant). */
  readonly stageJournal: (turnId: ChatTurnId, entry: StagedJournalEntry) => void;
  /** Remove + return a turn's accumulated flush (the state + journal) at `onTurnCompleted`. `undefined` when
   *  the turn staged nothing (no snapshot to write). The bucket is DELETED — a turn flushes exactly once. */
  readonly take: (turnId: ChatTurnId) => StagedTurnFlush | undefined;
  /** Discard a turn's bucket at `onTurnAborted` — nothing durable happened, and a dead turn must never flush
   *  into the next (the dead-turn-never-flushes pin). Idempotent (no-op if already taken/cleared). */
  readonly clear: (turnId: ChatTurnId) => void;
}

/** The flush barrier's injected timeout observer (impl: the feature-root `flush-barrier.ts` singleton — a
 *  STATEFUL in-memory collaborator, the `staging.ts` precedent). Called when a chat's in-flight flush did NOT
 *  settle within the bound and the next turn proceeded on last-known state. Homed here (substrate-not-a-type-home). */
export type FlushBarrierOnTimeout = (info: { readonly chatId: ChatId }) => void;

/** The per-chat FLUSH BARRIER's public interface (impl: `flush-barrier.ts`). `onTurnCompleted` REGISTERS its
 *  in-flight flush; the gather AWAITS it before assembling the reminder, so a fast re-send reads the
 *  just-committed state, not stale state (the "one-beat-behind but GUARANTEED" contract). Bounded — a hung
 *  flush releases the barrier + logs, never a deadlocked turn. */
export interface RpgFlushBarrier {
  /** Record a chat's in-flight flush promise. Tracks the LATEST flush per chat; `awaitInFlight` races it against
   *  the bound. A rejection is swallowed here (the flush's own error handling logs it — the barrier only GATES). */
  readonly register: (chatId: ChatId, flush: Promise<void>) => void;
  /** Block until this chat's in-flight flush settles OR the bound elapses (whichever first). Resolves either
   *  way — never throws, never hangs past the bound. No in-flight flush ⇒ resolves immediately. */
  readonly awaitInFlight: (chatId: ChatId) => Promise<void>;
}

// ── the injected cross-feature ops (§0/§3 — wired at compose, W1b-integration/W1c) ───────────────────────

/** The narrow membership read (chat's `GetMembership` op, `domain/chat/contract/context.ts`). rpg gates EVERY
 *  verb through it — never a chat-table read (§4.4). `null` = not a present member / no such chat (ONE
 *  leak-free answer — the not-a-member and no-game cases are indistinguishable to the caller). */
export type RpgGetMembership = (chatId: ChatId, userId: UserId) => Promise<{ readonly role: ParticipantRole } | null>;

/** The opaque pointer write (chat's `setRpgPointer`, §3.1). `createGame` calls it ONCE so the client's takeover
 *  gate is a sync read off `ChatDetail` — rpg never reads it back. `null` DELETES the pointer (the
 *  dangling-pointer heal §3.3 — `detachDanglingPointer` nulls a pointer at a vanished game). */
export type RpgSetPointer = (chatId: ChatId, pointer: ChatRpgPointer | null) => Promise<void>;

/** One roster actor projected for the tracker view (roster ∪ sheets, §4.3). The injected `resolveRoster` op
 *  resolves the chat's present participants into `character`/`user` actor refs + display name + avatar — the
 *  name/avatar joins live in chat/character (rpg stays table-blind). */
export interface RpgRosterActor {
  readonly actorRef: RpgActorRef;
  readonly name: string;
  readonly avatar?: string;
}
export type RpgResolveRoster = (chatId: ChatId) => Promise<readonly RpgRosterActor[]>;

/** Mint a fresh narrator message slot (chat's `postNarratorMessage`, §3.2). `restoreCheckpoint` posts a
 *  VISIBLE line (the restore notice); a between-turns hand-edit / resync clone-forward posts an EMPTY body —
 *  a silent STATE-ANCHOR slot that exists only to key the clone-forwarded snapshot. No flag: an empty-content
 *  slot is already dropped from the assembled prompt (the shape-stage empty-row filter) and hidden by the
 *  client message list, so a hand edit never mints a blank bubble that also pollutes the prompt, while the
 *  slot stays prompt-visibility-normal so the snapshot-resolution ladder still finds it. Returns the
 *  committed `{messageId, variantId}` the clone-forwarded snapshot keys to. */
export type RpgPostNarratorMessage = (chatId: ChatId, content: string) => Promise<{ readonly messageId: MessageId; readonly variantId: MessageVariantId }>;

/** The preset-ownership gate (fork-clones-the-game §3.2). Is `presetId` SAFE for `userId` to carry as their
 *  game's `gmPresetId` — i.e. readable BY them (owned OR the shared system default)? The fork clone calls it for
 *  the source game's `gmPresetId` under the FORKER: a preset the forker cannot read (the source host's private
 *  preset) must NOT ride into the fork, or `resolvePresetOverride` would feed a cross-tenant preset into the
 *  forker's own turns the moment they play the copy (the [[injected-op-caller-gate]] class). rpg cannot read
 *  presets — the impl is wired at compose off the preset front door (the `resolveHostPrincipal` precedent). */
export type RpgResolvePresetOwned = (presetId: PresetId, userId: UserId) => Promise<boolean>;

/** The honest-arms capability verdict (§4.6 — the delivery-model amendment; extended by the D112 fold guard).
 *  ONE resolve of the host connection, TWO verdicts — the connection resolve is the expensive part (credential +
 *  routing + catalog), so a per-turn caller that needs both must never pay for it twice. Its VALUE is
 *  INTEGRATION-supplied (W1c wires the real connection resolve); a fake returns fixed booleans in tests. */
export type RpgResolveStateDelivery = (chatId: ChatId) => Promise<RpgStateDeliveryVerdict>;

/** What the resolved connection can do for THIS game's state delivery. Both fields are CAPABILITY-derived (the
 *  composition root reads the descriptor; rpg never sees a credential/source — D112's ban on a `credential.source`
 *  branch in `domain/**`).
 *  Non-exported: reachable only through `RpgResolveStateDelivery`'s signature — no consumer names it (knip). */
interface RpgStateDeliveryVerdict {
  /** Manual-steering: the connection has NO model write path for this game's mode (`cheap`/`folded` need
   *  `capability.tools`, `reliable` needs `capability.output.structured`). The host hand-edits every plane. */
  readonly trackersReadOnly: boolean;
  /** The FOLD GUARD (D112 as amended, owner ruling): this wire SILENCES the model's prose when tools ride it
   *  (`coEmitsProseWithTools` is false — the local vLLM engine), so a `folded` game must NOT mount its terminal
   *  tools on the character turn. The state still lands: the flush runs `cheap`'s post-commit round instead and
   *  says so (`fallbackReason: "local-engine-fold-guard"`). The host's EXPLICIT `cheap`/`reliable` choice is
   *  untouched by this — the guard only governs where `folded` lands. */
  readonly foldGuarded: boolean;
}

/** The DEEP canon-window read (crunchy-cluster §1.3 — the `resyncFromStory` host escape hatch's story feed). An
 *  INJECTED CHAT OP (chat owns canon reads; rpg reads no chat table, §2 one-directional flow): resolve the
 *  chat's selected-lineage canon, name-stamped + token-measured, oldest→newest, up to `maxTokens` (newest-first
 *  fill, then restored to chronological order — the SAME projection the engine threads at `fireRpgTurnCompleted`,
 *  one shared builder so the two can't drift). Room-plane per D106 ("the prompt is the room's"); hidden-class
 *  spans stay INTACT (the resync is model-plane — the model always reads its own lies, D110 §3.6; the member
 *  never sees this read). Principal-free (the resync verb gated its host caller before invoking).
 *  Non-exported: reachable only through `RpgContext.resolveCanonWindow`'s signature — no consumer names it (knip). */
type RpgResolveCanonWindow = (chatId: ChatId, opts: { readonly maxTokens: number }) => Promise<readonly RpgTurnTranscriptMessage[]>;

/** The reliable-mode post-narration extraction op (§4.6 / the delivery-model amendment). AFTER the character
 *  message commits, `reliable` mode runs a DEDICATED structured-output turn that reads the committed beat + the
 *  resolved base state and emits the whole state delta in ONE object. This is the DECLARED SEAM: `onTurnCompleted`
 *  (reliable) calls it, stages the returned delta onto the turn's accumulator, and flushes it exactly like a
 *  cheap-mode tool run. The IMPL (the structured-output schema + the model call + the parse) is W1c —
 *  W1b-integration DECLARES the type and CALLS it, and tests the reliable path with an injected fake.
 *
 *  The seam carries the committed variant's IDENTIFIERS, NOT its prose (`baseState` is the only resolved input):
 *  the IMPL owns chat/connection access, so it reads the beat text itself (rpg stays out of `message_variants`
 *  content-reading — the boundary the injected-op pattern draws). `baseState` is the resolution-ladder head the
 *  extraction reasons against (never re-resolved by the op). A game whose model has NO structured-output writer
 *  capability never reaches here (readonly/manual-steering; §4.6). */
export type RpgRunExtraction = (input: RpgStateRoundInput) => Promise<RpgStateDelta>;

/** CHEAP mode's DEDICATED TOOL ROUND (owner ruling 2026-07-27) — the SIBLING of `runExtraction`, structurally
 *  symmetric: a state-only request (NOT tools on the character turn) that reads the committed beat + base state
 *  and emits its writes as PARALLEL tool calls (`tool_choice:"required"` + a `no_changes` escape). The parsed
 *  calls fold to the SAME `RpgStateDelta` the flush stages + writes — the shared-plane proof (a tool round IS
 *  "the batch of tool calls the model would otherwise have made"). Same input/output as `runExtraction`; the
 *  vehicle differs (tools vs schema). A game whose model has no `tools` capability never reaches here
 *  (readonly/manual-steering; §4.6). */
export type RpgRunToolRound = (input: RpgStateRoundInput) => Promise<RpgStateDelta>;

/** R1 (the FOLDED delivery mode) — build the TERMINAL wire tools the CHARACTER turn mounts, so the model
 *  co-emits its prose AND the turn's state in ONE completion. The product is the SAME
 *  `buildToolRoundWireTools` set the dedicated cheap round sends (identical per-call ref/condition/cast-field
 *  enum constraints — the fold changes the DELIVERY, never the schema), plus the reconcile-beat note when this
 *  beat is the `reconcileEveryBeats`-th (the round would have put that line in its own system prompt; the
 *  folded turn has no second prompt, so the gather appends it to the reminder). `null` tools ⇒ do not mount
 *  (the game is not folded / the refs could not resolve) — the gather then contributes a byte-identical
 *  tool-less turn. Wired at compose (it needs the connection-free ref resolve + the projected schema); a fake
 *  returns a fixed set in tests.
 *  Non-exported: reachable only through `RpgContext.buildFoldedTurn`'s signature — no consumer names it (knip). */
type RpgBuildFoldedTurn = (input: {
  readonly chatId: ChatId;
  /** The resolution-ladder HEAD the model is shown — the state the player is looking at when the turn is
   *  assembled, so the enums it is constrained to name the actors currently on stage. The flush's apply base
   *  is resolved separately and excludes the turn's own slot (VER-1a, `resolveSnapshotBeforeSlot`), so on a
   *  REROLL the two differ by exactly the rejected variant's delta — a ref the menu carries but the base does
   *  not is dropped by the R5 ghost guard at apply, errors-as-data (never a mint off a dead sibling). */
  readonly baseState: RpgSnapshotState;
  readonly reconcile: boolean;
}) => Promise<{ readonly tools: readonly WireTool[]; readonly reconcileNote: string | null }>;

/** R1 — fold the character turn's co-emitted TERMINAL tool calls into the SAME `RpgStateDelta` the dedicated
 *  rounds produce, with NO model call of its own (the calls were already paid for by the narrative turn). The
 *  input mirrors the state rounds' exactly (so the flush can treat it as one more round) plus the calls. It is
 *  ERRORS-AS-DATA and TOTAL: a malformed arg / a ghost actor is DROPPED and LOGGED, zero calls is a legitimate
 *  quiet beat (logged distinctly, never an error), and NOTHING here can fail or delay the committed narrative.
 *  Non-exported: reachable only through `RpgContext.foldTurnToolCalls`'s signature — no consumer names it (knip). */
type RpgFoldTurnToolCalls = (input: RpgStateRoundInput & { readonly toolCalls: readonly RpgToolCall[] }) => Promise<RpgStateDelta>;

/** The `resyncFromStory` model call (crunchy-cluster §1.3 — the host escape hatch). Rebuilds the tracked state
 *  from a DEEP story window with establish-EVERYTHING forcing (the reconcile arm, applied unconditionally). The
 *  verb resolves the host authority + reads the window (via the injected `resolveCanonWindow`) then hands the
 *  resolved inputs to THIS op; the op resolves the ROOM connection AS THE HOST (fresh, at the verb — the one
 *  sanctioned non-inherited rpg model call, because the consenting human initiates it) and drives ONE
 *  structured-output call. Returns the delta the verb applies through the normal staging → write tail onto a
 *  fresh state-anchor slot. A connection with no structured-output writer capability yields an EMPTY delta (the
 *  resync is a no-op — never a corrupt write); the verb surfaces that as an unchanged state.
 *  Non-exported: reachable only through `RpgContext.runResyncExtraction`'s signature — no consumer names it (knip). */
type RpgRunResyncExtraction = (input: RpgResyncInput) => Promise<RpgStateDelta>;

/** The resolved inputs the `resyncFromStory` model call consumes. `hostUserId` is the ROOM host (resolved by
 *  ROLE at the verb, D19) the op resolves the connection + creds + consent UNDER — never a caller-supplied
 *  principal/userId (the injected-op caller-gate class: dropping the host id here would let a foreign principal
 *  fund the model call). `transcript` is the deep canon window the injected `resolveCanonWindow` read;
 *  `baseState` is the resolution-ladder head the rebuild reconciles against (locks honored at the verb's merge). */
interface RpgResyncInput {
  readonly chatId: ChatId;
  readonly hostUserId: UserId;
  readonly baseState: RpgSnapshotState;
  readonly transcript: readonly RpgTurnTranscriptMessage[];
}

/** The shared input BOTH dedicated state rounds consume (reliable extraction + cheap tool round). Carries the
 *  committed variant's IDENTIFIERS (never its prose — the impl reads the beat itself), the resolution-ladder
 *  base state, AND `turnConnection` — the NARRATION turn's already-resolved route + enforced owner-consent
 *  verdict + its OWN canon transcript (`RpgTurnContext`, chat's front door). The round runs on THAT connection
 *  with THAT consent AND reasons from `turnConnection.transcript` (§1.3) — the
 *  F1 fix: no second `resolveRole` (a room on vllm runs its round on vllm), no force-stamped `ownerConsented`
 *  (a metered-sub round inherits the turn's belt verdict). `turnConnection.connection.capability` also gates
 *  the flush's readonly verdict (F2 — no round on a capability-absent connection). */
/** Non-exported: the two exported op aliases (`RpgRunExtraction`/`RpgRunToolRound`) ARE the public surface;
 *  nothing names this shape directly outside this file (knip). */
interface RpgStateRoundInput {
  readonly chatId: ChatId;
  readonly gameId: RpgGameId;
  readonly turnId: ChatTurnId;
  readonly messageId: MessageId;
  readonly variantId: MessageVariantId;
  readonly baseState: RpgSnapshotState;
  readonly turnConnection: RpgTurnContext;
  /** RECONCILE beat (crunchy-cluster §1.3 reconcile cadence): this flush is the `reconcileEveryBeats`-th, so the
   *  round FORCES a full re-emission of the refreshable planes — the establish-when-unset machinery
   *  (`constrainExtractionSchema` scene/cast) is applied UNCONDITIONALLY and the prompt gains the reconcile
   *  line — so a deep story's panel self-heals against drift instead of decaying. Locked fields stay
   *  lock-protected at the merge (a reconcile never clobbers a hand-pin). `false` on an ordinary beat
   *  (byte-identical to the pre-cadence round). Derived at `stageStateRound` from a cheap snapshot COUNT — the
   *  round never re-computes it. */
  readonly reconcile: boolean;
}

/** What a reliable-mode extraction returns (§4.6): the state OVERLAY (a partial snapshot-state patch under the
 *  [merge-clear] contract — staged via `applyLockedPatch` exactly like a tool write) + the journal entries to
 *  stamp with the committed variant. The SAME two planes cheap-mode tools stage during the turn, so both modes
 *  funnel through the one accumulator flush. */
export interface RpgStateDelta {
  readonly statePatch: Record<string, unknown>;
  readonly journal: readonly StagedJournalEntry[];
}

/** The id mints the verbs use (injected for determinism — a test supplies stable ids, no ambient `crypto`;
 *  the notifications `mintTypeId`-in-verb precedent inverted to a DI factory so the persistence ids pin). */
export interface RpgIdMints {
  readonly game: () => RpgGameId;
  readonly snapshot: () => RpgSnapshotId;
  readonly sheet: () => RpgSheetId;
  readonly journal: () => RpgJournalId;
  readonly checkpoint: () => RpgCheckpointId;
  readonly quest: () => RpgQuestId;
}

/** The DI bundle every rpg verb closes over, assembled at the composition root (`context.ts` builds it; its
 *  TYPE is this explicit interface — no `ReturnType<>`, the `no-context-returntype` gate). db + injected clock
 *  + id mints + the staging singleton + the five injected cross-feature ops + the dice CSPRNG. */
export interface RpgContext {
  readonly db: Db;
  readonly now: () => number;
  readonly ids: RpgIdMints;
  readonly staging: RpgStagingStore;
  readonly getMembership: RpgGetMembership;
  readonly setPointer: RpgSetPointer;
  readonly resolveRoster: RpgResolveRoster;
  readonly postNarratorMessage: RpgPostNarratorMessage;
  /** The preset-ownership gate (§3.2 fork host-secret strip) — is a `gmPresetId` safe for the forker to carry? */
  readonly resolvePresetOwned: RpgResolvePresetOwned;
  readonly resolveStateDelivery: RpgResolveStateDelivery;
  readonly runExtraction: RpgRunExtraction;
  readonly runToolRound: RpgRunToolRound;
  /** R1 (`folded` mode) — the character turn's TERMINAL tool mount (the gather calls it) and the fold of the
   *  calls it comes back with (the flush calls it). Together they replace the post-commit round with ZERO
   *  model calls of their own. */
  readonly buildFoldedTurn: RpgBuildFoldedTurn;
  readonly foldTurnToolCalls: RpgFoldTurnToolCalls;
  /** The DEEP canon-window read (§1.3) the `resyncFromStory` host verb reads its story feed from — the injected
   *  chat op (rpg reads no chat table). Wired at compose to a chat-owned builder that shares the engine's
   *  transcript projection. A fake returns a fixed transcript in tests. */
  readonly resolveCanonWindow: RpgResolveCanonWindow;
  /** The reliable-mode reconcile/resync model call under the HOST's FRESH-resolved connection (§1.3 resync).
   *  UNLIKE `runExtraction`/`runToolRound` (which ride the character turn's already-resolved connection +
   *  inherited consent), this resolves the ROOM connection AS THE HOST at the verb (a host-INITIATED
   *  interactive action, not an out-of-turn background call): the consenting human is at the keyboard, so
   *  consent is the host's OWN and the principal is the host — never a caller-injected foreign principal. Wired
   *  at compose (the `resolveStateDelivery` host-resolve precedent). A fake returns a fixed delta in tests. */
  readonly runResyncExtraction: RpgRunResyncExtraction;
  /** The feature-root rpg-bus emit (the injected `EmitRpgEvent` op — wired at compose to `publishRpgEvent`,
   *  `domain/rpg/bus.ts`). A verb/flush calls it AFTER its durable write commits (§4.9); fire-and-forget
   *  (`void`) — LIVE-ONLY, a dropped tick is healed by the client's reconnect blanket invalidate. A fake
   *  recorder in tests asserts the emit fired. */
  readonly emitBus: EmitRpgEvent;
  /** A uniform int in `[0, max)` — the dice CSPRNG (injected: `crypto.randomInt` at compose, a seeded fake in
   *  tests). Bake-once; the roll is server-authoritative, a client-supplied seed is never honored (§4.4). */
  readonly randomInt: (max: number) => number;
  /** The per-chat FLUSH BARRIER (`flush-barrier.ts`): `onTurnCompleted` REGISTERS its in-flight flush promise;
   *  the gather AWAITS it before assembling the reminder, so a fast re-send reads the just-committed state, not
   *  stale state (the "one-beat-behind but GUARANTEED" contract). Bounded — a hung flush never deadlocks a turn. */
  readonly flushBarrier: RpgFlushBarrier;
  /** OBSERVABILITY: the flush's write-boundary DROP hook (the F1 backstop refusing a contract-invalid state).
   *  Called with the schema failure reason when `writeStagedSnapshot` refuses — so the drop is never silent
   *  (a state extraction fired, produced applicable output, and vanished at the backstop is the exact
   *  visibility violation this program kills). Wired at compose to the `rpg.flush.dropped` warn log; a fake
   *  recorder asserts it fired in tests. Fire-and-forget (`void`) — a logging failure never breaks a turn. */
  readonly onFlushDropped: (info: FlushDropInfo) => void;
  /** OBSERVABILITY: which STATE-ROUND PATH this flush resolved to (R1). The delivery model is now a fork, and
   *  a fork that resolves silently is a fork nobody can debug: a `folded` game that quietly fell back to the
   *  post-commit round still writes correct state, but it also silently pays the second call the fold exists to
   *  remove. So the resolution is named on every flush, with the reason when it is not what the knob asked for.
   *  Wired at compose to a log line; a fake recorder asserts it in tests. Fire-and-forget (`void`). */
  readonly onStateRoundPath: (info: StateRoundPathInfo) => void;
  /** OBSERVABILITY: the folded turn's TOOL-MOUNT failed (R1). The mount is the fold's only PRE-commit step and
   *  it reads the db, so it is caught and swallowed to protect the character turn — which means the ONLY trace
   *  a broken mount leaves is this line. Without it a game would quietly stop folding (and quietly start paying
   *  the second call again) with nothing to explain why. Wired at compose to a `rpg.extraction.fold_build_failed`
   *  warn; a fake recorder asserts it in tests. Fire-and-forget (`void`). */
  readonly onFoldBuildFailed: (info: FoldBuildFailedInfo) => void;
}

/** A folded turn's tool-mount failure (R1). Carries the id context + the thrown cause; the turn proceeded
 *  tool-less and its state will be captured by the fallback post-commit round.
 *  Non-exported: reachable only through `RpgContext.onFoldBuildFailed`'s signature — no consumer names it (knip). */
interface FoldBuildFailedInfo {
  readonly chatId: ChatId;
  readonly gameId: RpgGameId;
  readonly err: unknown;
}

/** The resolved state-round PATH for one flush (R1 observability). `path` is what actually ran; `mode` is what
 *  the host's knob asked for. They differ exactly when a `folded` game could not fold, and `fallbackReason` names
 *  WHICH of the two causes it was: `no-terminal-channel` (the wire carries no terminal tools at all — the
 *  stateful agent-sdk arm, a tools-incapable model) or `local-engine-fold-guard` (the wire CAN carry them but
 *  silences the prose when they ride, so the mount was deliberately withheld — D112 as amended).
 *  Non-exported: reachable only through `RpgContext.onStateRoundPath`'s signature — no consumer names it (knip). */
/** WHY a `folded` game did not fold. `no-terminal-channel` = the wire cannot carry terminal tools at all;
 *  `local-engine-fold-guard` = it can, but attaching them silences the prose (`coEmitsProseWithTools` false), so
 *  the mount was withheld on purpose. Exported: the flush's reason-derivation names it (one home for the
 *  vocabulary — the log's cause words are not re-spelled per call site). */
export type RpgFoldFallbackReason = "no-terminal-channel" | "local-engine-fold-guard";

interface StateRoundPathInfo {
  readonly chatId: ChatId;
  readonly gameId: RpgGameId;
  readonly mode: RpgExtractionMode;
  /** `folded` = the character turn's own tool calls (ZERO extra model calls); `tool-round`/`structured` = a
   *  dedicated post-commit model call. */
  readonly path: "folded" | "tool-round" | "structured";
  readonly fallbackReason: RpgFoldFallbackReason | null;
}

/** The write-boundary drop signal (the F1 backstop refused a contract-invalid state at flush). Carries the id
 *  context + the schema failure reason (which field / why) so the drop is diagnosable from the provider trail.
 *  Non-exported: reachable only through `RpgContext.onFlushDropped`'s signature — no consumer names it (knip). */
interface FlushDropInfo {
  readonly chatId: ChatId;
  readonly gameId: RpgGameId;
  readonly variantId: MessageVariantId;
  /** The `rpgSnapshotStateSchema` parse failure — the field path(s) + reason the state was refused. */
  readonly reason: string;
}

/** What the composition root supplies to build the ctx — a pass-through of `RpgContext`'s members (the builder
 *  does no derivation; every field is injected at compose, W1c). */
export type RpgContextDeps = RpgContext;

/** The resolved authority context a gated verb works from: the game row + the caller's present role (derived
 *  from `PARTICIPANT_ROLES`, never re-spelled — §5.5). */
export interface RpgAuthorized {
  readonly game: RpgGameRow;
  readonly role: ParticipantRole;
}

/** The lock DELTA a hand edit applies (`snapshot-edit.ts`): paths to auto-LOCK (touched fields —
 *  manual-edit-wins) and paths to CLEAR (a removed keyed element takes its `<field>.<id>` lock with it — the
 *  symmetric grammar). */
export interface HandEditLocks {
  readonly lock?: readonly string[];
  readonly clear?: readonly string[];
}

// ── the verb surface (§4.4) ─────────────────────────────────────────────────────────────────────────────

/** The rpg service — the lite verb surface (§4.4). Authority resolves through `ctx.getMembership`: host-gated
 *  verbs require the roster host; a member may write their OWN `user` row/actor; shared planes are host-write;
 *  reads are member-gated. Refusals are LEAK-FREE (a non-member gets the same not-found a no-game chat gets —
 *  the cross-tenant trust boundary). Types the verbs return home in `@orb/contracts/rpg` (the views) or
 *  `./results` (the two internal results). */
export interface RpgService {
  /** Host. Mints the game row (lite only; `"full"` → `RpgModeUnbuiltError`), seeds the born snapshot, writes
   *  the opaque pointer. Returns the birth summary (incl. `trackersReadOnly`). */
  readonly createGame: (params: CreateGameParams) => Promise<CreateGameResult>;
  /** Host. The ONE config write door: profile mutability matrix + `steeringNote` + the `gmPresetId` +
   *  `extractionMode` knobs. */
  readonly updateConfig: (params: UpdateConfigParams) => Promise<void>;
  /** Host any; a member their own `user` ref. MA-4 sheet patch (attribute keys validated ∈ profile + range). */
  readonly patchSheet: (params: PatchSheetParams) => Promise<void>;
  /** Host any field; a member their own actor's volatile. Writes volatile state on the current resolved
   *  snapshot (clone-forward), auto-locking touched fields. */
  readonly editSnapshot: (params: EditSnapshotParams) => Promise<void>;
  /** Host. Snapshot-plane quest write (clone-forward + `quests.<id>` lock). Returns the quest id. */
  readonly upsertQuest: (params: UpsertQuestParams) => Promise<RpgQuestId>;
  readonly deleteQuest: (params: DeleteQuestParams) => Promise<void>;
  /** Host. Hand journal entry — stamps `variantId: NULL` (every-lineage). Returns the entry id. */
  readonly addJournalEntry: (params: AddJournalEntryParams) => Promise<RpgJournalId>;
  readonly editJournalEntry: (params: EditJournalEntryParams) => Promise<void>;
  readonly deleteJournalEntry: (params: DeleteJournalEntryParams) => Promise<void>;
  /** Host. Label the current resolved snapshot. Returns the checkpoint id. */
  readonly createCheckpoint: (params: CreateCheckpointParams) => Promise<RpgCheckpointId>;
  /** Host. Clone the checkpointed snapshot forward BORN COMMITTED onto a fresh narrator slot. */
  readonly restoreCheckpoint: (params: RestoreCheckpointParams) => Promise<void>;
  readonly listCheckpoints: (params: ListCheckpointsParams) => Promise<readonly RpgCheckpointRow[]>;
  /** Member. Server CSPRNG, bake-once — the total + faces + composer stamp. Zero state. */
  readonly rollDice: (params: RollDiceParams) => Promise<RollDiceResult>;
  /** Member. The takeover's mode read (§4.8). */
  readonly getGame: (params: ReadGameParams) => Promise<RpgGameView>;
  /** Member. The aggregate the takeover renders in one query (roster ∪ sheets, resolved-current snapshot). */
  readonly getTrackerView: (params: ReadGameParams) => Promise<RpgTrackerView>;
  /** Member. The paged, lineage-projected journal. */
  readonly listJournal: (params: ListJournalParams) => Promise<readonly RpgJournalEntryView[]>;
  /** HOST. The Stats & Trackers editor surface (full profile + steeringNote + gmPresetId). */
  readonly getConfigView: (params: ReadGameParams) => Promise<RpgConfigView>;
  /** HOST (§3.6). The reveal "eye": the parsed hidden `<lie>`/`<ofilter>` content of the game's assistant
   *  transcript + the standing-lie inventory. A READ over the stored bodies (derive-from-bodies, no new table);
   *  host-gated server-side (a member gets leak-free NOT_FOUND — the truth is a GM-plane secret). Empty when the
   *  host turned M4 `hiddenContentReveal` off (pure-hidden posture). */
  readonly revealHidden: (params: ReadGameParams) => Promise<RpgRevealView>;
  /** HOST. The dangling-pointer HEAL (fork-clones-the-game §3.3): a chat's `metadata.rpg` pointer points at a
   *  game row that no longer exists (a pre-fix fork, or any future desync). Nulls the stale pointer so the chat
   *  self-heals to a plain chat. This verb CANNOT resolve through the normal game gate (the game is GONE, so
   *  `resolveMember`/`resolveHost` collapse to NOT_FOUND); it gates on chat MEMBERSHIP directly (host role
   *  required — a stamped-id write boundary, `getMembership`), and REFUSES to detach a LIVE game (a real
   *  `rpg_games` row → `DomainOperation` — that is `updateConfig engaged:false`'s job, never a silent unpoint). */
  readonly detachDanglingPointer: (params: DetachDanglingPointerParams) => Promise<void>;
  /** HOST (crunchy-cluster §1.3 — the manual "re-derive from the story" escape hatch). On demand, re-reads a DEEP
   *  story window and REBUILDS/reconciles the tracked state (the alternative to hand-editing when the panel has
   *  drifted). Runs ONE model call under the HOST principal (the consent seam — the host is authorizing a model
   *  read of the canon): the verb resolves host authority FIRST (`resolveHost` — a member gets leak-free
   *  NOT_FOUND, a non-host member FORBIDDEN, so a member can NEVER trigger a host-principal model call), then
   *  resolves the room connection AS THE HOST and drives the rebuild with establish-EVERYTHING forcing. The delta
   *  applies through the normal staging → write-boundary tail onto a fresh state-anchor slot; locks are honored
   *  (a resync repairs the model plane, never the host's pins). A capability-absent connection / empty rebuild is
   *  a no-op (no write). Deception-active games stay surface-only by construction (the §1.6 registry clause — the
   *  tracker never carries hidden `<lie>`/`<ofilter>` truth). */
  readonly resyncFromStory: (params: ResyncFromStoryParams) => Promise<void>;
}
