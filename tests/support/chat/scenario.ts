// tests/support/chat/scenario — `scenario.chat(tape, opts)`: the composition-root-as-fixture driver that
// wires the REAL chat verbs + engine over a REAL libSQL db, with a scripted provider (the {@link Tape}) as the
// injected `runChatTurn` role. Neo's `scenario.chat` re-derived against ORB's verb surface (N4) — orb has NO
// group/solo split and no separate verb files: ONE `createTurn(ctx, deps)` bundle drives solo AND group as a
// roster-of-N through the SAME path (D16), so this driver seeds a room of N characters and returns the WHOLE
// turn-verb surface (send/swipe/continue/impersonate/generate/force/abort) plus the recorders every chat int
// test hand-rolls (bus events, stats deltas, streamed deltas, captured wire requests).
//
// BUILD-ON-DON'T-FORK: the DI bundle is `makeChatContext` from the chat int-test harness
// (`tests/server/domain/chat/_support.ts`) — the SAME throwing-stub-defaulted `ChatContext` every chat int
// test already composes (one home; this driver only swaps `runChatTurn`, `getCard`, and the stats recorder).
// The engine/verb wiring mirrors that file's per-file `harness()` — extracted here so real-wired is the
// default shape, not re-hand-rolled per file. If a test needs a seam this driver doesn't surface, pass a
// `ctx`/`foreign` override rather than forking the driver.

import type { CharacterCard } from "@orb/contracts/character";
import type { AssemblePersona, DurableChatBusEvent, GroupPolicy, MessageView } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { RegexScriptRow } from "@orb/contracts/regex";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import type { Resolved } from "@orb/inference";
import type { CharacterId, ChatId, Handle, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createActiveTurns } from "../../../packages/server/src/domain/chat/active-turns.ts";
import type { ActiveTurns } from "../../../packages/server/src/domain/chat/contract/active-turns.ts";
import type { ChatContext } from "../../../packages/server/src/domain/chat/contract/context.ts";
import type { ChatBehaviorInputs, ResolveForeignInputsOp } from "../../../packages/server/src/domain/chat/contract/foreign.ts";
import { DEFAULT_CHAT_BEHAVIOR } from "../../../packages/server/src/domain/chat/contract/foreign.ts";
import type { MemoryConfig } from "../../../packages/server/src/domain/chat/contract/memory.ts";
import type { GuidedSteer } from "../../../packages/server/src/domain/chat/contract/params.ts";
import type { GroupOutput, RequestTurnOp, TurnOutcome, TurnRequest } from "../../../packages/server/src/domain/chat/contract/results.ts";
import { createTurnEngine } from "../../../packages/server/src/domain/chat/engine/engine.ts";
import { loadWitnessHorizons } from "../../../packages/server/src/domain/chat/memory/persistence/queries.ts";
import { recallMemory } from "../../../packages/server/src/domain/chat/memory/recall/recall.ts";
import { loadCanonHistory } from "../../../packages/server/src/domain/chat/persistence/queries.ts";
import { createClaimChat } from "../../../packages/server/src/domain/chat/verbs/claim-chat.ts";
import { createRequestTurn, createTurn } from "../../../packages/server/src/domain/chat/verbs/turn.ts";
import { makeChatContext, seedCharacter, seedChat, seedParticipant, seedUser } from "../../server/domain/chat/_support.ts";
import { freshDb } from "../db.ts";
import { makeResolved } from "../factories/resolved-connection.ts";
import type { Tape } from "./tape.ts";
import { scriptedRunner } from "./tape.ts";

/** The default resolved connection every scripted turn runs against (the keyless endpoint row, `test-model`). */
function connectionOf(): Resolved<"chat"> {
  return makeResolved();
}

/** A minimal live card for a roster member (name only — the shape the assembly reads). */
const cardOf = (name: string): CharacterCard =>
  // @orb-waive no-test-fabrication(unknown): minimal `CharacterCard` double (turn.int precedent) — assembly reads only name/description. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  ({ name, description: "", avatarAssetId: null, regexScripts: [] }) as unknown as CharacterCard;

