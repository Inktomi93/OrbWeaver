// tests/server/domain/rpg/_support — shared fixtures for the W1a persistence + staging + locks suite. Reuses
// chat's seed helpers (chat/message/variant/user) — an rpg game FKs a real chat, and snapshots key real
// assistant variants (the swipe plane). Everything is stamped from the FROZEN clock (determinism); ids are
// `castId`-minted with stable keys so timestamp/id assertions pin.

import type { ParticipantRole, Principal } from "@orb/contracts/identity";
import type { UserMacroSpec } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { RpgActorVolatile, RpgBusEvent, RpgExtractionMode, RpgGameConfig, RpgQuest, RpgSnapshotState, RpgToolCall } from "@orb/contracts/rpg";
import { RPG_PROFILE_FREEFORM, RPG_RECENT_BEATS_KEEP_DEFAULT } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { presets, rpgGames } from "@orb/db";
import type { ChatId, Handle, MessageId, MessageVariantId, PresetId, RpgGameId, RpgQuestId, RpgSnapshotId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId, newId } from "@orb/kit/ids";
import type { WireTool } from "@orb/server/infra/providers";
import type { ChatRpgOps, RpgCardCorpus, RpgTurnContext, RpgTurnTranscriptMessage } from "../../../../packages/server/src/domain/chat";
import type { ForwardSnapshotTarget } from "../../../../packages/server/src/domain/rpg/contract/params";
import type {
  RpgContext,
  RpgPopulateDelta,
  RpgPostNarratorMessage,
  RpgResolveRoster,
  RpgRosterActor,
  RpgRunToolRound,
  RpgStateDelta,
} from "../../../../packages/server/src/domain/rpg/index";
import { createRpgChatOps, createRpgFlushBarrier, createRpgService, createRpgStagingStore } from "../../../../packages/server/src/domain/rpg/index";
import { makeModelCapability, makeResolvedConnection } from "../../../support/factories/resolved-connection";
import { FROZEN_AT, seedChat, seedMessage, seedUser } from "../chat/_support";

export { expect, test } from "../../../support/fixtures";
export { addVariant, FROZEN_AT, seedCharacter, seedChat, seedMessage, seedUser } from "../chat/_support";

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

/** Mint a stable snapshot id from a key (for the ForwardSnapshotTarget). */
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
export function actorWithWallet(castKey: string, walletAmount: number, poolValue: number): RpgActorVolatile {
  return {
    actorRef: { kind: "cast", castKey },
    hp: null,
    trackerValues: { focus: { value: poolValue, items: null, max: null } },
    conditions: [],
    inventory: [],
    wallet: [{ name: "gold", amount: walletAmount }],
    status: "",
  };
}

/** A ForwardSnapshotTarget for a committed variant. `seedMessage(db, chatId, seq)` mints the message id as
 *  `message_${chatId}_${seq}` — this mirrors it so the target FKs the seeded row. */
export function target(opts: { gameId: RpgGameId; chatId: ChatId; seq: number; variantId: MessageVariantId; key: string }): ForwardSnapshotTarget {
  return {
    id: snapshotId(opts.key),
    gameId: opts.gameId,
    messageId: castId<MessageId>(`message_${opts.chatId}_${opts.seq}`),
    variantId: opts.variantId,
    now: FROZEN_AT,
  };
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
    connection: makeResolvedConnection({
      capability: makeModelCapability({ output: { maxTokens: { min: 1, max: 4096 }, structured: true }, tools: { parallel: true } }),
    }),
    ownerConsented: true,
    // Default: an empty transcript (the round still fires with an empty beat — the canned fakes ignore prompt
    // content). A §1.3 window-content test overrides `transcript` with real name-stamped rows.
    transcript: [],
    // R1: `null` = the folded tools did NOT ride this turn, so a `folded` game falls back to its post-commit
    // round. A fold test overrides it with the calls the character turn co-emitted (`[]` = a quiet beat).
    terminalToolCalls: null,
    ...over,
  };
}

/** A test Principal for a user key (the id mirrors `seedUser`'s `user_<handle>`). */
export function principal(handle: string): Principal {
  return { userId: castId<UserId>(`user_${handle}`), role: "user", handle: castId<Handle>(handle), externalId: null, via: "cookie" };
}

