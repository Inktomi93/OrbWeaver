// tests/server/domain/rpg/_support — shared fixtures for the W1a persistence + staging + locks suite. Reuses
// chat's seed helpers (chat/message/variant/user) — an rpg game FKs a real chat, and snapshots key real
// assistant variants (the swipe plane). Everything is stamped from the FROZEN clock (determinism); ids are
// `castId`-minted with stable keys so timestamp/id assertions pin.

import type { ParticipantRole, Principal } from "@orb/contracts/identity";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { RpgActorVolatile, RpgBusEvent, RpgGameConfig, RpgQuest, RpgSnapshotState } from "@orb/contracts/rpg";
import { RPG_PROFILE_FREEFORM } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { presets, rpgGames } from "@orb/db";
import type { ChatId, Handle, MessageId, MessageVariantId, PresetId, RpgGameId, RpgQuestId, RpgSnapshotId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId, newId } from "@orb/kit/ids";
import type { ChatRpgOps } from "../../../../packages/server/src/domain/chat";
import type { ForwardSnapshotTarget } from "../../../../packages/server/src/domain/rpg/contract/params";
import type {
  RpgContext,
  RpgPostNarratorMessage,
  RpgResolveRoster,
  RpgRosterActor,
  RpgRunExtraction,
  RpgStateDelta,
} from "../../../../packages/server/src/domain/rpg/index";
import { createRpgChatOps, createRpgService, createRpgStagingStore } from "../../../../packages/server/src/domain/rpg/index";
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
    widgetValues: {},
    quests: [],
    fieldLocks: null,
  };
}

/** A lite game config (freeform profile, empty steering note, default extraction mode). */
export function liteConfig(): RpgGameConfig {
  return { statProfile: RPG_PROFILE_FREEFORM, lite: { steeringNote: "" }, extractionMode: "reliable" };
}

/** Insert a lite `rpg_games` row for a chat; returns its id. */
export async function seedGame(db: Db, chatId: ChatId, key = "g1"): Promise<RpgGameId> {
  const id = castId<RpgGameId>(`rpg_game_${key}`);
  await db.insert(rpgGames).values({
    id,
    chatId,
    mode: "lite",
    status: "active",
    sessionNumber: 1,
    gmUserId: null,
    gmPresetId: null,
    config: liteConfig(),
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

/** A minimal actor-volatile with a wallet + pool (for the swipe-consistency drives). */
export function actorWithWallet(castKey: string, walletAmount: number, poolValue: number): RpgActorVolatile {
  return {
    actorRef: { kind: "cast", castKey },
    hp: null,
    pools: [{ name: "focus", value: poolValue, max: 100 }],
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

/** A test Principal for a user key (the id mirrors `seedUser`'s `user_<handle>`). */
export function principal(handle: string): Principal {
  return { userId: castId<UserId>(`user_${handle}`), role: "user", handle: castId<Handle>(handle), externalId: null, via: "cookie" };
}

/** The fakes the harness lets a test program. `membership` maps a userId → role (absent = not a member,
 *  the leak-free null). `roster` is the tracker projection. `trackersReadOnly` is the honest-arms verdict.
 *  `extractionDelta` is the reliable-mode `runExtraction` fake's return (default: an empty delta = no-op). */
export interface RpgFakes {
  membership: Map<string, ParticipantRole>;
  roster: RpgRosterActor[];
  trackersReadOnly: boolean;
  dice: number[];
  /** The reliable-mode extraction fake return (W1c supplies the real one; here it's programmable). */
  extractionDelta: RpgStateDelta;
  /** Recorders — the tests assert these fired. */
  readonly pointers: { chatId: string; gameId: string }[];
  readonly narratorPosts: { chatId: string; content: string }[];
  readonly extractionCalls: { chatId: string; messageId: string; variantId: string }[];
  /** The rpg-bus events a verb/flush emitted (the `emitBus` recorder — assert-the-mutation-fired for §4.9). */
  readonly busEvents: RpgBusEvent[];
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
export function makeRpgService(db: Db, over: Partial<Pick<RpgFakes, "roster" | "trackersReadOnly" | "dice" | "extractionDelta">> = {}): RpgHarness {
  const fakes: RpgFakes = {
    membership: new Map(),
    roster: over.roster ?? [],
    trackersReadOnly: over.trackersReadOnly ?? false,
    dice: [...(over.dice ?? [])],
    extractionDelta: over.extractionDelta ?? { statePatch: {}, journal: [] },
    pointers: [],
    narratorPosts: [],
    extractionCalls: [],
    busEvents: [],
  };

  let narratorSeq = 1000;
  const postNarratorMessage: RpgPostNarratorMessage = async (chatId, content) => {
    fakes.narratorPosts.push({ chatId, content });
    // Mint a REAL message + variant so the forward-write FKs resolve (the narrator slot the snapshot keys to).
    const { messageId, variantId } = await seedMessage(db, chatId, narratorSeq++, { role: "assistant", content });
    return { messageId, variantId };
  };
  const resolveRoster: RpgResolveRoster = () => Promise.resolve(fakes.roster);
  const runExtraction: RpgRunExtraction = (input) => {
    fakes.extractionCalls.push({ chatId: input.chatId, messageId: input.messageId, variantId: input.variantId });
    return Promise.resolve(fakes.extractionDelta);
  };

  const ctx: RpgContext = {
    db,
    now: () => FROZEN_AT,
    ids: {
      game: () => mintTypeId(ID_PREFIX.rpgGame),
      snapshot: () => mintTypeId(ID_PREFIX.rpgSnapshot),
      sheet: () => mintTypeId(ID_PREFIX.rpgSheet),
      widget: () => mintTypeId(ID_PREFIX.rpgWidget),
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
      fakes.pointers.push({ chatId, gameId: pointer.gameId });
      return Promise.resolve();
    },
    resolveRoster,
    postNarratorMessage,
    resolveTrackersReadOnly: () => Promise.resolve(fakes.trackersReadOnly),
    runExtraction,
    emitBus: (event) => {
      fakes.busEvents.push(event);
    },
    randomInt: (max) => {
      const next = fakes.dice.shift();
      return next === undefined ? max - 1 : next % max;
    },
  };
  return { service: createRpgService(ctx), chatOps: createRpgChatOps(ctx), ctx, fakes };
}

/** A seeded lite game with a `host` membership — the shared per-verb test setup. `over` forwards the harness
 *  fakes (roster/trackersReadOnly/dice). Returns the chat + game ids + the harness. */
export interface SeededLiteGame {
  readonly chatId: ChatId;
  readonly gameId: RpgGameId;
  readonly h: RpgHarness;
}
export async function seedLiteGame(
  db: Db,
  over: Partial<Pick<RpgFakes, "roster" | "trackersReadOnly" | "dice" | "extractionDelta">> = {},
  key = "a",
): Promise<SeededLiteGame> {
  const chatId = await seedChat(db, key);
  const h = makeRpgService(db, over);
  h.fakes.membership.set("user_host", "host");
  const { gameId } = await h.service.createGame({ principal: principal("host"), chatId, mode: "lite" });
  return { chatId, gameId, h };
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