/** A deterministic PRNG (Park-Miller LCG) — D46 (never `Math.random`). */
function seededPrng(seed = 1): () => number {
  let s = seed;
  return (): number => {
    s = (s * 16_807) % 2_147_483_647;
    return s / 2_147_483_647;
  };
}

/** The default anchor/active personas the FOREIGN resolver returns (a single "Alex" user POV). */
const DEFAULT_PERSONAS: {
  readonly anchor: AssemblePersona | null;
  readonly active: AssemblePersona | null;
} = {
  anchor: { name: "Alex", description: "the user" },
  active: { name: "Alex", description: "the user" },
};

/** How a chat `scenario` seeds its room + wires its FOREIGN inputs. Every field has a chat-int-test default. */
export interface ChatScenarioOptions {
  /** A pre-migrated db to seed into; omitted ⇒ a fresh `freshDb()` (`:memory:`). */
  readonly db?: Db;
  /** The roster character keys (also their display names). Default `["aria"]` (a solo room). */
  readonly characters?: readonly string[];
  /** Character keys seeded MUTED (`disabled: true`) — auto-selection excludes them (#29). */
  readonly disabledKeys?: readonly string[];
  /** The arbitration policy (WHO speaks each round). Default `"natural"`. */
  readonly policy?: GroupPolicy;
  /** The output axis (`per-speaker` vs `narrator`). Default `"per-speaker"`. */
  readonly output?: GroupOutput;
  /** The per-speaker card scope. Default the room's own default (`merged`). */
  readonly cardScope?: "merged" | "scoped";
  /** Enable the auto-mode AI→AI chain (`autoModeDelayMs:0`, deterministic). */
  readonly autoMode?: boolean;
  /** The auto-mode chained-turn cap when `autoMode` is on. Default 2. */
  readonly autoModeMaxTurns?: number;
  /** The active preset's resolved `PromptConfig` (FOREIGN). Default `DEFAULT_PROMPT_CONFIG`. */
  readonly promptConfig?: PromptConfig;
  /** The resolved anchor/active personas (FOREIGN). Default a single "Alex" POV. */
  readonly personas?: {
    readonly anchor: AssemblePersona | null;
    readonly active: AssemblePersona | null;
  };
  /** The host-global regex tier (FOREIGN — `UserSettings.regex.scripts`). Default none. */
  readonly hostRegexScripts?: readonly RegexScriptRow[];
  /** The WI keyword-scan window (FOREIGN). Default 6. */
  readonly scanDepth?: number;
  /** The ONE injection budget pass (FOREIGN; 0 ⇒ unbudgeted). Default 0. */
  readonly injectionTokenBudget?: number;
  /** The resolved memory tuning (FOREIGN); absent ⇒ the engine's baked defaults. */
  readonly memoryConfig?: MemoryConfig | null;
  /** The host's turn-behavior arm (FOREIGN — `UserSettings.chat`). Default all-off ⇒ no custom
   *  stops, no auto-continue, no auto-swipe (byte-identical to today). */
  readonly chatBehavior?: ChatBehaviorInputs;
  /** The resolved connection every turn runs on (its capability's `turns` facts drive SHAPE's system-row
   *  delivery). Default the keyless test endpoint. */
  readonly connection?: Resolved<"chat">;
  /** Capture each wire `TurnRequest` before the tape replays (feeds `assertStaticPrefixStable`). */
  readonly onRequest?: (req: TurnRequest) => void;
  /** A REAL bus emit to run BESIDE the in-memory `events` recorder (e.g. `createChatBus(ctx).emit`) — for the
   *  tests that need the durable `chat_events` write itself, not just the event stream (the delete-mid-turn FK
   *  race). Awaited after the recorder push; omitted ⇒ recorder only. */
  readonly emit?: (event: DurableChatBusEvent) => Promise<unknown>;
  /** Extra `ChatContext` overrides merged over the defaults (an escape hatch for a seam the driver doesn't
   *  surface — `readPresence`, `resolveSeatDeco`, …). Applied AFTER the driver's own wiring. */
  readonly ctx?: Partial<ChatContext>;
  /** Override the FOREIGN resolver (preset/persona/settings). The default returns `personas`/`promptConfig`
   *  verbatim; supply this to SPY on the chat-supplied keys (`trigger`/`anchorPersonaId`) or to resolve
   *  `active` per-triggerer, the way the real composition root does. (There is no `personaIds` key to spy on
   *  since 2026-08-07 — the retired `personaIds[0]` fallback was its only reader; the room's present-human
   *  persona list still exists CHAT-side for the gather, it just never reaches this op.) */
  readonly resolveForeignInputs?: ResolveForeignInputsOp;
}

