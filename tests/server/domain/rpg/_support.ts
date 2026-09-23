// tests/server/domain/rpg/_support — shared fixtures for the W1a persistence + staging + locks suite. Reuses
// chat's seed helpers (chat/message/variant/user) — an rpg game FKs a real chat, and snapshots key real
// assistant variants (the swipe plane). Everything is stamped from the FROZEN clock (determinism); ids are
// `castId`-minted with stable keys so timestamp/id assertions pin.

import { historyFloor } from "@orb/contracts/chat";
import type { ParticipantRole, Principal } from "@orb/contracts/identity";
import type { UserMacroSpec } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { RpgActorEntry, RpgBusEvent, RpgExtraction, RpgExtractionMode, RpgGameConfig, RpgQuest, RpgSnapshotState, RpgToolCall } from "@orb/contracts/rpg";
import { RPG_PROFILE_FREEFORM, RPG_RECENT_BEATS_KEEP_DEFAULT } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { presets, rpgGames } from "@orb/db";
import { batchMany } from "@orb/db/kit";
import type { WireTool } from "@orb/inference";
import type {
  CharacterHandle,
  CharacterId,
  ChatId,
  ChatTurnId,
  Handle,
  MessageId,
  MessageVariantId,
  PresetId,
  RpgGameId,
  RpgQuestId,
  RpgSnapshotId,
  UserId,
} from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId, newId } from "@orb/kit/ids";
import { can } from "@orb/server/domain/admin";
import type { ChatRpgOps, RpgCardCorpus, RpgTurnContext, RpgTurnTranscriptMessage } from "../../../../packages/server/src/domain/chat/index.ts";
import type { HandSnapshotTarget, TurnSnapshotTarget } from "../../../../packages/server/src/domain/rpg/contract/params.ts";
import type {
  RpgContext,
  RpgParticipantActor,
  RpgPopulateDelta,
  RpgPostNarratorMessage,
  RpgResolveParticipants,
  RpgRunToolRound,
  RpgStateDelta,
} from "../../../../packages/server/src/domain/rpg/index.ts";
import { createRpgChatOps, createRpgFlushBarrier, createRpgService, createRpgStagingStore } from "../../../../packages/server/src/domain/rpg/index.ts";
import { buildActorRefIndex, extractionToStateDelta } from "../../../../packages/server/src/domain/rpg/tools/apply.ts";
import { makeGenerationCapability, makeResolved } from "../../../support/factories/resolved-connection.ts";
import { FROZEN_AT, seedChat, seedMessage, seedUser } from "../chat/_support.ts";

export { expect, test } from "../../../support/fixtures.ts";
export { addVariant, FROZEN_AT, seedCharacter, seedChat, seedMessage, seedUser } from "../chat/_support.ts";

/** The empty-born snapshot state (the createGame seed shape — null ambient, empty planes, no locks). */
export function emptyState(): RpgSnapshotState {
  return {
    clock: null,
    calendarDate: null,
    location: "",
    weather: null,
    presentCharacters: [],
    recentEvents: [],
    actorState: [],
    trackerValues: {},
    quests: [],
    plot: null,
    fieldLocks: null,
  };
}

/** A lite game config (freeform profile, empty steering note, default extraction mode). */
export function liteConfig(): RpgGameConfig {
  return {
    engaged: true,
    ruleset: "freeform",
    statProfile: RPG_PROFILE_FREEFORM,
    lite: { steeringNote: "" },
    extractionMode: "folded", // the BORN default (owner ruling 2026-08-01) — the fixture mirrors a real game

    extractionContext: "window",
    extractionWindowTokens: 4096,
    reconcileEveryBeats: 10,
    dateMode: "narrated",
    trackers: [],
    features: {
      relationshipHints: {},
      journalTypeHints: {},
      deception: false,
      omniscience: false,
      hiddenContentReveal: true,
      recentBeatsKeepLast: RPG_RECENT_BEATS_KEEP_DEFAULT,
      immersiveHtml: true,
      immersiveHtmlInteractive: true,
      cardKeepLastX: 0,
      cyoa: false,
      cyoaChoiceBehavior: "compose",
      plotProgression: true,
    },
    userMacros: [],
  };
}