/** The fakes the harness lets a test program. `membership` maps a userId → role (absent = not a member,
 *  the leak-free null). `roster` is the tracker projection. `trackersReadOnly`/`foldGuarded` are the two honest-arms delivery verdicts.
 *  `toolRoundDelta` is the post-commit state round fake's return (default: an empty delta = no-op). */
export interface RpgFakes {
  membership: Map<string, ParticipantRole>;
  roster: RpgRosterActor[];
  trackersReadOnly: boolean;
  /** The D112 FOLD GUARD verdict `resolveStateDelivery` returns beside `trackersReadOnly`: this wire silences
   *  the model's prose when tools ride it (the local vLLM engine), so a `folded` game must not mount. */
  foldGuarded: boolean;
  dice: number[];
  /** The cheap-mode tool-round fake return — the DEDICATED post-commit round `cheap` runs and a non-folding
   *  `folded` turn falls back to (W1c supplies the real one; here it's programmable). Default: empty = no-op. */
  toolRoundDelta: RpgStateDelta;
  /** R1 — the `foldTurnToolCalls` fake return (the folded path's delta; NO model call in the real impl). */
  foldedDelta: RpgStateDelta;
  /** R1 — the wire tools the `buildFoldedTurn` fake mounts + its reconcile note. Default: one tool, no note. */
  foldedTools: WireTool[];
  /** R1 — make the `buildFoldedTurn` fake THROW (the pre-commit mount-failure arm: the character turn must
   *  still assemble + commit, tool-less, and the failure must be surfaced). Default off. */
  foldedToolsThrow?: boolean;
  /** The `resyncFromStory` host model-call fake return (§1.3 — W-C). Default: empty delta = no-op resync. */
  resyncDelta: RpgStateDelta;
  /** The deep canon window the injected `resolveCanonWindow` fake returns (§1.3). Default: empty. */
  canonWindow: RpgTurnTranscriptMessage[];
  /** The BORN-STATE corpus the injected `resolveCardCorpus` fake returns (the host populate round). Default:
   *  a minimal readable card; a test drives the unreadable-card arm by ASSIGNING `null` after construction
   *  (an `over` default could not express it — `??` swallows an explicit null). */
  cardCorpus: RpgCardCorpus | null;
  /** The `populateFromCharacter` model-call fake return. Default: the empty delta = a no-op round. */
  populateDelta: RpgPopulateDelta;
  /** OPTIONAL gate the fake post-commit round awaits before resolving — the flush-barrier race test sets it to
   *  a deferred promise to HOLD a flush in-flight (simulating the real 0.8-2.9s state round). Unset ⇒ immediate. */
  stateRoundGate?: Promise<void>;
  /** The preset-ownership fake (§3.2 fork). `${presetId}:${userId}` keys the presets a user may READ (owned or
   *  the shared default); `resolvePresetOwned` returns membership. Empty (default) ⇒ every preset is foreign. */
  ownedPresets: Set<string>;
  /** The ACTIVE-preset user macros the injected `resolvePresetUserMacros` fake returns (WAVE MU — the GM
   *  console's shadow gloss). Default: none declared. */
  presetUserMacros: UserMacroSpec[];
  /** Recorders — the tests assert these fired. */
  readonly pointers: { chatId: string; gameId: string; engaged: boolean }[];
  /** The chatIds a `setPointer(chatId, null)` DETACHED (the §3.3 dangling-pointer heal — assert the null write). */
  readonly detaches: string[];
  readonly narratorPosts: { chatId: string; content: string; anchor: boolean }[];
  readonly toolRoundCalls: { chatId: string; messageId: string; variantId: string; reconcile: boolean }[];
  /** R1 — the FOLD fires (`foldTurnToolCalls`): the calls it folded + the beat it folded them onto. A fold
   *  entry with an EMPTY `toolRoundCalls` IS the proof that no second model call was paid. */
  readonly foldCalls: { chatId: string; variantId: string; reconcile: boolean; toolCalls: readonly RpgToolCall[] }[];
  /** R1 — the GATHER's tool-mount asks (`buildFoldedTurn`): records the reconcile verdict the gather derived. */
  readonly foldedToolBuilds: { chatId: string; reconcile: boolean }[];
  /** R1 — the resolved state-round PATH per flush (`onStateRoundPath`): the fork's observability, so a test
   *  asserts a folded game folded (and that a fallback was NAMED, never silent). */
  readonly stateRoundPaths: { chatId: string; mode: string; path: string; fallbackReason: string | null }[];
  /** R1 — the swallowed PRE-commit tool-mount failures (`onFoldBuildFailed`). The mount is caught to protect
   *  the character turn, so this recorder is the ONLY evidence it happened. */
  readonly foldBuildFailures: { chatId: string; gameId: string }[];
  /** The `resyncFromStory` host model-call fires (§1.3) — records the host userId the call resolved UNDER + the
   *  window budget it read, so a test asserts the host-principal seam (never a caller-injected foreign id). */
  readonly resyncCalls: { chatId: string; hostUserId: string; windowTokens: number }[];
  /** The `resolveCanonWindow` reads (the injected chat op) — records the budget so a test pins the deep read. */
  readonly canonWindowReads: { chatId: string; maxTokens: number }[];
  /** The `populateFromCharacter` host model call fires — records the host userId it resolved UNDER (the
   *  host-principal seam) + the target ref + the corpus it read, so a test proves the round ran on the CARD. */
  readonly populateCalls: { chatId: string; hostUserId: string; targetRef: string; corpus: RpgCardCorpus }[];
  /** The `resolveCardCorpus` reads (the injected chat op) — the characterId the verb asked for. */
  readonly cardCorpusReads: { chatId: string; characterId: string }[];
  /** The rpg-bus events a verb/flush emitted (the `emitBus` recorder — assert-the-mutation-fired for §4.9). */
  readonly busEvents: RpgBusEvent[];
  /** The write-boundary DROPS the flush surfaced (the `onFlushDropped` recorder — assert the drop was OBSERVED,
   *  never silent, when the F1 backstop refuses a contract-invalid extracted state). */
  readonly flushDrops: { chatId: string; gameId: string; variantId: string; reason: string }[];
  /** The flush-barrier TIMEOUTS (the `onTimeout` recorder — assert the barrier released + logged a hung flush
   *  rather than deadlocking the turn). */
  readonly barrierTimeouts: { chatId: string }[];
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
      | "roster"
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
    >
  > = {},
): RpgHarness {
  const fakes: RpgFakes = {
    membership: new Map(),
    roster: over.roster ?? [],
    trackersReadOnly: over.trackersReadOnly ?? false,
    foldGuarded: over.foldGuarded ?? false,
    dice: [...(over.dice ?? [])],
    toolRoundDelta: over.toolRoundDelta ?? { statePatch: {}, journal: [] },
    foldedDelta: over.foldedDelta ?? { statePatch: {}, journal: [] },
    foldedTools: over.foldedTools ?? [{ name: "update_scene", description: "the scene", parameters: { type: "object" } }],
    ...(over.foldedToolsThrow !== undefined ? { foldedToolsThrow: over.foldedToolsThrow } : {}),
    resyncDelta: over.resyncDelta ?? { statePatch: {}, journal: [] },
    canonWindow: over.canonWindow ?? [],
    cardCorpus: { name: "Mara", card: "DESCRIPTION:\nA warden of a fallen house.", opening: "You meet at the ford." },
    populateDelta: over.populateDelta ?? { statePatch: {}, sheet: {} },
    ownedPresets: new Set(),
    presetUserMacros: over.presetUserMacros ?? [],
    pointers: [],
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
    busEvents: [],
    flushDrops: [],
    barrierTimeouts: [],
  };

  let narratorSeq = 1000;
  const postNarratorMessage: RpgPostNarratorMessage = async (chatId, content) => {
    // A state-anchor mint (the hand-edit / resync clone-forward) posts an EMPTY body; it carries no flag and
    // stays prompt-visibility-normal (`excludedFromPrompt` false) so the snapshot-resolution ladder still finds
    // it — the empty content alone is what the shape stage + the client list drop. Record it for assertions.
    fakes.narratorPosts.push({ chatId, content, anchor: content === "" });
    // Mint a REAL message + variant so the forward-write FKs resolve (the narrator slot the snapshot keys to).
    const { messageId, variantId } = await seedMessage(db, chatId, narratorSeq++, { role: "assistant", content });
    return { messageId, variantId };
  };
  const resolveRoster: RpgResolveRoster = () => Promise.resolve(fakes.roster);
  const runToolRound: RpgRunToolRound = async (input) => {
    fakes.toolRoundCalls.push({ chatId: input.chatId, messageId: input.messageId, variantId: input.variantId, reconcile: input.reconcile });
    // The flush-barrier race test HOLDS the round in-flight via this gate (a slow dedicated state round is the
    // real 0.8-2.9s window); default is unset ⇒ the round resolves immediately (every other test).
    if (fakes.stateRoundGate !== undefined) {
      await fakes.stateRoundGate;
    }
    return fakes.toolRoundDelta;
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
      quest: () => newId<RpgQuestId>(),
    },
    staging: createRpgStagingStore(),
    getMembership: (_chatId, userId) => {
      const role = fakes.membership.get(userId);
      return Promise.resolve(role === undefined ? null : { role });
    },
    setPointer: (chatId, pointer) => {
      // A `null` pointer is the §3.3 DETACH heal (the widened op drops the sub-blob); everything else is a write.
      if (pointer === null) {
        fakes.detaches.push(chatId);
      } else {
        fakes.pointers.push({ chatId, gameId: pointer.gameId, engaged: pointer.engaged });
      }
      return Promise.resolve();
    },
    resolveRoster,
    postNarratorMessage,
    resolvePresetOwned: (presetId, userId) => Promise.resolve(fakes.ownedPresets.has(`${presetId}:${userId}`)),
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
      return Promise.resolve(fakes.populateDelta);
    },
    runResyncExtraction: (input) => {
      // Record the host userId the resync resolved UNDER + the window budget it read — the test asserts the
      // host-principal seam (the funding userId is the resolved HOST, never a caller-injected foreign id) and
      // the deep read fired.
      fakes.resyncCalls.push({ chatId: input.chatId, hostUserId: input.hostUserId, windowTokens: input.transcript.length });
      return Promise.resolve(fakes.resyncDelta);
    },
    emitBus: (event) => {
      fakes.busEvents.push(event);
    },
    onFlushDropped: (info) => {
      fakes.flushDrops.push({ chatId: info.chatId, gameId: info.gameId, variantId: info.variantId, reason: info.reason });
    },
    onStateRoundPath: (info) => {
      fakes.stateRoundPaths.push({ chatId: info.chatId, mode: info.mode, path: info.path, fallbackReason: info.fallbackReason });
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
 *  fakes (roster/trackersReadOnly/foldGuarded/dice). Returns the chat + game ids + the harness. */
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
      | "roster"
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
    >
  > = {},
  key = "a",
): Promise<SeededLiteGame> {
  const chatId = await seedChat(db, key);
  const h = makeRpgService(db, over);
  h.fakes.membership.set("user_host", "host");
  const { gameId } = await h.service.createGame({ principal: principal("host"), chatId, mode: "lite" });
  return { chatId, gameId, h };
}

/** Pin a seeded game to a delivery MODE. Games are BORN `folded` (owner ruling 2026-08-01 — the one-call fold
 *  is the default experience, D112), so any test that drives the DEDICATED post-commit round (cheap's
 *  tool round) must ask for that vehicle explicitly rather than inherit it. */
export async function pinExtractionMode(h: RpgHarness, chatId: ChatId, extractionMode: RpgExtractionMode): Promise<void> {
  await h.service.updateConfig({ principal: principal("host"), chatId, extractionMode });
}

/** A `character` roster actor entry for the tracker projection. */
export function rosterCharacter(key: string, name: string): RpgRosterActor {
  return { actorRef: { kind: "character", characterId: castId(`character_${key}`) }, name };
}

/** A `user` roster actor entry. */
export function rosterUser(handle: string, name: string): RpgRosterActor {
  return { actorRef: { kind: "user", userId: castId<UserId>(`user_${handle}`) }, name };
}

/** Seed a preset row for the gmPresetId knob FK (RESTRICT to `users`). Seeds the owner user too. */
export async function seedPreset(db: Db, key: string, ownerHandle: string): Promise<PresetId> {
  const owner = await seedUser(db, ownerHandle);
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