/** Per-`send` overrides. Default caller = the host; default persona attribution = the participant's active. */
export interface SendOptions {
  readonly principal?: Principal;
  readonly personaId?: PersonaId | null;
  readonly guided?: GuidedSteer;
}

/** The live driver a `scenario.chat` returns — the wired turn verbs + the recorders + the seeded ids. */
export interface ChatScenario {
  readonly db: Db;
  readonly ctx: ChatContext;
  readonly chatId: ChatId;
  /** The host user (the D19 funding id; the default `send` caller). */
  readonly host: UserId;
  /** The seeded roster character ids, in join order. */
  readonly chars: readonly CharacterId[];
  /** characterId → display name (the `getCard`/`@mention` map). */
  readonly names: Readonly<Record<string, string>>;
  /** Every bus event the engine/verbs emitted, in order (turnStarted/delta/messageCommitted/…). */
  readonly events: readonly DurableChatBusEvent[];
  /** Every stats delta the canon-mutators pushed (economics accounting). */
  readonly statsDeltas: readonly StatsDelta[];
  /** Every wire `TurnRequest` the tape saw, in turn order (for `assertStaticPrefixStable`). */
  readonly requests: readonly TurnRequest[];
  /** The raw turn-verb bundle (`send`/`swipe`/`continueTurn`/`impersonate`/`generate`/`forceCharacterTurn`/…). */
  readonly turn: ReturnType<typeof createTurn>;
  /** The NON-HUMAN turn seam (automation / plugin): a turn with no triggering human, over the same deps. */
  readonly requestTurn: RequestTurnOp;
  readonly activeTurns: ActiveTurns;
  /** A `Principal` for a seeded user (default the host) — for member/stranger arms. */
  readonly principal: (userId?: UserId) => Principal;
  /** Convenience: `turn.send` as the host by default (the single-turn proof shape). */
  readonly send: (content: string, options?: SendOptions) => Promise<TurnOutcome>;
  /** The persisted canon, re-read from the real db (never the in-memory return value). */
  readonly loadCanon: () => Promise<readonly MessageView[]>;
}

function principalOf(userId: UserId): Principal {
  return { userId, role: "user", handle: castId<Handle>("h"), externalId: null, via: "cookie" };
}

/** Seed a host + a `policy`/`output` room with N characters; returns the ids + the name map. */
async function seedRoom(
  db: Db,
  options: ChatScenarioOptions,
): Promise<{
  host: UserId;
  chatId: ChatId;
  chars: CharacterId[];
  names: Record<string, string>;
}> {
  const characters = options.characters ?? ["aria"];
  const host = await seedUser(db, castId<Handle>("host"));
  const group: Record<string, unknown> = {
    output: options.output ?? "per-speaker",
    policy: options.policy ?? "natural",
    ...(options.cardScope !== undefined ? { cardScope: options.cardScope } : {}),
    ...(options.autoMode === true ? { autoMode: true, autoModeMaxTurns: options.autoModeMaxTurns ?? 2, autoModeDelayMs: 0 } : {}),
  };
  const chatId = await seedChat(db, "a", { metadata: { group } });
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  const chars: CharacterId[] = [];
  const names: Record<string, string> = {};
  for (const key of characters) {
    const characterId = await seedCharacter(db, host, key);
    await seedParticipant(db, {
      chatId,
      key,
      characterId,
      joinSeq: 0,
      disabled: options.disabledKeys?.includes(key) ?? false,
    });
    chars.push(characterId);
    names[characterId] = key;
  }
  return { host, chatId, chars, names };
}

/** Build a live {@link ChatScenario}: seed the room, wire the tape as `runChatTurn` + the recorders, and return
 *  the real turn verbs. The db is seeded and the verbs are ready to drive on return. */