/** Insert a lite `rpg_games` row for a chat; returns its id. */
export async function seedGame(db: Db, chatId: ChatId, key = "g1", over: { config?: RpgGameConfig } = {}): Promise<RpgGameId> {
  const id = castId<RpgGameId>(`rpg_game_${key}`);
  await db.insert(rpgGames).values({
    id,
    chatId,
    mode: "lite",
    status: "active",
    sessionNumber: 1,
    gmUserId: null,
    gmPresetId: null,
    config: over.config ?? liteConfig(),
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  return id;
}

/** Mint a stable snapshot id from a key (for the snapshot write targets). */
export function snapshotId(key: string): RpgSnapshotId {
  return castId<RpgSnapshotId>(`rpg_snapshot_${key}`);
}

/** Mint a stable quest id (the in-blob brand). */
export function questId(key: string): RpgQuestId {
  return castId<RpgQuestId>(`q_${key}`);
}

/** A minimal quest object. */
export function quest(key: string, over: Partial<RpgQuest> = {}): RpgQuest {
  return { id: questId(key), name: over.name ?? key, status: over.status ?? "active", description: over.description ?? "", objectives: over.objectives ?? [] };
}

/** A minimal actor-volatile with a wallet + a `focus` tracker reading (for the swipe-consistency drives). */
export function actorWithWallet(npcKey: string, walletAmount: number, poolValue: number): RpgActorEntry {
  return {
    actorRef: { kind: "npc", npcKey },
    identity: { name: npcKey, emoji: "", mood: "", relationship: { kind: "neutral", label: "" } },
    volatile: {
      trackerValues: { focus: { value: poolValue, items: null, max: null } },
      conditions: [],
      inventory: [],
      wallet: [{ name: "gold", amount: walletAmount }],
      status: "",
    },
  };
}

/** A TURN-arm write target (D124) for a committed variant. `seedMessage(db, chatId, seq)` mints the message
 *  id as `message_${chatId}_${seq}` — this mirrors it so the target FKs the seeded row. */
export function target(opts: { gameId: RpgGameId; chatId: ChatId; seq: number; variantId: MessageVariantId; key: string }): TurnSnapshotTarget {
  return {
    id: snapshotId(opts.key),
    gameId: opts.gameId,
    messageId: castId<MessageId>(`message_${opts.chatId}_${opts.seq}`),
    variantId: opts.variantId,
    now: FROZEN_AT,
  };
}

/** A HAND-arm write target (D124) — message-less; the as-of stamp is resolved inside the write off the
 *  chat's tail slot, so a caller names only the chat. */
export function handTarget(opts: { gameId: RpgGameId; chatId: ChatId; key: string; now?: number }): HandSnapshotTarget {
  return { id: snapshotId(opts.key), gameId: opts.gameId, chatId: opts.chatId, now: opts.now ?? FROZEN_AT };
}

// ── the verb-service harness (W1b) ───────────────────────────────────────────────────────────────────────
// Builds a real `RpgService` over a real db with FAKE injected cross-feature ops (the injected-op seam is
// exactly what W1b-integration wires to chat/connection; here they're programmable fakes). Deterministic:
// id mints are stable counters, the clock is FROZEN, `randomInt` is a scripted queue.

/** The character turn's resolved connection + consent verdict the flush threads into the state round (F1/F2).
 *  Defaults to a WRITER connection (structured + tools capable) with consent ON, so a flush actually runs its
 *  round unless a test overrides it (e.g. a readonly/no-writer capability to pin the F2 gate, or a max-pro-sub
 *  source + `ownerConsented:false` to pin the F1 consent inheritance). */
export function turnConnection(over: Partial<RpgTurnContext> = {}): RpgTurnContext {
  return {
    kind: "send",
    connection: makeResolved({
      generation: makeGenerationCapability({ output: { maxTokens: { min: 1, max: 4096 }, structured: true, modalities: ["text"] }, tools: { parallel: true } }),
    }),
    // Default: an empty transcript (the round still fires with an empty beat — the canned fakes ignore prompt
    // content). A §1.3 window-content test overrides `transcript` with real name-stamped rows.
    transcript: [],
    // R1: `null` = the folded tools did NOT ride this turn, so a `folded` game falls back to its post-commit
    // round. A fold test overrides it with the calls the character turn co-emitted (`[]` = a quiet beat).
    terminalToolCalls: null,
    // #1617: the names a registry tool already owned, which is why the channel above is null. EMPTY here —
    // an ordinary turn has no collision, and the collision arm overrides it explicitly.
    terminalToolsCollided: [],
    // The turn OWNER — the cancellation scope `cancelStateRounds` matches on (mirrors `activeTurns.abort`'s
    // owner-only rule). Defaults to the harness's host user so a cancel test can name it without plumbing.
    triggeredBy: castId<UserId>("user_host"),
    // The character turn's own signal. `undefined` by default: on a real single-speaker turn it is already
    // released by the time the round runs, so the barrier's OWN controller is the cancellation that matters.
    signal: undefined,
    // PROSE-1 S4 — the turn's FROZEN prose view. Empty by default ⇒ every extraction slot resolves to its
    // shipped default, which is the byte-identity a non-prose test is asserting anyway; an override test
    // passes a real `{ [slotId]: {text, baseVersion} }` record here.
    prose: {},
    ...over,
  };
}

/** The "no clamp in force" floor (chat NO_HISTORY_FLOOR) - what a direct `listActiveJournal` call passes when
 *  the pin is about the LINEAGE projection rather than D16. The floor own arms live at the verb. */
export const UNCLAMPED = 0;

/** A test Principal for a user key (the id mirrors `seedUser`'s `user_<handle>`). */
export function principal(handle: Handle): Principal {
  return { userId: castId<UserId>(`user_${handle}`), role: "user", handle: castId<Handle>(handle), externalId: null, via: "cookie" };
}

/** The fakes the harness lets a test program. `membership` maps a userId → role (absent = not a member,
 *  the leak-free null). `participants` is the tracker projection. `trackersReadOnly`/`foldGuarded` are the two honest-arms delivery verdicts.
 *  `toolRoundDelta` is the post-commit state round fake's return (default: an empty delta = no-op). */
export interface RpgFakes {
  membership: Map<string, ParticipantRole>;
  /** #1528 - the per-user D16 canon floor chat resolveViewerVisibility would return (absent = UNCLAMPED, the
   *  `full` default). Set it to drive a from-join member: `fakes.historyFloor.set("user_member", seq)`. */
  historyFloor: Map<string, number>;
  participants: RpgParticipantActor[];
  trackersReadOnly: boolean;
  /** The D112 FOLD GUARD verdict `resolveStateDelivery` returns beside `trackersReadOnly`: this wire silences
   *  the model's prose when tools ride it (the local vLLM engine), so a `folded` game must not mount. */
  foldGuarded: boolean;
  dice: number[];
  /** The cheap-mode tool-round fake return — the DEDICATED post-commit round `cheap` runs and a non-folding
   *  `folded` turn falls back to (W1c supplies the real one; here it's programmable). Default: empty = no-op. */
  toolRoundDelta: RpgStateDelta;
  /** The MODEL'S OWN OUTPUT for the next beats — one `RpgExtraction` per flush, consumed head-first. When the
   *  queue has an entry the post-commit round folds it through the REAL applier (`extractionToStateDelta`) over
   *  the round's REAL `baseState`, so a test drives state exactly as a live turn does (schema shape → applier →
   *  accumulator merge → write boundary) instead of hand-shaping a `statePatch` literal — the hand-built-view
   *  class of gap this seam exists to make unreachable. Empty ⇒ `toolRoundDelta` (the byte-identical old path).
   *  Mints are stable counters (determinism). */
  extractions: RpgExtraction[];
  /** R1 — the `foldTurnToolCalls` fake return (the folded path's delta; NO model call in the real impl). */
  foldedDelta: RpgStateDelta;
  /** R1 — the wire tools the `buildFoldedTurn` fake mounts + its reconcile note. Default: one tool, no note. */
  foldedTools: WireTool[];
  /** R1 — make the `buildFoldedTurn` fake THROW (the pre-commit mount-failure arm: the character turn must
   *  still assemble + commit, tool-less, and the failure must be surfaced). Default off. */
  foldedToolsThrow?: boolean;
  /** The `resyncFromStory` host model-call fake return (§1.3 — W-C). Default: empty delta = no-op resync. */
  resyncDelta: RpgStateDelta;
  /** The resync round's REFUSAL arm (the round could not RUN: unresolvable connection / no structured writer /
   *  a failed model call). ASSIGNED after construction, not an `over` default — the refusal is the exception a
   *  single test drives, and every other test wants the delta arm. When set it wins over `resyncDelta`. */
  resyncRefusal?: { readonly ok: false; readonly reason: string };
  /** The deep canon window the injected `resolveCanonWindow` fake returns (§1.3). Default: empty. */
  canonWindow: RpgTurnTranscriptMessage[];
  /** The BORN-STATE corpus the injected `resolveCardCorpus` fake returns (the host populate round). Default:
   *  a minimal readable card; a test drives the unreadable-card arm by ASSIGNING `null` after construction
   *  (an `over` default could not express it — `??` swallows an explicit null). */
  cardCorpus: RpgCardCorpus | null;
  /** The `populateFromCharacter` model-call fake return. Default: the empty delta = a no-op round. */
  populateDelta: RpgPopulateDelta;
  /** The populate round's REFUSAL arm (the round could not RUN: unresolvable connection / no structured writer
   *  / a failed model call). ASSIGNED after construction, not an `over` default — the refusal is the exception
   *  a single test drives, and every other test wants the delta arm. When set it wins over `populateDelta`
   *  (the `resyncRefusal` precedent). */
  populateRefusal?: { readonly ok: false; readonly reason: string };
  /** OPTIONAL gate the fake post-commit round awaits before resolving — the flush-barrier race test sets it to
   *  a deferred promise to HOLD a flush in-flight (simulating the real 0.8-2.9s state round). Unset ⇒ immediate. */
  stateRoundGate?: Promise<void>;
  /** The preset-ownership fake (§3.2 fork). `${presetId}:${userId}` keys the presets a user may READ (owned or
   *  the shared default); `resolvePresetOwned` returns membership. Empty (default) ⇒ every preset is foreign. */
  ownedPresets: Set<string>;
  /** The GM-preset GIFT fake (the host-handoff copy offer's preset arm). `copyPresetToUser` mints a
   *  deterministic `${presetId}__copy_${toUserId}` id and RECORDS the call — so a test proves both that the
   *  copy was asked for with BOTH owners explicit and that the knob was re-pointed at the copy rather than
   *  nulled. Set `copyPresetFails` to make the source unresolvable (⇒ the clear arm must stand). */
  copyPresetFails: boolean;
  /** The ACTIVE-preset user macros the injected `resolvePresetUserMacros` fake returns (WAVE MU — the GM
   *  console's shadow gloss). Default: none declared. */
  presetUserMacros: UserMacroSpec[];
  /** Recorders — the tests assert these fired. */
  /** Every `copyPresetToUser` call, in order (the caller-gate proof: BOTH owners arrive explicitly). */
  readonly presetCopies: { fromOwnerId: string; toUserId: string; presetId: PresetId }[];
  readonly pointers: { chatId: ChatId; gameId: string; engaged: boolean }[];
  /** Deterministic interruption plant: each positive count makes the next non-null pointer write throw. */
  pointerFailuresRemaining: number;
  /** The chatIds a `setPointer(chatId, null)` DETACHED (the §3.3 dangling-pointer heal — assert the null write). */
  readonly detaches: string[];
  /** Every narrator post a verb made. D124 killed the blank "state anchor" post, and the fake enforces the
   *  same write-boundary refusal the real op does — so `narratorPosts` is now a list of REAL content, and a
   *  test that expects zero posts for a hand write is asserting the row class is gone, not filtered. */
  readonly narratorPosts: { chatId: ChatId; content: string }[];
  readonly toolRoundCalls: { chatId: ChatId; messageId: MessageId; variantId: string; reconcile: boolean }[];
  /** R1 — the FOLD fires (`foldTurnToolCalls`): the calls it folded + the beat it folded them onto. A fold
   *  entry with an EMPTY `toolRoundCalls` IS the proof that no second model call was paid. */
  readonly foldCalls: { chatId: ChatId; variantId: string; reconcile: boolean; toolCalls: readonly RpgToolCall[] }[];
  /** R1 — the GATHER's tool-mount asks (`buildFoldedTurn`): records the reconcile verdict the gather derived. */
  readonly foldedToolBuilds: { chatId: ChatId; reconcile: boolean }[];
  /** R1 — the resolved state-round PATH per flush (`onStateRoundPath`): the fork's observability, so a test
   *  asserts a folded game folded (and that a fallback was NAMED, never silent). */
  readonly stateRoundPaths: { chatId: ChatId; mode: string; path: string; fallbackReason: string | null }[];
  /** R1 — the swallowed PRE-commit tool-mount failures (`onFoldBuildFailed`). The mount is caught to protect
   *  the character turn, so this recorder is the ONLY evidence it happened. */
  readonly foldBuildFailures: { chatId: ChatId; gameId: string }[];
  /** The `resyncFromStory` host model-call fires (§1.3) — records the host userId the call resolved UNDER + the
   *  window budget it read, so a test asserts the host-principal seam (never a caller-injected foreign id). */
  readonly resyncCalls: { chatId: ChatId; hostUserId: string; windowTokens: number }[];
  /** The `resolveCanonWindow` reads (the injected chat op) — records the budget so a test pins the deep read. */
  readonly canonWindowReads: { chatId: ChatId; maxTokens: number }[];
  /** The `populateFromCharacter` host model call fires — records the host userId it resolved UNDER (the
   *  host-principal seam) + the target ref + the corpus it read, so a test proves the round ran on the CARD. */
  readonly populateCalls: { chatId: ChatId; hostUserId: string; targetRef: string; corpus: RpgCardCorpus }[];
  /** The `resolveCardCorpus` reads (the injected chat op) — the characterId the verb asked for. */
  readonly cardCorpusReads: { chatId: ChatId; characterId: CharacterId }[];
  /** R4 — force the PROMOTION's durable half to refuse (the exhausted-handle arm the compose impl produces).
   *  Set to a reason string; the fake then mints nothing. Default unset ⇒ the mint succeeds. */
  promoteRefusal?: string;
  /** R4 — the promotion mints fired (`promoteToCharacter`): the room, the HOST userId the card was minted under
   *  (the injected-op caller-gate assertion — never a re-derived owner), and the card content the verb DERIVED
   *  off the actor's identity row. A test asserts the standing guides actually reached the card. */
  readonly promoteMints: { chatId: ChatId; hostUserId: string; name: string; handle: CharacterHandle; description: string; characterId: CharacterId | null }[];
  /** Stable fake recovery identity per chat + source actor key, mirroring the composed provenance lookup. */
  readonly promotionCharacters: Map<string, CharacterId>;
  /** The rpg-bus events a verb/flush emitted (the `emitBus` recorder — assert-the-mutation-fired for §4.9). */
  readonly busEvents: RpgBusEvent[];
  /** The write-boundary DROPS the flush surfaced (the `onFlushDropped` recorder — assert the drop was OBSERVED,
   *  never silent, when the F1 backstop refuses a contract-invalid extracted state). */
  readonly flushDrops: { chatId: ChatId; gameId: string; variantId: string | null; reason: string }[];
  /** The flush-barrier TIMEOUTS (the `onTimeout` recorder — assert the barrier released + logged a hung flush
   *  rather than deadlocking the turn). */
  readonly barrierTimeouts: { chatId: ChatId }[];
  /** The flushes CANCELLED at the write boundary (`onStateRoundCancelled`) — the ONLY evidence a correct,
   *  deliberate discard happened, so a cancel test asserts here as well as on the absent snapshot row. */
  readonly stateRoundCancels: { chatId: ChatId; turnId: ChatTurnId; discardedStagedWrites: boolean }[];
  /** The WRITE-BOUNDARY SETTLES (`onFlushSettled`, #1493) — raised on EVERY arm past the cancel gate, in the
   *  order the boundary reached them. This is what proves the settle is TOTAL (a dropped flush and a turn that
   *  staged nothing settle too) and that it lands AFTER the durable write, which is the property the e2e
   *  barrier depends on. */
  readonly flushSettles: { chatId: ChatId; turnId: ChatTurnId; outcome: string; droppedReason: string | null; busEventsAtSettle: number }[];
  /** Per post-commit round: was its OWN signal aborted by the time the round's body resumed (read AFTER
   *  `stateRoundGate`)? The real vehicles hand that same signal to the provider, so `true` here is the proof the
   *  cancellation reached the model call — not merely the write boundary one step later. */
  readonly stateRoundSignalAborted: boolean[];
}

export interface RpgHarness {
  readonly service: ReturnType<typeof createRpgService>;
  /** The `ChatRpgOps` runtime over the same ctx (the seam W1c hands to chat's compose). */
  readonly chatOps: ChatRpgOps;
  /** The same ctx the service + chatOps close over — a flush test drives the staging accumulator directly to
   *  simulate what the W1c cheap-mode tools do mid-turn. */
  readonly ctx: RpgContext;
  readonly fakes: RpgFakes;
}

/** Build the harness over `db`. `hostOf(chatId)` and `memberOf(chatId)` seed the membership map by convention;
 *  a test may mutate `fakes.membership` directly for the authority matrix. */
export function makeRpgService(
  db: Db,
  over: Partial<
    Pick<
      RpgFakes,
      | "participants"
      | "trackersReadOnly"
      | "foldGuarded"
      | "dice"
      | "toolRoundDelta"
      | "foldedDelta"
      | "foldedTools"
      | "foldedToolsThrow"
      | "resyncDelta"
      | "canonWindow"
      | "populateDelta"
      | "presetUserMacros"
      | "copyPresetFails"
    >
  > = {},
): RpgHarness {
  const fakes: RpgFakes = {
    membership: new Map(),
    historyFloor: new Map(),
    participants: over.participants ?? [],
    trackersReadOnly: over.trackersReadOnly ?? false,
    foldGuarded: over.foldGuarded ?? false,
    dice: [...(over.dice ?? [])],
    toolRoundDelta: over.toolRoundDelta ?? { statePatch: {}, journal: [] },
    extractions: [],
    foldedDelta: over.foldedDelta ?? { statePatch: {}, journal: [] },
    foldedTools: over.foldedTools ?? [{ name: "update_scene", description: "the scene", parameters: { type: "object" } }],
    ...(over.foldedToolsThrow !== undefined ? { foldedToolsThrow: over.foldedToolsThrow } : {}),
    resyncDelta: over.resyncDelta ?? { statePatch: {}, journal: [] },
    canonWindow: over.canonWindow ?? [],
    cardCorpus: { name: "Mara", card: "DESCRIPTION:\nA warden of a fallen house.", opening: "You meet at the ford." },
    populateDelta: over.populateDelta ?? { statePatch: {}, sheet: {} },
    ownedPresets: new Set(),
    copyPresetFails: over.copyPresetFails ?? false,
    presetCopies: [],
    presetUserMacros: over.presetUserMacros ?? [],
    pointers: [],
    pointerFailuresRemaining: 0,
    detaches: [],
    narratorPosts: [],
    toolRoundCalls: [],
    foldCalls: [],
    foldedToolBuilds: [],
    stateRoundPaths: [],
    foldBuildFailures: [],
    resyncCalls: [],
    canonWindowReads: [],
    populateCalls: [],
    cardCorpusReads: [],
    promoteMints: [],
    promotionCharacters: new Map(),
    busEvents: [],
    flushDrops: [],
    barrierTimeouts: [],
    stateRoundCancels: [],
    flushSettles: [],
    stateRoundSignalAborted: [],
  };

  let narratorSeq = 1000;
  const postNarratorMessage: RpgPostNarratorMessage = async (chatId, content, buildSnapshotStatement) => {
    // MIRRORS the real op's D124 write-boundary refusal: a content-less canon row is not a message. A verb
    // that reaches here with "" is the exact defect this reshape made unspellable, so the fake must not
    // quietly accept what production throws on.
    if (content.trim() === "") {
      throw new Error(`postNarratorMessage: refused a blank post to chat ${chatId} (D124)`);
    }
    fakes.narratorPosts.push({ chatId, content });
    // Mint a REAL message + variant so the forward-write FKs resolve (the narrator slot the snapshot keys to).
    const { messageId, variantId } = await seedMessage(db, chatId, narratorSeq++, { role: "assistant", content });
    // This fake pins the injected-op contract only; the restore integration test uses chat's REAL narrator op
    // for rollback proof. Execute the companion so ordinary verb tests still observe the restored row.
    await db.batch(batchMany([buildSnapshotStatement({ messageId, variantId })]));
    return { messageId, variantId };
  };
  const resolveParticipants: RpgResolveParticipants = () => Promise.resolve(fakes.participants);
  let extractionMintSeq = 0;
  let itemSeq = 0;
  let questSeq = 0;
  let objectiveSeq = 0;
  let handItemSeq = 0;
  const runToolRound: RpgRunToolRound = async (input) => {
    fakes.toolRoundCalls.push({ chatId: input.chatId, messageId: input.messageId, variantId: input.variantId, reconcile: input.reconcile });
    // The flush-barrier race test HOLDS the round in-flight via this gate (a slow dedicated state round is the
    // real 0.8-2.9s window); default is unset ⇒ the round resolves immediately (every other test).
    if (fakes.stateRoundGate !== undefined) {
      await fakes.stateRoundGate;
    }
    // AFTER the gate: what the round's OWN signal reads once it is released. This is how a mid-round-cancel test
    // proves the abort actually reached the vehicle (the real arms hand this same signal to the provider) rather
    // than only being observed later at the write boundary.
    fakes.stateRoundSignalAborted.push(input.signal.aborted);
    const extraction = fakes.extractions.shift();
    if (extraction === undefined) {
      return fakes.toolRoundDelta;
    }
    // The REAL fold: the model's structured output applied over the round's REAL base by the production
    // applier — the same call `runStateRound` makes in `entry/compose/rpg.ts`.
    extractionMintSeq += 1;
    const n = extractionMintSeq;
    return extractionToStateDelta(
      input.baseState,
      extraction,
      { item: () => `item_${n}_${itemSeq++}`, quest: () => castId<RpgQuestId>(`q_${n}_${questSeq++}`), objective: () => `obj_${n}_${objectiveSeq++}` },
      buildActorRefIndex(fakes.participants),
    );
  };
  // R1 — the folded pair. NEITHER makes a model call in the real impl, which is the whole point: a test that
  // sees a `foldCall` and NO `toolRoundCall` has proven the second call is gone.
  const buildFoldedTurn: RpgContext["buildFoldedTurn"] = ({ chatId, reconcile }) => {
    fakes.foldedToolBuilds.push({ chatId, reconcile });
    if (fakes.foldedToolsThrow === true) {
      return Promise.reject(new Error("refs resolve boom"));
    }
    return Promise.resolve({ tools: fakes.foldedTools, reconcileNote: reconcile ? "RECONCILE" : null });
  };
  const foldTurnToolCalls: RpgContext["foldTurnToolCalls"] = (input) => {
    fakes.foldCalls.push({ chatId: input.chatId, variantId: input.variantId, reconcile: input.reconcile, toolCalls: input.toolCalls });
    return Promise.resolve(fakes.foldedDelta);
  };

  const ctx: RpgContext = {
    db,
    now: () => FROZEN_AT,
    ids: {
      game: () => mintTypeId(ID_PREFIX.rpgGame),
      snapshot: () => mintTypeId(ID_PREFIX.rpgSnapshot),
      sheet: () => mintTypeId(ID_PREFIX.rpgSheet),
      journal: () => mintTypeId(ID_PREFIX.rpgJournal),
      checkpoint: () => mintTypeId(ID_PREFIX.rpgCheckpoint),
      turnToolCalls: () => mintTypeId(ID_PREFIX.rpgTurnToolCalls),
      quest: () => newId<RpgQuestId>(),
      // Deterministic hand-minted item ids (the `patchActor` add arm) — a test asserts on the id it will get.
      item: () => `item_hand_${handItemSeq++}`,
    },
    staging: createRpgStagingStore(),
    // The REAL kernel, not a fake: `can` is pure (no db, no I/O — it decides over the Principal + the participants fed
    // in), so faking it would only let the authority suite pass against a stub of the thing under test.
    can,
    getMembership: (_chatId, userId) => {
      const role = fakes.membership.get(userId);
      return Promise.resolve(role === undefined ? null : { role });
    },
    // #1528 - chat resolveViewerVisibility, faithfully: `null` for a non-member (the leak-free sentinel),
    // `readsHidden` DERIVED from the role exactly as chat viewerReadsHidden derives it (host reads hidden, every
    // other present role does not), and the D16 floor off the programmable map (absent = unclamped).
    resolveViewerVisibility: (_chatId, userId) => {
      const role = fakes.membership.get(userId);
      if (role === undefined) {
        return Promise.resolve(null);
      }
      const floor = fakes.historyFloor.get(userId) ?? UNCLAMPED;
      return Promise.resolve({ role, historyFloorSeq: historyFloor(floor), readsHidden: role === "host" });
    },
    setPointer: (chatId, pointer) => {
      // A `null` pointer is the §3.3 DETACH heal (the widened op drops the sub-blob); everything else is a write.
      if (pointer === null) {
        fakes.detaches.push(chatId);
      } else {
        if (fakes.pointerFailuresRemaining > 0) {
          fakes.pointerFailuresRemaining -= 1;
          return Promise.reject(new Error("injected pointer mirror interruption"));
        }
        fakes.pointers.push({ chatId, gameId: pointer.gameId, engaged: pointer.engaged });
      }
      return Promise.resolve();
    },
    resolveParticipants,
    // R4 — the PROMOTION's durable half. The real impl mints a character card + a chat participant seat over the
    // character/chat front doors; the fake mints a stable id and SEATS her on `fakes.participants`, because the seat
    // is not decoration: the tracker view projects a `character:` actor only when the participants carry it, so a
    // fake that skipped it would let a promotion "pass" while the panel showed nobody.
    promoteToCharacter: ({ chatId, hostUserId, sourceActorKey, participants, name, handle, description }) => {
      if (fakes.promoteRefusal !== undefined) {
        fakes.promoteMints.push({ chatId, hostUserId, name, handle, description, characterId: null });
        return Promise.resolve({ ok: false, reason: fakes.promoteRefusal });
      }
      const promotionKey = `${chatId}:${sourceActorKey}`;
      const existing = fakes.promotionCharacters.get(promotionKey);
      if (
        participants.some(
          (actor) =>
            actor.name.trim().toLowerCase() === name.toLowerCase() &&
            !(existing !== undefined && actor.actorRef.kind === "character" && actor.actorRef.characterId === existing),
        )
      ) {
        return Promise.resolve({
          ok: false,
          reason: `"${name}" is already among this chat's participants — rename this character first, or the story could only ever address one of them`,
        });
      }
      if (existing !== undefined) {
        if (!fakes.participants.some((actor) => actor.actorRef.kind === "character" && actor.actorRef.characterId === existing)) {
          fakes.participants.push({ actorRef: { kind: "character", characterId: existing }, name });
        }
        return Promise.resolve({ ok: true, characterId: existing });
      }
      // A REAL TypeID, not a readable stand-in: the re-keyed ref crosses the snapshot write boundary, which
      // validates the id shape — a `character_vesna` fake would make every promotion test fail there for a
      // reason that has nothing to do with promotion. The minted id is RECORDED so a test can assert the ref.
      const characterId = mintTypeId(ID_PREFIX.character);
      fakes.promotionCharacters.set(promotionKey, characterId);
      fakes.promoteMints.push({ chatId, hostUserId, name, handle, description, characterId });
      fakes.participants.push({ actorRef: { kind: "character", characterId }, name });
      return Promise.resolve({ ok: true, characterId });
    },
    postNarratorMessage,
    resolvePresetOwned: (presetId, userId) => Promise.resolve(fakes.ownedPresets.has(`${presetId}:${userId}`)),
    copyPresetToUser: ({ fromOwnerId, toUserId, presetId }) => {
      fakes.presetCopies.push({ fromOwnerId, toUserId, presetId });
      return Promise.resolve(fakes.copyPresetFails ? null : castId<PresetId>(`${presetId}__copy_${toUserId}`));
    },
    resolvePresetUserMacros: () => Promise.resolve(fakes.presetUserMacros),
    resolveStateDelivery: () =>
      Promise.resolve({ trackersReadOnly: fakes.trackersReadOnly, foldGuarded: fakes.foldGuarded, canPopulate: !fakes.trackersReadOnly }),
    runToolRound,
    buildFoldedTurn,
    foldTurnToolCalls,
    resolveCanonWindow: (chatId, opts) => {
      fakes.canonWindowReads.push({ chatId, maxTokens: opts.maxTokens });
      return Promise.resolve(fakes.canonWindow);
    },
    resolveCardCorpus: (chatId, characterId) => {
      fakes.cardCorpusReads.push({ chatId, characterId });
      return Promise.resolve(fakes.cardCorpus);
    },
    runPopulateExtraction: (input) => {
      // The host userId the round resolved UNDER + the target + the corpus it was handed — the same
      // host-principal seam assertion the resync recorder makes (never a caller-injected foreign id).
      fakes.populateCalls.push({ chatId: input.chatId, hostUserId: input.hostUserId, targetRef: input.targetRef, corpus: input.corpus });
      return Promise.resolve(fakes.populateRefusal ?? { ok: true, delta: fakes.populateDelta });
    },
    runResyncExtraction: (input) => {
      // Record the host userId the resync resolved UNDER + the window budget it read — the test asserts the
      // host-principal seam (the funding userId is the resolved HOST, never a caller-injected foreign id) and
      // the deep read fired.
      fakes.resyncCalls.push({ chatId: input.chatId, hostUserId: input.hostUserId, windowTokens: input.transcript.length });
      return Promise.resolve(fakes.resyncRefusal ?? { ok: true, delta: fakes.resyncDelta });
    },
    emitBus: (event) => {
      fakes.busEvents.push(event);
    },
    onFlushDropped: (info) => {
      fakes.flushDrops.push({ chatId: info.chatId, gameId: info.gameId, variantId: info.variantId, reason: info.reason });
    },
    onStateRoundCancelled: (info) => {
      fakes.stateRoundCancels.push({ chatId: info.chatId, turnId: info.turnId, discardedStagedWrites: info.discardedStagedWrites });
    },
    onStateRoundPath: (info) => {
      fakes.stateRoundPaths.push({ chatId: info.chatId, mode: info.mode, path: info.path, fallbackReason: info.fallbackReason });
    },
    onFlushSettled: (info) => {
      // `busEventsAtSettle` is the ORDER WITNESS (#1493): the flush emits `snapshotPatched` only after its
      // durable snapshot+journal commit returns, so a settle recorded with that emit already counted is a
      // settle that landed AFTER the write. Reading the db here is not an option — the hook is sync `void`.
      fakes.flushSettles.push({
        chatId: info.chatId,
        turnId: info.turnId,
        outcome: info.outcome,
        droppedReason: info.droppedReason,
        busEventsAtSettle: fakes.busEvents.length,
      });
    },
    onFoldBuildFailed: (info) => {
      fakes.foldBuildFailures.push({ chatId: info.chatId, gameId: info.gameId });
    },
    flushBarrier: createRpgFlushBarrier((info) => {
      fakes.barrierTimeouts.push({ chatId: info.chatId });
    }),
    randomInt: (max) => {
      const next = fakes.dice.shift();
      return next === undefined ? max - 1 : next % max;
    },
  };
  return { service: createRpgService(ctx), chatOps: createRpgChatOps(ctx), ctx, fakes };
}

/** A seeded lite game with a `host` membership — the shared per-verb test setup. `over` forwards the harness
 *  fakes (participants/trackersReadOnly/foldGuarded/dice). Returns the chat + game ids + the harness. */
export interface SeededLiteGame {
  readonly chatId: ChatId;
  readonly gameId: RpgGameId;
  readonly h: RpgHarness;
}
export async function seedLiteGame(
  db: Db,
  over: Partial<
    Pick<
      RpgFakes,
      | "participants"
      | "trackersReadOnly"
      | "foldGuarded"
      | "dice"
      | "toolRoundDelta"
      | "foldedDelta"
      | "foldedTools"
      | "foldedToolsThrow"
      | "resyncDelta"
      | "canonWindow"
      | "populateDelta"
      | "presetUserMacros"
      | "copyPresetFails"
    >
  > = {},
  key = "a",
): Promise<SeededLiteGame> {
  // A MINTED chat id: callers parse it through the rpg wire schemas, which validate the TypeID suffix.
  const chatId = await seedChat(db, key, { id: mintTypeId(ID_PREFIX.chat) });
  const h = makeRpgService(db, over);
  h.fakes.membership.set("user_host", "host");
  const { gameId } = await h.service.createGame({ principal: principal(castId<Handle>("host")), chatId, mode: "lite" });
  return { chatId, gameId, h };
}

/** Pin a seeded game to a delivery MODE. Games are BORN `folded` (owner ruling 2026-08-01 — the one-call fold
 *  is the default experience, D112), so any test that drives the DEDICATED post-commit round (cheap's
 *  tool round) must ask for that vehicle explicitly rather than inherit it. */
export async function pinExtractionMode(h: RpgHarness, chatId: ChatId, extractionMode: RpgExtractionMode): Promise<void> {
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode });
}

/** A `character` participant actor entry for the tracker projection. */
export function participantCharacter(key: string, name: string): RpgParticipantActor {
  return { actorRef: { kind: "character", characterId: castId(`character_${key}`) }, name };
}

/** A `user` participant actor entry. */
export function participantUser(handle: Handle, name: string): RpgParticipantActor {
  return { actorRef: { kind: "user", userId: castId<UserId>(`user_${handle}`) }, name };
}

/** Seed a preset row for the gmPresetId knob FK (RESTRICT to `users`). Seeds the owner user too. */
export async function seedPreset(db: Db, key: string, ownerHandle: string): Promise<PresetId> {
  const owner = await seedUser(db, castId<Handle>(ownerHandle));
  const id = castId<PresetId>(`preset_${key}`);
  await db.insert(presets).values({
    id,
    ownerId: owner,
    name: key,
    kind: "user",
    config: DEFAULT_PROMPT_CONFIG,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  return id;
}