async function buildChatScenario(script: Tape, options: ChatScenarioOptions): Promise<ChatScenario> {
  const db = options.db ?? (await freshDb());
  const { host, chatId, chars, names } = await seedRoom(db, options);

  const events: DurableChatBusEvent[] = [];
  const statsDeltas: StatsDelta[] = [];
  const requests: TurnRequest[] = [];

  const ctx = makeChatContext(db, {
    runChatTurn: scriptedRunner(script, {
      onRequest: (req) => {
        requests.push(req);
        options.onRequest?.(req);
      },
    }),
    applyStatsDelta: (_batch: unknown, _db: Db, delta: StatsDelta): void => {
      statsDeltas.push(delta);
    },
    getCard: ({ characterId }) => Promise.resolve(cardOf(names[characterId] ?? "Unknown")),
    mintSyntheticGroupCharacter: () => Promise.resolve({ characterId: castId<CharacterId>("character_group") }),
    ...options.ctx,
  });

  // DURABLE only: this seam drives the turn engine, whose every emit is appended to `chat_events`. The
  // live-only lane (`roomEntityChanged`) never passes through a turn.
  const emit = async (event: DurableChatBusEvent): Promise<void> => {
    events.push(event);
    await options.emit?.(event);
  };
  const engine = createTurnEngine(ctx, {
    emit,
    holder: "replica-1",
    lockTtlMs: 60_000,
    generateSegments: () => Promise.resolve({ written: 0, skipped: 0 }),
    generateDigests: () => Promise.resolve({ written: 0, skipped: 0 }),
    loadWitnessHorizons,
    recallMemory,
    // Managed compaction is agent-sdk + over-threshold only; a scenario turn never invokes it, but the engine
    // now REQUIRES the dep — a no-op stub.
    runCompaction: () => Promise.resolve({ summary: "", compactedAtSeq: 0, updated: false }),
  });

  const defaultForeign: ResolveForeignInputsOp = (): ReturnType<ResolveForeignInputsOp> =>
    Promise.resolve({
      promptConfig: options.promptConfig ?? DEFAULT_PROMPT_CONFIG,
      // The host is the room's only human by default, so it owns the active persona (the anchor human).
      personas: { ...(options.personas ?? DEFAULT_PERSONAS), activeUserId: host },
      globalRegexScripts: options.hostRegexScripts ?? [],
      scanDepth: options.scanDepth ?? 6,
      injectionTokenBudget: options.injectionTokenBudget ?? 0,
      ...(options.memoryConfig !== undefined ? { memoryConfig: options.memoryConfig } : {}),
      chatBehavior: options.chatBehavior ?? DEFAULT_CHAT_BEHAVIOR,
    });
  const resolveForeignInputs = options.resolveForeignInputs ?? defaultForeign;

  const activeTurns = createActiveTurns();
  const turnDeps: Parameters<typeof createTurn>[1] = {
    engine,
    activeTurns,
    emit,
    prng: seededPrng(),
    delay: () => Promise.resolve(),
    resolveConnection: () => Promise.resolve(options.connection ?? connectionOf()),
    resolveForeignInputs,
    // The REAL claim chokepoint (R0), not a stub: a turn driven through this harness claims its room exactly
    // as production does, so every suite riding the scenario covers the send/generate claim arms for free.
    claimChat: createClaimChat(ctx),
  };
  const turn = createTurn(ctx, turnDeps);

  return {
    db,
    ctx,
    chatId,
    host,
    chars,
    names,
    events,
    statsDeltas,
    requests,
    turn,
    requestTurn: createRequestTurn(ctx, turnDeps),
    activeTurns,
    principal: (userId = host) => principalOf(userId),
    send: (content, sendOptions = {}) =>
      turn.send({
        principal: sendOptions.principal ?? principalOf(host),
        chatId,
        content,
        ...(sendOptions.personaId !== undefined ? { personaId: sendOptions.personaId } : {}),
        ...(sendOptions.guided !== undefined ? { guided: sendOptions.guided } : {}),
      }),
    loadCanon: () => loadCanonHistory(db, chatId),
  };
}

/** The scenario entry point — `scenario.chat(tape, opts)` wires a live, real-DB chat driver from a tape. */
export const scenario = {
  chat: (script: Tape, options: ChatScenarioOptions = {}): Promise<ChatScenario> => buildChatScenario(script, options),
};
