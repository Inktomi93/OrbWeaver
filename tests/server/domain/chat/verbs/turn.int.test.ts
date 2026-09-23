// verbs/turn — the turn-running front doors (.int: real libSQL for the lock + the D26 canon persist + a REAL
// engine via `createTurnEngine`). Proves the wiring: identity triple → connection → ONE assemble ctx →
// arbitrate → driveRound; the group round (N speakers), @mention force, auto-mode chaining, send's solo
// (roster-of-1) path, host-only force, abort's owner-only refusal, and the `can()` default-deny. Determinism:
// frozen clock, seeded prng, no-op delay (D46) — no ambient clock / RNG.

import type { CharacterCard } from "@orb/contracts/character";
import type { AssemblePersona, ChatBusEvent } from "@orb/contracts/chat";
import { AUTOMATION_DEPTH_HARD_CAP } from "@orb/contracts/chat";
import type { Can, Principal } from "@orb/contracts/identity";
import type { NormalizedFinishReason } from "@orb/contracts/inference";
import type { NotificationEvent } from "@orb/contracts/notifications";
import type { PromptConfig, PromptSection, UserMacroSpec } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { RegexScriptRow } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { chatParticipants, chats, personaBooks, personas, statsCanonVersions, worldBooks, worldEntries } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import type { Resolved } from "@orb/inference";
import { generationOf } from "@orb/inference";
import type { CharacterId, ChatId, Handle, MessageId, PersonaId, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { resolveRowMacros } from "@orb/kit/macro";
import { initTracing, recentTraces, withRequestSpan } from "@orb/server/foundation/observability";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createActiveTurns } from "../../../../../packages/server/src/domain/chat/active-turns.ts";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/context.ts";
import { ChatNotFoundError } from "../../../../../packages/server/src/domain/chat/contract/errors.ts";
import type { ChatBehaviorInputs } from "../../../../../packages/server/src/domain/chat/contract/foreign.ts";
import type { TurnRequest, TurnStreamChunk } from "../../../../../packages/server/src/domain/chat/contract/results.ts";
import { createTurnEngine } from "../../../../../packages/server/src/domain/chat/engine/engine.ts";
import { loadWitnessHorizons } from "../../../../../packages/server/src/domain/chat/memory/persistence/queries.ts";
import { recallMemory } from "../../../../../packages/server/src/domain/chat/memory/recall/recall.ts";
import { loadPendingTurns, loadPendingTurnsForReclaim } from "../../../../../packages/server/src/domain/chat/persistence/invites.ts";
import { tryAcquireLock } from "../../../../../packages/server/src/domain/chat/persistence/lock.ts";
import {
  loadCanonHistory,
  loadMaxMessageSeq,
  loadMessageView,
  loadSlotTarget,
  loadTurnOrigin,
} from "../../../../../packages/server/src/domain/chat/persistence/queries.ts";
import { createClaimChat } from "../../../../../packages/server/src/domain/chat/verbs/claim-chat.ts";
import { createRequestTurn, createTurn } from "../../../../../packages/server/src/domain/chat/verbs/turn.ts";
import { bumpStatsCanonVersion } from "../../../../../packages/server/src/domain/stats/write/apply-delta.ts";
import { createToolUseService, createToolUseTeachingContributions } from "../../../../../packages/server/src/domain/tool-use/index.ts";
import { freshDb } from "../../../../support/db.ts";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { makeCapability } from "../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId } from "../../../../support/inference-identities.ts";
import {
  FROZEN_AT,
  makeChatContext,
  seedCharacter,
  seedChat,
  seedMessage,
  seedParticipant,
  seedPendingTurn,
  seedUser,
  stubRunCompaction,
  testConnection,
} from "../_support.ts";

// A minimal `getCard` stub double — only `name`/`description` are load-bearing to this mirror's
// assertions (speaker-name/prompt resolution); the rest of the full card schema is never read here.
// @orb-waive no-test-fabrication(unknown): see above. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
const card = (name: string): CharacterCard => ({ name, description: "", avatarAssetId: null, regexScripts: [] }) as unknown as CharacterCard;

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

/** Transfer the one host seat while keeping both humans present. */
async function transferHost(chatId: ChatId, from: UserId, to: UserId): Promise<void> {
  await db
    .update(chatParticipants)
    .set({ role: "member" })
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, from)));
  await db
    .update(chatParticipants)
    .set({ role: "host" })
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, to)));
}

/** Minimal rpg collaborator that records the initiator owning each completed turn. */
function triggeredBySpyRpg(): { triggeredBy: UserId[]; rpg: NonNullable<ChatContext["rpg"]> } {
  const triggeredBy: UserId[] = [];
  const unreachable = (): never => {
    throw new Error("test: unexpected RPG collaborator call");
  };
  const rpg: NonNullable<ChatContext["rpg"]> = {
    planGameBirth: unreachable,
    gameBirthCommitted: unreachable,
    resolvePresetOverride: () => Promise.resolve(null),
    resolveUserMacros: () => Promise.resolve([]),
    gatherTurnContext: () => Promise.resolve(null),
    markDicePreRollEligible: () => undefined,
    onUserCommit: () => Promise.resolve(),
    onTurnCompleted: (...args: Parameters<NonNullable<ChatContext["rpg"]>["onTurnCompleted"]>) => {
      triggeredBy.push(args[4].triggeredBy);
      return Promise.resolve();
    },
    onTurnAborted: () => Promise.resolve(),
    cancelStateRounds: () => 0,
    resolveGmSeatHolderKind: () => Promise.resolve(null),
    resolveReasoningHostOnly: () => Promise.resolve(false),
    forkGame: () => Promise.resolve({ cloned: false }),
    handoffHealStatements: () => Promise.resolve([]),
    handoffWouldCopyGmPreset: () => Promise.resolve(false),
    handoffRekeyActors: () => Promise.resolve(),
  };
  return { triggeredBy, rpg };
}

/** A scripted role turn — text delta + a terminal `final` carrying the content/economics. */
function scripted(content: string, finishReason?: NormalizedFinishReason): ChatContext["runChatTurn"] {
  return () =>
    (async function* (): AsyncGenerator<TurnStreamChunk> {
      await Promise.resolve();
      yield { kind: "text", text: content };
      yield {
        kind: "final",
        economics: { content, tokensIn: 4, tokensOut: 2, model: testModelId("test-model"), ...(finishReason !== undefined ? { finishReason } : {}) },
      };
    })();
}

/** One scripted generation the reply-tape yields in order (PD-146 auto-behaviors run a follow-up turn, so a
 *  send fires ≥2 `runChatTurn` calls that must reply distinctly). */
interface ScriptedReply {
  readonly content: string;
  readonly finishReason?: NormalizedFinishReason;
}

/** A deterministic PRNG (Park-Miller LCG) — D46 (never `Math.random`). */
function seededPrng(seed = 1): () => number {
  let s = seed;
  return (): number => {
    s = (s * 16_807) % 2_147_483_647;
    return s / 2_147_483_647;
  };
}

// A frozen {{roll:d20}} bakes to a literal number; the identity {{user}} stays raw (per-view at read).
const FROZEN_ROLL_RE = /^I roll (\d+) and \{\{user\}\} smiles$/;
// A frozen {{time}} bakes to the send-time clock (HH:mm:ss); server-local zone, so assert the SHAPE.
const FROZEN_TIME_RE = /^the time is \d{2}:\d{2}:\d{2}$/;

const PERSONAS: { anchor: AssemblePersona | null; active: AssemblePersona | null } = {
  anchor: { name: "Alex", description: "the user" },
  active: { name: "Alex", description: "the user" },
};

interface Harness {
  ctx: ChatContext;
  events: ChatBusEvent[];
  deltas: StatsDelta[];
  notifications: NotificationEvent[];
  connectionFunders: UserId[];
  turn: ReturnType<typeof createTurn>;
  requestTurn: ReturnType<typeof createRequestTurn>;
  activeTurns: ReturnType<typeof createActiveTurns>;
}

function harness(
  database: Db,
  names: Readonly<Record<string, string>>,
  over: {
    content?: string;
    groupCharacterId?: CharacterId;
    hostTierRegexScripts?: RegexScriptRow[];
    /** Capture each wire `TurnRequest` (the guided-routing pins inspect the assembled prompt). */
    onChatRequest?: (request: unknown) => void;
    /** Observe every bus emit AS IT HAPPENS — `h.events` is only readable after the send settles, so an
     *  ORDERING pin (the S1 rpg-fire-before-turnCompleted one) needs the live hook to interleave markers. */
    onEmit?: (event: ChatBusEvent) => void;
    /** Override the resolved `PromptConfig` (the F1 injection_trigger pin drives trigger-gated sections). */
    promptConfig?: PromptConfig;
    /** Capture the args `loadRoom` resolved into the FOREIGN read for the round. */
    onForeignInputs?: (args: { readonly presentHumanUserIds: readonly UserId[] }) => void;
    /** Override server-derived presence (default = everyone online; a presence-gating test marks a member away). */
    readPresence?: ChatContext["readPresence"];
    /** Override the disabled-account gate (default = everyone enabled; the containment test disables a
     *  member). */
    resolveUserEnabled?: ChatContext["resolveUserEnabled"];
    /** A per-call reply sequence (PD-146 auto-behavior pins: the send fires a follow-up turn). Each
     *  `runChatTurn` call yields the next reply; the last repeats once exhausted. Overrides `content`. */
    replyTape?: readonly ScriptedReply[];
    /** The host's PD-146 turn-behavior arm (custom stops + auto-continue/auto-swipe). Default all-off. */
    chatBehavior?: ChatBehaviorInputs;
    /** Override the round PRNG (default `seededPrng()`). The WAVE MU delivery pins seed distinct draws across
     *  chats to prove a NEW turn draws FRESH (a different pool pick), independent of a prior turn's frozen draw. */
    prng?: () => number;
    /** Replace the provider stream entirely (the return-based-abort pin injects one that honors the signal). */
    runChatTurn?: ChatContext["runChatTurn"];
    /** The `smart` policy's side-LLM turn arbiter (default = the throwing `notStubbed` — every non-smart
     *  room must never reach it). The smart-policy pins script it (a pick, or an outage). */
    summarize?: ChatContext["summarize"];
    /** The injected rpg turn ops (default null = not wired, byte-identical). The R1 folded-extraction pin
     *  wires a stub whose gather contributes TERMINAL tools, to prove the whole gather→prep→wire→flush thread. */
    rpg?: ChatContext["rpg"];
    /** Override the resolved connection wholesale (the R1 pin needs a TOOLS-capable capability, which
     *  `testConnection`'s minimal descriptor deliberately lacks). */
    connection?: Resolved<"chat">;
    /** Override connection resolution while retaining the ordered funder capture. */
    resolveConnection?: Parameters<typeof createTurn>[1]["resolveConnection"];
    /** The S2 teaching registry (default = the composition root's own: chat's rpg-gather projection). The R2
     *  attach-matrix pins add a contribution that DECLARES a registry tool name. */
    teaching?: ChatContext["teaching"];
    /** The tool-use ops (default null = not wired). The R2 attach pins wire a fake so the declared name can
     *  actually resolve to a wire tool. */
    tools?: ChatContext["tools"];
  } = {},
): Harness {
  const events: ChatBusEvent[] = [];
  const deltas: StatsDelta[] = [];
  const notifications: NotificationEvent[] = [];
  const connectionFunders: UserId[] = [];
  let replyIdx = 0;
  const ctx = makeChatContext(database, {
    // D121-E: the host-tier regex set reaches a turn through the injected four-scope resolver, not through
    // ForeignInputs. The harness feeds the override in as the GLOBAL slice — the same tier the old
    // `globalRegexScripts` field modelled, so the pins it carries keep asserting the same thing.
    resolveRegexSources: () => Promise.resolve({ hostGlobal: over.hostTierRegexScripts ?? [], preset: [], character: [], chat: [] }),
    runChatTurn: (request) => {
      over.onChatRequest?.(request);
      if (over.runChatTurn !== undefined) {
        return over.runChatTurn(request);
      }
      if (over.replyTape !== undefined && over.replyTape.length > 0) {
        const reply = over.replyTape[Math.min(replyIdx, over.replyTape.length - 1)];
        replyIdx += 1;
        return scripted(reply?.content ?? "Hi there", reply?.finishReason)(request);
      }
      return scripted(over.content ?? "Hi there")(request);
    },
    applyStatsDelta: (_b: unknown, _d: Db, delta: StatsDelta): void => {
      deltas.push(delta);
    },
    bumpStatsCanonVersion: (batch, deltaDb, ownerId) => bumpStatsCanonVersion(batch as BatchStmt[], deltaDb, ownerId),
    getCard: ({ characterId }) => Promise.resolve(card(names[characterId] ?? "Unknown")),
    mintSyntheticGroupCharacter: () =>
      Promise.resolve({
        characterId: over.groupCharacterId ?? castId<CharacterId>("character_group"),
      }),
    // Record every emitted notification (the drop-path asserts the deferred-turn-dropped delivery). The drop
    // emit carries no co-statements, so recording + resolving is the whole contract here.
    emitNotification: (event) => {
      notifications.push(event);
      return Promise.resolve();
    },
    ...(over.readPresence !== undefined ? { readPresence: over.readPresence } : {}),
    ...(over.resolveUserEnabled !== undefined ? { resolveUserEnabled: over.resolveUserEnabled } : {}),
    ...(over.summarize !== undefined ? { summarize: over.summarize } : {}),
    ...(over.rpg !== undefined ? { rpg: over.rpg } : {}),
    ...(over.teaching !== undefined ? { teaching: over.teaching } : {}),
    ...(over.tools !== undefined ? { tools: over.tools } : {}),
  });
  const emit = (event: ChatBusEvent): Promise<void> => {
    events.push(event);
    over.onEmit?.(event);
    return Promise.resolve();
  };
  const engine = createTurnEngine(ctx, {
    emit,

    holder: "replica-1",
    lockTtlMs: 60_000,
    generateSegments: async () => ({ written: 0, skipped: 0 }),
    generateDigests: async () => ({ written: 0, skipped: 0 }),
    loadWitnessHorizons,
    recallMemory,
    runCompaction: stubRunCompaction,
  });
  const activeTurns = createActiveTurns();
  const turnDeps: Parameters<typeof createTurn>[1] = {
    engine,
    activeTurns,
    emit,
    // The REAL claim chokepoint (R0) — a turn claims its room in production, so the turn suite drives the
    // real one. Every chat these tests seed is born CLAIMED, so it is a no-op and nothing here shifts.
    claimChat: createClaimChat(ctx),
    prng: over.prng ?? seededPrng(),
    delay: () => Promise.resolve(),
    resolveConnection: (args) => {
      connectionFunders.push(args.funderUserId);
      return over.resolveConnection?.(args) ?? Promise.resolve(over.connection ?? testConnection("vllm"));
    },
    resolveForeignInputs: (args) => {
      over.onForeignInputs?.(args);
      return Promise.resolve({
        promptConfig: over.promptConfig ?? DEFAULT_PROMPT_CONFIG,
        personas: PERSONAS,
        scanDepth: 6,
        injectionTokenBudget: 0,
        ...(over.chatBehavior !== undefined ? { chatBehavior: over.chatBehavior } : {}),
      });
    },
  };
  const turn = createTurn(ctx, turnDeps);
  const requestTurn = createRequestTurn(ctx, turnDeps);
  return { ctx, events, deltas, notifications, connectionFunders, turn, requestTurn, activeTurns };
}

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

/** Drain `impersonateStream`'s delta iterable to the accumulated text (the composer-fill result). The
 *  participant gate runs on the first `.next()`, so a non-member's iteration rejects before yielding. */
async function drainImpersonation(iter: AsyncIterable<{ readonly delta: string }>): Promise<string> {
  let text = "";
  for await (const { delta } of iter) {
    text += delta;
  }
  return text;
}

/** Seed a host + a `policy` group chat with N characters; returns the ids. */
async function seedRoom(
  policy: string,
  charKeys: readonly string[],
  opts: {
    output?: string;
    autoMode?: boolean;
    autoModeMaxTurns?: number;
    /** The room's self-response toggle ("Let a character reply to itself") — lifts the ban-last, nothing else. */
    allowSelfResponses?: boolean;
    /** Character keys seeded MUTED (`disabled: true`) — #29's force-turn-on-muted pin. */
    disabledKeys?: readonly string[];
  } = {},
): Promise<{ host: UserId; chatId: ChatId; chars: CharacterId[]; names: Record<string, string> }> {
  const host = await seedUser(db, castId<Handle>("host"));
  const group: Record<string, unknown> = {
    output: opts.output ?? "per-speaker",
    policy,
    ...(opts.autoMode === true ? { autoMode: true, autoModeMaxTurns: opts.autoModeMaxTurns ?? 2, autoModeDelayMs: 0 } : {}),
    ...(opts.allowSelfResponses === true ? { allowSelfResponses: true } : {}),
  };
  const chatId = await seedChat(db, "a", { metadata: { group } });
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  const chars: CharacterId[] = [];
  const names: Record<string, string> = {};
  for (const k of charKeys) {
    const cid = await seedCharacter(db, host, k);
    await seedParticipant(db, {
      chatId,
      key: k,
      characterId: cid,
      joinSeq: 0,
      disabled: opts.disabledKeys?.includes(k) ?? false,
    });
    chars.push(cid);
    names[cid] = k;
  }
  return { host, chatId, chars, names };
}

/** Seed a persona row (the `chat_participants.activePersonaId` FK target). */
async function seedPersona(ownerId: UserId, key: string): Promise<PersonaId> {
  const id = castId<PersonaId>(`persona_${key}`);
  await db.insert(personas).values({ id, ownerId, name: key, description: "" });
  return id;
}

describe("send — the solo path (roster-of-1)", () => {
  test("commits the user row + the assistant turn; emits the lifecycle", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "hello" });

    expect(outcome.aborted).toBe(false);
    expect(outcome.messages).toHaveLength(2);
    expect(outcome.messages[0]?.role).toBe("user");
    expect(outcome.messages[0]?.content).toBe("hello");
    expect(outcome.messages[0]?.authorUserId).toBe(host);
    expect(outcome.messages[1]?.role).toBe("assistant");
    expect(outcome.messages[1]?.content).toBe("Hi there");

    const canon = await loadCanonHistory(db, chatId);
    expect(canon.map((m) => m.seq)).toEqual([1, 2]);
    expect(canon.map((m) => m.role)).toEqual(["user", "assistant"]);
    const types = h.events.map((e) => e.type);
    expect(types).toContain("messageCommitted");
    expect(types).toContain("turnStarted");
    expect(types).toContain("turnCompleted");
  });
});

// `commitMessage` — the D56 "Simple Send" / post-without-generate lever: `send`'s COMMIT half (trust
// boundaries + persist + first-user-turn greeting freeze + rpg user-commit) with NO AI round. The verb shares
// the exact `commitUserTurn` helper `send` calls, so these pins guard that shared front-half AND the "no turn
// follows" contract.
describe("commitMessage — post-without-generate (D56)", () => {
  test("commits the user row + emits messageCommitted; NO assistant row generated", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    let generations = 0;
    const h = harness(db, names, {
      onChatRequest: () => {
        generations += 1;
      },
    });

    const outcome = await h.turn.commitMessage({ principal: principal(host), chatId, content: "hello" });

    expect(outcome.aborted).toBe(false);
    expect(outcome.messages).toHaveLength(1);
    expect(outcome.messages[0]?.role).toBe("user");
    expect(outcome.messages[0]?.content).toBe("hello");
    expect(outcome.messages[0]?.authorUserId).toBe(host);

    // Canon holds exactly the one user row — no assistant follows, no generation fired.
    const canon = await loadCanonHistory(db, chatId);
    expect(canon.map((m) => m.role)).toEqual(["user"]);
    expect(generations).toBe(0);
    const types = h.events.map((e) => e.type);
    expect(types).toContain("messageCommitted");
    expect(types).not.toContain("turnStarted");
    expect(types).not.toContain("turnCompleted");
  });

  test("the first-user-turn greeting-volatile FREEZE still runs ({{roll}} baked, {{user}} raw)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);

    await h.turn.commitMessage({ principal: principal(host), chatId, content: "I roll {{roll:d20}} and {{user}} smiles" });

    const stored = (await loadCanonHistory(db, chatId)).find((r) => r.role === "user")?.content ?? "";
    expect(stored.match(FROZEN_ROLL_RE)).not.toBeNull();
    expect(stored).toContain("{{user}}");
    expect(stored).not.toContain("{{roll");
  });

  test("the first-user turn fences a prior greeting content freeze", async () => {
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria"]);
    await seedMessage(db, chatId, 1, { role: "assistant", characterId: chars[0] as CharacterId, content: "A {{roll:d20}} appears" });
    const h = harness(db, names);

    await h.turn.commitMessage({ principal: principal(host), chatId, content: "hello" });

    expect((await db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, host)))[0]?.version).toBe(1);
  });

  test("an EXPLICIT foreign personaId is refused not_persona_owner — nothing committed (the trust boundary)", async () => {
    const { chatId, names } = await seedRoom("natural", ["aria"]);
    const member = await seedUser(db, castId<Handle>("member"));
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const stranger = await seedUser(db, castId<Handle>("stranger"));
    const foreignPersona = await seedPersona(stranger, "stranger_pov");
    const h = harness(db, names);

    await expect(h.turn.commitMessage({ principal: principal(member), chatId, content: "hi", personaId: foreignPersona })).rejects.toMatchObject({
      code: "not_persona_owner",
    });
    expect((await loadCanonHistory(db, chatId)).filter((m) => m.role === "user")).toHaveLength(0);
  });

  test("a non-member is refused (leak-free NOT_FOUND — the membership gate)", async () => {
    const { chatId, names } = await seedRoom("natural", ["aria"]);
    const stranger = await seedUser(db, castId<Handle>("stranger"));
    const h = harness(db, names);

    await expect(h.turn.commitMessage({ principal: principal(stranger), chatId, content: "hi" })).rejects.toBeInstanceOf(ChatNotFoundError);
    expect((await loadCanonHistory(db, chatId)).filter((m) => m.role === "user")).toHaveLength(0);
  });
});

describe("send — a caller-cancelled turn RETURNS aborted (the return-based abort reaches the verb)", () => {
  test("aborted:true + reason reach the send return; the user row still committed, no assistant row", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    // A REAL caller cancel, through the seam that owns one (#1435): the user presses Stop mid-generation
    // (`activeTurns.abort`), and the provider then honors the threaded signal by throwing its name-based
    // AbortError. The cancellation is proven by the ABORTED SIGNAL — an error's name alone is a provider
    // fault, not a user action, and is deliberately no longer classifiable as one.
    let cancel: () => void = () => undefined;
    const aborting: ChatContext["runChatTurn"] = () =>
      (async function* (): AsyncGenerator<TurnStreamChunk> {
        cancel();
        await Promise.reject(Object.assign(new Error("request aborted"), { name: "AbortError" }));
        yield { kind: "text", text: "unreachable" };
      })();
    const h = harness(db, names, { runChatTurn: aborting });
    cancel = (): void => {
      h.activeTurns.abort(chatId, host);
    };

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "hello" });

    // The previously-dead turn.ts abort branch now carries real values.
    expect(outcome.aborted).toBe(true);
    expect(outcome.abortReason).toBe("user");
    // The user row committed before the AI turn; the aborted assistant turn added no row.
    expect(outcome.messages).toHaveLength(1);
    expect(outcome.messages[0]?.role).toBe("user");
    const canon = await loadCanonHistory(db, chatId);
    expect(canon.map((m) => m.role)).toEqual(["user"]);
    // The turnAborted bus event still fired (the UI's learn-of-abort path).
    expect(h.events.map((e) => e.type)).toContain("turnAborted");
    expect(h.events.map((e) => e.type)).not.toContain("turnCompleted");
  });
});

describe("send — volatile-macro FREEZE at commit (Chat-Macro-Resolution §0 / the D51 refinement)", () => {
  test("a user message freezes {{roll}} to a baked value while {{user}} stays raw (per-view)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);

    await h.turn.send({
      principal: principal(host),
      chatId,
      content: "I roll {{roll:d20}} and {{user}} smiles",
    });

    const canon = await loadCanonHistory(db, chatId);
    const stored = canon.find((r) => r.role === "user")?.content ?? "";
    // The nondeterministic {{roll}} is FROZEN to a literal number in canon; the identity {{user}} stays RAW.
    const matched = stored.match(FROZEN_ROLL_RE);
    expect(matched).not.toBeNull();
    expect(stored).toContain("{{user}}");
    expect(stored).not.toContain("{{roll");

    // Re-rendering the stored row on a later turn is byte-stable on the roll AND resolves {{user}} LIVE at
    // read (identity is not baked): the null-stamp fallback is the chat ANCHOR (ruling A — viewer-independent,
    // so the SAME string for the model and every human), and changing the anchor changes the name while the
    // frozen roll is untouched.
    const frozenRoll = matched?.[1];
    const view = (anchorName: string): string =>
      resolveRowMacros(
        stored,
        { characterId: null, personaId: null },
        {
          characterNamesById: new Map<CharacterId, RowCharacterName>(),
          personaNamesById: new Map<PersonaId, RowPersonaName>(),
          fallbackPersonaName: anchorName,
        },
      );
    expect(view("Zara")).toBe(`I roll ${frozenRoll} and Zara smiles`);
    expect(view("Yuki")).toBe(`I roll ${frozenRoll} and Yuki smiles`);
  });

  test("{{time}} freezes to the send-time clock value, not the raw macro", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);

    await h.turn.send({ principal: principal(host), chatId, content: "the time is {{time}}" });

    const stored = (await loadCanonHistory(db, chatId)).find((r) => r.role === "user")?.content ?? "";
    expect(stored).toMatch(FROZEN_TIME_RE);
    expect(stored).not.toContain("{{time}}");
  });

  test("a composer message with NO volatile macros is stored byte-identical (identity/author content untouched)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);
    const raw = "just {{user}} talking to {{char}}, no dice";

    await h.turn.send({ principal: principal(host), chatId, content: raw });

    expect((await loadCanonHistory(db, chatId)).find((m) => m.role === "user")?.content).toBe(raw);
  });
});

describe("send — user-row seq collision retry (U1: the seq TOCTOU is allocated outside the engine lock)", () => {
  test("a raced (chatId,seq) UNIQUE on the user insert re-derives the head and retries — nothing lost", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);

    // Simulate a concurrent same-chat send winning the head between THIS send's `loadMaxMessageSeq` and its
    // insert: on the FIRST `db.batch` (the user-row 3-step dance), a competing writer lands a row at the seq
    // this attempt was about to claim, then the batch fails the `(chatId,seq)` UNIQUE. persistUserMessage must
    // catch the unique violation, re-read the now-higher head, and re-commit — no lost message, no 500.
    let tripped = false;
    const racedDb = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === "batch") {
          return async (stmts: unknown) => {
            if (!tripped) {
              tripped = true;
              const claimed = (await loadMaxMessageSeq(db, chatId)) + 1;
              await seedMessage(db, chatId, claimed, {
                role: "user",
                authorUserId: host,
                content: "racer",
              });
              throw new Error("SQLITE_CONSTRAINT: UNIQUE constraint failed: messages.chat_id, seq");
            }
            return (target as Db).batch(stmts as never);
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as Db;

    const h = harness(racedDb, names);
    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "hello" });

    expect(tripped).toBe(true); // the retry path actually fired
    const canon = await loadCanonHistory(db, chatId);
    // The racer took seq 1; this send's user row retried onto seq 2, the assistant onto seq 3 — none dropped.
    expect(canon.map((m) => m.content)).toEqual(["racer", "hello", "Hi there"]);
    expect(canon.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(outcome.messages[0]?.content).toBe("hello");
    expect(outcome.messages[0]?.seq).toBe(2);
  });
});

describe("send — presence character-gating (PD-70)", () => {
  /** Seed a host + an away member (each with a persona) + one character; return the ids + persona ids. */
  async function seedTwoHumanRoom(): Promise<{
    host: UserId;
    member: UserId;
    chatId: ChatId;
    hostPersona: PersonaId;
    memberPersona: PersonaId;
    names: Record<string, string>;
  }> {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const hostPersona = await seedPersona(host, "host_pov");
    const memberPersona = await seedPersona(member, "member_pov");
    const chatId = await seedChat(db, "a", {
      metadata: { group: { output: "per-speaker", policy: "natural" } },
    });
    await seedParticipant(db, {
      chatId,
      key: "h",
      userId: host,
      role: "host",
      activePersonaId: hostPersona,
    });
    await seedParticipant(db, {
      chatId,
      key: "m",
      userId: member,
      role: "member",
      activePersonaId: memberPersona,
    });
    const cid = await seedCharacter(db, host, "aria");
    await seedParticipant(db, { chatId, key: "aria", characterId: cid, joinSeq: 0 });
    return { host, member, chatId, hostPersona, memberPersona, names: { [cid]: "aria" } };
  }

  /** Attach a keyless (always-on) persona-scoped world book whose entry carries a unique marker, so the
   *  round's WI pool decides whether that marker reaches the wire. */
  async function seedPersonaLore(owner: UserId, personaId: PersonaId, key: string, content: string): Promise<void> {
    const bookId = castId<WorldBookId>(`world_book_${key}`);
    await db.insert(worldBooks).values({ id: bookId, ownerId: owner, name: key, createdAt: FROZEN_AT });
    await db.insert(worldEntries).values({
      id: castId<WorldEntryId>(`world_entry_${key}`),
      worldBookId: bookId,
      title: key,
      content,
      keys: null,
      enabled: true,
      priority: 0,
      ignoreBudget: false,
      metadata: null,
      createdAt: FROZEN_AT,
    });
    await db.insert(personaBooks).values({ personaId, worldBookId: bookId, createdAt: FROZEN_AT });
  }

  // These two used to observe the `personaIds` list on the FOREIGN op's ARGS. That list stopped reaching the
  // op when the `personaIds[0]` absent-trigger fallback was retired (2026-08-07) — it was the fallback's only
  // reader — so the pin now asserts the CONSEQUENCE the presence filter exists for: which persona BOOKS join
  // the round's world-info pool. Stronger than the old shape (it proves the gate's effect on the wire, not
  // that a list was handed to a function that ignored it).
  test("an OFFLINE human's persona-book lore drops from the round; the host's survives", async () => {
    const room = await seedTwoHumanRoom();
    await seedPersonaLore(room.host, room.hostPersona, "hostlore", "HOST-POV-LORE");
    await seedPersonaLore(room.member, room.memberPersona, "memberlore", "MEMBER-POV-LORE");
    let wire = "";
    const h = harness(db, room.names, {
      onChatRequest: (req) => {
        wire = JSON.stringify(req);
      },
      // The member is away (no live SSE); the host is driving the turn.
      readPresence: (userId) => Promise.resolve({ userId, online: userId !== room.member, lastSeenAt: null }),
    });

    await h.turn.send({ principal: principal(room.host), chatId: room.chatId, content: "hi" });

    expect(wire).toContain("HOST-POV-LORE");
    expect(wire).not.toContain("MEMBER-POV-LORE");
  });

  test("when BOTH humans are online, both persona books join the pool (no drop)", async () => {
    const room = await seedTwoHumanRoom();
    await seedPersonaLore(room.host, room.hostPersona, "hostlore", "HOST-POV-LORE");
    await seedPersonaLore(room.member, room.memberPersona, "memberlore", "MEMBER-POV-LORE");
    let wire = "";
    const h = harness(db, room.names, {
      onChatRequest: (req) => {
        wire = JSON.stringify(req);
      },
      readPresence: (userId) => Promise.resolve({ userId, online: true, lastSeenAt: null }),
    });

    await h.turn.send({ principal: principal(room.host), chatId: room.chatId, content: "hi" });

    expect(wire).toContain("HOST-POV-LORE");
    expect(wire).toContain("MEMBER-POV-LORE");
  });

  test("a DISABLED human's persona drops from the round's foreign-input consent set (owner-ruled 2026-08-15 containment gate)", async () => {
    const room = await seedTwoHumanRoom();
    let presentHumanUserIds: readonly UserId[] = [];
    const h = harness(db, room.names, {
      onForeignInputs: (args) => {
        presentHumanUserIds = args.presentHumanUserIds;
      },
      // The member's backing `users` row got admin-disabled — the host's did not.
      resolveUserEnabled: (userId) => Promise.resolve(userId !== room.member),
    });

    await h.turn.send({ principal: principal(room.host), chatId: room.chatId, content: "hi" });

    expect(presentHumanUserIds).toContain(room.host);
    expect(presentHumanUserIds).not.toContain(room.member);
  });

  test("when both humans are enabled, both remain in the foreign-input consent set (no drop)", async () => {
    const room = await seedTwoHumanRoom();
    let presentHumanUserIds: readonly UserId[] = [];
    const h = harness(db, room.names, {
      onForeignInputs: (args) => {
        presentHumanUserIds = args.presentHumanUserIds;
      },
    });

    await h.turn.send({ principal: principal(room.host), chatId: room.chatId, content: "hi" });

    expect(presentHumanUserIds).toContain(room.host);
    expect(presentHumanUserIds).toContain(room.member);
  });
});

describe("send / impersonate — persona attribution fallback (PD-100)", () => {
  /** Seed a solo room whose host carries an ACTIVE persona (+ a spare persona for the explicit-wins arm). */
  async function seedPersonaRoom(): Promise<{
    host: UserId;
    chatId: ChatId;
    hostPersona: PersonaId;
    spare: PersonaId;
    names: Record<string, string>;
  }> {
    const host = await seedUser(db, castId<Handle>("host"));
    const hostPersona = await seedPersona(host, "host_pov");
    const spare = await seedPersona(host, "spare_pov");
    const chatId = await seedChat(db, "a", {
      metadata: { group: { output: "per-speaker", policy: "natural" } },
    });
    await seedParticipant(db, {
      chatId,
      key: "h",
      userId: host,
      role: "host",
      activePersonaId: hostPersona,
    });
    const cid = await seedCharacter(db, host, "aria");
    await seedParticipant(db, { chatId, key: "aria", characterId: cid, joinSeq: 0 });
    return { host, chatId, hostPersona, spare, names: { [cid]: "aria" } };
  }

  test("an OMITTED personaId stamps the participant's activePersonaId (send); impersonateStream yields text, persisting nothing", async () => {
    const { host, chatId, hostPersona, names } = await seedPersonaRoom();
    const h = harness(db, names);

    const sent = await h.turn.send({ principal: principal(host), chatId, content: "hi" });
    expect(sent.messages[0]?.personaId).toBe(hostPersona);

    // impersonateStream is NON-PERSISTING: it STREAMS the drafted user line (resolved under the host's active
    // persona for `{{user}}`) and writes NO canon — the seq after the send round is unchanged.
    const seqBefore = await loadMaxMessageSeq(db, chatId);
    const text = await drainImpersonation(h.turn.impersonateStream({ principal: principal(host), chatId }));
    expect(text.length).toBeGreaterThan(0);
    expect(await loadMaxMessageSeq(db, chatId)).toBe(seqBefore);
  });

  test("an EXPLICIT personaId wins over the active persona; an explicit null stays null", async () => {
    const { host, chatId, spare, names } = await seedPersonaRoom();
    const h = harness(db, names);

    const explicit = await h.turn.send({
      principal: principal(host),
      chatId,
      content: "hi",
      personaId: spare,
    });
    expect(explicit.messages[0]?.personaId).toBe(spare);

    const nulled = await h.turn.send({
      principal: principal(host),
      chatId,
      content: "again",
      personaId: null,
    });
    expect(nulled.messages[0]?.personaId).toBeNull();
  });
});

describe("send — the group round (N speakers via driveRound)", () => {
  test("a list-policy 2-character room commits one assistant per speaker, in order", async () => {
    const { host, chatId, chars, names } = await seedRoom("list", ["aria", "bryn"]);
    const h = harness(db, names);

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "hi all" });

    const assistants = outcome.messages.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(2);
    expect(assistants.map((m) => m.characterId)).toEqual(chars);
    const canon = await loadCanonHistory(db, chatId);
    expect(canon.map((m) => m.seq)).toEqual([1, 2, 3]);
  });

  test("a human @mention hard-overrides the policy to the named character only", async () => {
    const { host, chatId, chars, names } = await seedRoom("list", ["aria", "bryn"]);
    const h = harness(db, names);

    const outcome = await h.turn.send({
      principal: principal(host),
      chatId,
      content: "@bryn hello",
    });

    const assistants = outcome.messages.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(1);
    expect(assistants[0]?.characterId).toBe(chars[1]);
  });
});

// The `smart` policy routes the round through the side-LLM turn arbiter (`engine/smart-arbitrate`) BEFORE
// the deterministic sampler is reached. The owner contract: when that call fails, the round degrades to the
// `natural` math rather than stalling — and says so out loud (D41: no silent degrade).
describe("send — the smart policy (side-LLM turn arbiter + its visible fallback)", () => {
  /** A scripted turn-arbiter reply (the `summarize` role op the smart arbitration calls). */
  function arbiter(text: string): { op: ChatContext["summarize"]; calls: () => number } {
    let calls = 0;
    return {
      op: (): Promise<SummarizeResult> => {
        calls += 1;
        return Promise.resolve({ items: [{ text, usage: { tokensIn: 1, tokensOut: 1, costUsd: null } }], model: "fake" });
      },
      calls: () => calls,
    };
  }

  const warnings = (events: readonly ChatBusEvent[]): readonly ChatBusEvent[] => events.filter((e) => e.type === "warning");

  test("the side-LLM's pick is honored (the happy path still works)", async () => {
    const { host, chatId, chars, names } = await seedRoom("smart", ["aria", "bryn"]);
    const chosen = arbiter("bryn");
    const h = harness(db, names, { summarize: chosen.op });

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "who's up?" });

    const assistants = outcome.messages.filter((m) => m.role === "assistant");
    expect(assistants.map((m) => m.characterId)).toEqual([chars[1]]);
    expect(chosen.calls()).toBe(1);
    expect(warnings(h.events)).toHaveLength(0);
  });

  test("a THROWING arbiter (outage) still commits a turn, chosen by the natural math, with a warning", async () => {
    const { host, chatId, chars, names } = await seedRoom("smart", ["aria", "bryn"]);
    const h = harness(db, names, {
      summarize: () => Promise.reject(new Error("side-LLM down")),
    });

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "who's up?" });

    const assistants = outcome.messages.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(1);
    expect(chars).toContainEqual(assistants[0]?.characterId);
    expect(warnings(h.events)).toEqual([{ type: "warning", chatId, code: "smart_arbitration_degraded" }]);
  });

  // The small-hardware arm (plan-for-small-hardware): no summarize backend wired ⇒ the role dispatcher
  // fail-closes with a SYNCHRONOUS throw. Same outcome — the round happens and the user is told.
  test("an UNWIRED arbiter (sync fail-closed throw) degrades the same way", async () => {
    const { host, chatId, names } = await seedRoom("smart", ["aria", "bryn"]);
    const h = harness(db, names, {
      summarize: () => {
        throw new Error('provider "vllm" is not wired for the "summarize" role');
      },
    });

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "who's up?" });

    expect(outcome.messages.filter((m) => m.role === "assistant")).toHaveLength(1);
    expect(warnings(h.events)).toEqual([{ type: "warning", chatId, code: "smart_arbitration_degraded" }]);
  });

  test("a GARBLED / off-roster reply degrades to the math (never schedules a non-member)", async () => {
    const { host, chatId, chars, names } = await seedRoom("smart", ["aria", "bryn"]);
    const h = harness(db, names, { summarize: arbiter("Gandalf the Grey").op });

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "who's up?" });

    const assistants = outcome.messages.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(1);
    expect(chars).toContainEqual(assistants[0]?.characterId);
    expect(warnings(h.events)).toEqual([{ type: "warning", chatId, code: "smart_arbitration_degraded" }]);
  });

  test("a human @mention hard-overrides smart entirely — the arbiter is never called", async () => {
    const { host, chatId, chars, names } = await seedRoom("smart", ["aria", "bryn"]);
    const chosen = arbiter("aria");
    const h = harness(db, names, { summarize: chosen.op });

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "@bryn hello" });

    const assistants = outcome.messages.filter((m) => m.role === "assistant");
    expect(assistants.map((m) => m.characterId)).toEqual([chars[1]]);
    expect(chosen.calls()).toBe(0);
    expect(warnings(h.events)).toHaveLength(0);
  });

  test("a MUTED member named by the arbiter is never scheduled (untrusted model output)", async () => {
    const { host, chatId, chars, names } = await seedRoom("smart", ["aria", "bryn", "cara"], { disabledKeys: ["cara"] });
    const h = harness(db, names, { summarize: arbiter("cara").op });

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "who's up?" });

    const assistants = outcome.messages.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(1);
    expect(assistants[0]?.characterId).not.toBe(chars[2]);
    expect(warnings(h.events)).toEqual([{ type: "warning", chatId, code: "smart_arbitration_degraded" }]);
  });

  // THE HANG (a hang is not a failure, so the degrade belt above cannot catch it): a arbiter box that
  // accepts the request and never answers holds the whole turn open. The turn's abort signal now rides INTO
  // the summarize op, so the user's Stop cuts it — and a cancelled arbitration is NOT a degrade: the round
  // ends with nothing generated and no warning (nothing degraded — the user stopped it).
  test("an abort mid-arbitration ends the turn: no fallback speaker, no generation, no degrade warning", async () => {
    const { host, chatId, names } = await seedRoom("smart", ["aria", "bryn"]);
    let generations = 0;
    let arbiterEntered: () => void = () => undefined;
    const arrived = new Promise<void>((resolve) => {
      arbiterEntered = resolve;
    });
    const h = harness(db, names, {
      onChatRequest: () => {
        generations += 1;
      },
      // The non-responsive box: settles ONLY when the injected signal fires, exactly like a real provider
      // fetch that got a socket and no bytes.
      summarize: (_funderUserId, _inputs, opts): Promise<SummarizeResult> =>
        new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
          arbiterEntered();
        }),
    });

    const sending = h.turn.send({ principal: principal(host), chatId, content: "who's up?" });
    await arrived;
    await h.turn.abort({ principal: principal(host), chatId });
    const outcome = await sending;

    expect(outcome.aborted).toBe(true);
    expect(outcome.abortReason).toBe("user");
    // The user's own line is durable canon; nothing was generated on top of it.
    expect(outcome.messages.filter((m) => m.role === "assistant")).toHaveLength(0);
    expect(generations).toBe(0);
    expect(warnings(h.events)).toHaveLength(0);
    // Nothing reached canon either — the fallback never ran, so no speaker was scheduled.
    expect((await loadCanonHistory(db, chatId)).filter((m) => m.role === "assistant")).toHaveLength(0);

    // The Stop AFFORDANCE fix: `turnAccepted` fires BEFORE arbitration (the slot opens so Stop can render
    // during the hang), and — since the turn never reaches the engine — `turnAborted` fires from the
    // arbitration-abort path itself to CLOSE that slot. No `turnStarted` (the engine never ran).
    const turnTypes = h.events.map((e) => e.type).filter((t) => t.startsWith("turn"));
    expect(turnTypes).toEqual(["turnAccepted", "turnAborted"]);
    const accepted = h.events.find((e) => e.type === "turnAccepted");
    expect(accepted).toMatchObject({ intent: "send", speakerCharacterId: null, targetMessageId: null });
    // `turnAccepted` precedes the user-row commit's? No — the user row commits first; accept is the FIRST
    // turn-lifecycle event, and it precedes the abort.
    const acceptedIdx = h.events.findIndex((e) => e.type === "turnAccepted");
    const abortedIdx = h.events.findIndex((e) => e.type === "turnAborted");
    expect(acceptedIdx).toBeGreaterThanOrEqual(0);
    expect(abortedIdx).toBeGreaterThan(acceptedIdx);
    expect(h.events[abortedIdx]).toMatchObject({ type: "turnAborted", intent: "send", reason: "user", automationDepth: 0 });
  });
});

describe("send — narrator output (group character authors the turn)", () => {
  test("a narrator round commits one assistant authored by the synthetic group character", async () => {
    const { host, chatId, names } = await seedRoom("list", ["aria", "bryn"], {
      output: "narrator",
    });
    // The synthetic group character is a REAL `characters` row (the `messages.characterId` FK; §10).
    const groupCharacterId = await seedCharacter(db, host, "group");
    const h = harness(db, names, { groupCharacterId });

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "narrate" });

    const assistants = outcome.messages.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(1);
    expect(assistants[0]?.characterId).toBe(groupCharacterId);
  });
});

// A NARRATOR round voices every seated character in ONE generation authored by the synthetic group character — it
// never consumes an arbitrated speaker. So the `smart` side-LLM turn arbiter must not run there: it costs a
// real model call whose verdict is discarded, and its degrade would warn the room about a decision that
// governs nothing. `policy` STAYS on the narrator arm (a mode toggle round-trips the host's choice) — it just
// never buys a arbiter call.
describe("send — narrator × smart: the arbiter is short-circuited (its verdict governs nothing)", () => {
  const warnings = (events: readonly ChatBusEvent[]): readonly ChatBusEvent[] => events.filter((e) => e.type === "warning");

  test("a narrator round makes ZERO side-LLM arbiter calls and still commits the character turn", async () => {
    const { host, chatId, names } = await seedRoom("smart", ["aria", "bryn"], { output: "narrator" });
    const groupCharacterId = await seedCharacter(db, host, "group");
    let arbiterCalls = 0;
    const h = harness(db, names, {
      groupCharacterId,
      summarize: (): Promise<SummarizeResult> => {
        arbiterCalls += 1;
        return Promise.resolve({ items: [{ text: "aria", usage: { tokensIn: 1, tokensOut: 1, costUsd: null } }], model: "fake" });
      },
    });

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "narrate" });

    expect(arbiterCalls).toBe(0);
    const assistants = outcome.messages.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(1);
    expect(assistants[0]?.characterId).toBe(groupCharacterId);
  });

  test("a DEAD arbiter box never warns a narrator room (nothing degraded — nothing was asked)", async () => {
    const { host, chatId, names } = await seedRoom("smart", ["aria", "bryn"], { output: "narrator" });
    const groupCharacterId = await seedCharacter(db, host, "group");
    const h = harness(db, names, {
      groupCharacterId,
      summarize: () => Promise.reject(new Error("side-LLM down")),
    });

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "narrate" });

    expect(warnings(h.events)).toHaveLength(0);
    expect(outcome.messages.filter((m) => m.role === "assistant")).toHaveLength(1);
  });

  // The auto-chain in a narrator room must keep chaining: its continue/stop probe is the DETERMINISTIC
  // arbitration (a nominee exists ⇒ narrate again), never the side-LLM.
  test("the auto-chain still runs in a narrator×smart room, with no arbiter calls", async () => {
    const { host, chatId, names } = await seedRoom("smart", ["aria", "bryn"], {
      output: "narrator",
      autoMode: true,
      autoModeMaxTurns: 2,
    });
    const groupCharacterId = await seedCharacter(db, host, "group");
    let arbiterCalls = 0;
    const h = harness(db, names, {
      groupCharacterId,
      summarize: (): Promise<SummarizeResult> => {
        arbiterCalls += 1;
        return Promise.resolve({ items: [{ text: "aria", usage: { tokensIn: 1, tokensOut: 1, costUsd: null } }], model: "fake" });
      },
    });

    await h.turn.send({ principal: principal(host), chatId, content: "narrate" });

    expect(arbiterCalls).toBe(0);
    // the human round's narrator turn + 2 chained narrator turns, all authored by the group character.
    const assistants = (await loadCanonHistory(db, chatId)).filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(3);
    expect(assistants.map((m) => m.characterId)).toEqual([groupCharacterId, groupCharacterId, groupCharacterId]);
  });

  // The THIRD forced-speaker door. `forceCharacterTurn` and `requestTurn` both coerce a narrator room to a
  // per-speaker turn for the named character; the send-path `@mention` is the same intent typed into the
  // composer, so it coerces too instead of silently narrating.
  test("an @mention in a NARRATOR room coerces the round to a per-speaker turn for the named character", async () => {
    const { host, chatId, chars, names } = await seedRoom("list", ["aria", "bryn"], { output: "narrator" });
    const groupCharacterId = await seedCharacter(db, host, "group");
    const h = harness(db, names, { groupCharacterId });

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "@bryn hello" });

    const assistants = outcome.messages.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(1);
    expect(assistants[0]?.characterId).toBe(chars[1]);
  });

  // …and a mention nobody eligible answers is NOT a forced round: the room stays in narrator mode.
  test("an @mention naming a non-member leaves the narrator round alone", async () => {
    const { host, chatId, names } = await seedRoom("list", ["aria", "bryn"], { output: "narrator" });
    const groupCharacterId = await seedCharacter(db, host, "group");
    const h = harness(db, names, { groupCharacterId });

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "@Gandalf hello" });

    const assistants = outcome.messages.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(1);
    expect(assistants[0]?.characterId).toBe(groupCharacterId);
  });
});

describe("send — auto-mode AI→AI chain", () => {
  test("autoMode chains additional turns past the human round (deterministic, ban-last)", async () => {
    const { host, chatId, names } = await seedRoom("list", ["aria", "bryn"], {
      autoMode: true,
      autoModeMaxTurns: 2,
    });
    const h = harness(db, names);

    await h.turn.send({ principal: principal(host), chatId, content: "go" });

    // human round (aria, bryn) + 2 chained turns = 4 assistant rows + the 1 user row.
    const canon = await loadCanonHistory(db, chatId);
    expect(canon.filter((m) => m.role === "assistant")).toHaveLength(4);
    expect(canon).toHaveLength(5);
  });

  // `pooled` is the room's ROTATION policy ("Round-robin" in the UI). The auto-chain is where it earns that
  // name: every chained turn arbitrates ONE speaker, so plain roster order would ping-pong between the first
  // two seats and starve the third forever. Least-recently-spoken ordering visits the whole roster.
  test("a pooled auto-chain rotates through EVERY seat (no starvation at maxSpeakers: 1)", async () => {
    const { host, chatId, chars, names } = await seedRoom("pooled", ["aria", "bryn", "cara"], {
      autoMode: true,
      autoModeMaxTurns: 3,
    });
    const h = harness(db, names);

    await h.turn.send({ principal: principal(host), chatId, content: "go" });

    const assistants = (await loadCanonHistory(db, chatId)).filter((m) => m.role === "assistant");
    // The human round is uncapped (all three, roster order); the three CHAINED turns then rotate past the
    // last speaker — aria, bryn, cara — instead of re-running aria/bryn.
    expect(assistants.map((m) => m.characterId)).toEqual([...chars, ...chars]);
  });

  // The self-response toggle and the rotation are ORTHOGONAL: "Let a character reply to itself" lifts the
  // ban on the last speaker (an ELIGIBILITY question); it says nothing about where the round-robin starts.
  // Nulling the chain's `lastSpeaker` to lift the ban destroyed the rotation ORIGIN too, so every chained
  // beat re-picked the first roster seat and the room labelled "Round-robin" monologued.
  test("a pooled auto-chain still rotates with allowSelfResponses ON (the toggle governs the ban, not the origin)", async () => {
    const { host, chatId, chars, names } = await seedRoom("pooled", ["aria", "bryn", "cara"], {
      autoMode: true,
      autoModeMaxTurns: 3,
      allowSelfResponses: true,
    });
    const h = harness(db, names);

    await h.turn.send({ principal: principal(host), chatId, content: "go" });

    const assistants = (await loadCanonHistory(db, chatId)).filter((m) => m.role === "assistant");
    expect(assistants.map((m) => m.characterId)).toEqual([...chars, ...chars]);
  });

  // THE CHAIN-ARBITRATION HANG (owner: "handle it in full"): the continuation arbitration between chained
  // speakers rides the SAME `smart` side-LLM that can hang. Each chain iteration now emits `turnAccepted`
  // BEFORE it arbitrates (so Stop renders during the hang), and the abort handle spans the WHOLE chain — so a
  // Stop mid-chain-arbitration cancels the chain, not just the current iteration.
  test("a hung chain arbitration mid-chain: Stop cancels the WHOLE chain (turnAborted lands, no further turn)", async () => {
    // A `smart` room so the chain's continuation arbitration calls the side-LLM arbiter each iteration.
    const { host, chatId, chars, names } = await seedRoom("smart", ["aria", "bryn"], {
      autoMode: true,
      autoModeMaxTurns: 3,
    });
    // The arbiter answers the FIRST arbitrations (human round → aria, chain iter 1 → bryn), then HANGS on the
    // next chain arbitration exactly like a non-responsive box — settling only when the turn signal fires.
    let calls = 0;
    let hungEntered: () => void = () => undefined;
    const arrived = new Promise<void>((resolve) => {
      hungEntered = resolve;
    });
    const summarize: ChatContext["summarize"] = (_funderUserId, _inputs, opts): Promise<SummarizeResult> => {
      calls += 1;
      const pick = calls === 1 ? "aria" : "bryn";
      if (calls <= 2) {
        return Promise.resolve({ items: [{ text: pick, usage: { tokensIn: 1, tokensOut: 1, costUsd: null } }], model: "fake" });
      }
      return new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        hungEntered();
      });
    };
    const h = harness(db, names, { summarize });

    const sending = h.turn.send({ principal: principal(host), chatId, content: "who's up?" });
    await arrived; // the chain reached the hung arbitration
    await h.turn.abort({ principal: principal(host), chatId });
    const outcome = await sending;

    // The chain STOPPED at the hung iteration — the human round (aria) + exactly ONE chained turn (bryn)
    // committed, and NO third arbitration produced a turn.
    const assistants = (await loadCanonHistory(db, chatId)).filter((m) => m.role === "assistant");
    expect(assistants.map((m) => m.characterId)).toEqual([chars[0], chars[1]]);
    expect(outcome.aborted).toBe(false); // the PRIMARY round completed; the chain is a background continuation
    // The chain iteration that hung opened a slot (turnAccepted) and CLOSED it with turnAborted(user) — the
    // Stop affordance had something to drive and the slot never strands. The final turn-lifecycle event is the
    // chain's turnAborted, and no turnStarted follows it (no further turn ran).
    const turnEvents = h.events.filter((e) => e.type === "turnAccepted" || e.type === "turnStarted" || e.type === "turnAborted" || e.type === "turnCompleted");
    expect(turnEvents.at(-1)).toMatchObject({ type: "turnAborted", intent: "generate", reason: "user", automationDepth: 0 });
    // At least THREE turnAccepteds fired (human round + chain iter 1 + the hung chain iter 2); each precedes
    // its own resolution, and the hung one is closed by the trailing turnAborted.
    expect(h.events.filter((e) => e.type === "turnAccepted").length).toBeGreaterThanOrEqual(3);
  });
});

describe("send — PD-146 custom stopping strings + auto-behaviors", () => {
  const behaviorOff: ChatBehaviorInputs = {
    autoContinue: false,
    autoContinueRounds: 1,
    autoSwipe: { enabled: false, minLength: 0, blacklist: [], maxRetries: 1 },
    customStoppingStrings: [],
    // B1: this suite's rooms carry no `chatMetadata.offerChoices`, so the host default alone decides — OFF
    // keeps every prompt in this file byte-identical to its pre-B1 assertions.
    offerChoices: false,
    // B7: the same argument per knob — the react tool stays unattached (its shipped default) and the
    // reaction plane's ON is the do-nothing posture (no reactions exist in these rooms ⇒ no injection).
    charactersCanReact: false,
    reactionsEnabled: true,
  };

  test("custom stopping strings reach the generation request's stop set", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    let seenStop: readonly string[] | undefined;
    const h = harness(db, names, {
      chatBehavior: { ...behaviorOff, customStoppingStrings: ["<END>", "\nUser:"] },
      onChatRequest: (req) => {
        seenStop = (req as { intent: { stop?: readonly string[] } }).intent.stop;
      },
    });

    await h.turn.send({ principal: principal(host), chatId, content: "hi" });

    expect(seenStop).toEqual(["<END>", "\nUser:"]);
  });

  test("no custom stops → the request carries no stop set (byte-identical)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    let seenStop: readonly string[] | undefined = ["sentinel"];
    const h = harness(db, names, {
      chatBehavior: behaviorOff,
      onChatRequest: (req) => {
        seenStop = (req as { intent: { stop?: readonly string[] } }).intent.stop;
      },
    });

    await h.turn.send({ principal: principal(host), chatId, content: "hi" });

    expect(seenStop).toBeUndefined();
  });

  // IMP-1 layer 2a — the impersonate anti-bleed stop set. Measured need: the voice-lock nudge alone leaves
  // 28% character-voice bleed on the local 8B (scripts/probes/impersonate). ST stops on every present
  // member's name for exactly this (script.js:3010-3029); the receive-side truncate is the fallback for
  // backends that ignore stops.
  test("impersonate stops on EVERY present character's label, riding the host's own custom stops", async () => {
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria", "kai"]);
    let seenStop: readonly string[] | undefined;
    const h = harness(db, names, {
      chatBehavior: { ...behaviorOff, customStoppingStrings: ["<END>"] },
      onChatRequest: (req) => {
        seenStop = (req as { intent: { stop?: readonly string[] } }).intent.stop;
      },
    });

    await drainImpersonation(h.turn.impersonateStream({ principal: principal(host), chatId }));

    expect(seenStop).toEqual(["<END>", ...chars.map((id) => `\n${names[id]}:`)]);
  });

  test("a NON-impersonate turn gains no character stops (byte-identical to pre-IMP-1)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria", "kai"]);
    let seenStop: readonly string[] | undefined = ["sentinel"];
    const h = harness(db, names, {
      chatBehavior: behaviorOff,
      onChatRequest: (req) => {
        seenStop = (req as { intent: { stop?: readonly string[] } }).intent.stop;
      },
    });

    await h.turn.send({ principal: principal(host), chatId, content: "hi" });

    expect(seenStop).toBeUndefined();
  });

  test("autoContinue fires ONE continue on a length-capped reply; the slot extends in place", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    let generations = 0;
    const h = harness(db, names, {
      chatBehavior: { ...behaviorOff, autoContinue: true },
      onChatRequest: () => {
        generations += 1;
      },
      replyTape: [
        { content: "the thought was", finishReason: "length" },
        { content: " finished at last", finishReason: "stop" },
      ],
    });

    await h.turn.send({ principal: principal(host), chatId, content: "go" });

    // One initial gen + one auto-continue = 2 generations; the continue extends the single assistant slot.
    expect(generations).toBe(2);
    const canon = await loadCanonHistory(db, chatId);
    const assistants = canon.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(1);
    expect(assistants[0]?.content).toContain("the thought was");
    expect(assistants[0]?.content).toContain("finished at last");
  });

  test("autoContinue does NOT fire when the reply finished cleanly (finishReason ≠ length)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    let generations = 0;
    const h = harness(db, names, {
      chatBehavior: { ...behaviorOff, autoContinue: true },
      onChatRequest: () => {
        generations += 1;
      },
      replyTape: [{ content: "all done here", finishReason: "stop" }],
    });

    await h.turn.send({ principal: principal(host), chatId, content: "go" });

    expect(generations).toBe(1);
    const canon = await loadCanonHistory(db, chatId);
    expect(canon.filter((m) => m.role === "assistant")).toHaveLength(1);
  });

  test("autoContinue respects its bound: a persistently length-capped model continues only ONCE", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    let generations = 0;
    const h = harness(db, names, {
      chatBehavior: { ...behaviorOff, autoContinue: true },
      onChatRequest: () => {
        generations += 1;
      },
      // Every reply hits the length cap — the bound (1) must stop the loop after a single follow-up.
      replyTape: [
        { content: "a", finishReason: "length" },
        { content: "b", finishReason: "length" },
        { content: "c", finishReason: "length" },
      ],
    });

    await h.turn.send({ principal: principal(host), chatId, content: "go" });

    expect(generations).toBe(2); // initial + exactly one continue.
  });

  test("autoSwipe regenerates a too-short reply as a new selected variant", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names, {
      chatBehavior: { ...behaviorOff, autoSwipe: { enabled: true, minLength: 12, blacklist: [], maxRetries: 1 } },
      replyTape: [{ content: "too short" }, { content: "a comfortably long reply that clears the bar" }],
    });

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "go" });

    const tip = await loadMessageView(db, outcome.messages.at(-1)?.id ?? castId<MessageId>("x"));
    expect(tip?.variantCount).toBe(2); // the reroll appended a second variant …
    expect(tip?.content).toBe("a comfortably long reply that clears the bar"); // … and selected it.
  });

  test("autoSwipe fires on a blacklist hit (case-insensitive)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names, {
      chatBehavior: { ...behaviorOff, autoSwipe: { enabled: true, minLength: 0, blacklist: ["Sorry"], maxRetries: 1 } },
      replyTape: [{ content: "i'm sorry, i can't help with that" }, { content: "sure, here is the scene" }],
    });

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "go" });

    const tip = await loadMessageView(db, outcome.messages.at(-1)?.id ?? castId<MessageId>("x"));
    expect(tip?.variantCount).toBe(2);
    expect(tip?.content).toBe("sure, here is the scene");
  });

  test("autoSwipe respects its bound: a persistently rejected model rerolls only ONCE", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    let generations = 0;
    const h = harness(db, names, {
      chatBehavior: { ...behaviorOff, autoSwipe: { enabled: true, minLength: 100, blacklist: [], maxRetries: 1 } },
      onChatRequest: () => {
        generations += 1;
      },
      replyTape: [{ content: "nope" }, { content: "still short" }, { content: "again short" }],
    });

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "go" });

    expect(generations).toBe(2); // initial + exactly one swipe.
    const tip = await loadMessageView(db, outcome.messages.at(-1)?.id ?? castId<MessageId>("x"));
    expect(tip?.variantCount).toBe(2);
  });

  // ⑧(b) — the bound is the host's `autoSwipe.maxRetries` knob, not a const: maxRetries=2 rerolls TWICE.
  test("autoSwipe honors maxRetries=2: a persistently rejected model rerolls exactly TWICE (the knob, not a const)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    let generations = 0;
    const h = harness(db, names, {
      chatBehavior: { ...behaviorOff, autoSwipe: { enabled: true, minLength: 100, blacklist: [], maxRetries: 2 } },
      onChatRequest: () => {
        generations += 1;
      },
      replyTape: [{ content: "nope" }, { content: "still short" }, { content: "again short" }],
    });

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "go" });

    expect(generations).toBe(3); // initial + exactly two swipes (the maxRetries=2 bound).
    const tip = await loadMessageView(db, outcome.messages.at(-1)?.id ?? castId<MessageId>("x"));
    expect(tip?.variantCount).toBe(3);
  });

  // ⑧(b) belt (stint-6 item 8) — the auto-continue bound is the host's `autoContinueRounds` knob, not a
  // const: autoContinueRounds=2 continues TWICE (mirrors the maxRetries=2 idiom above).
  test("autoContinue honors autoContinueRounds=2: a persistently length-capped model continues exactly TWICE", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    let generations = 0;
    const h = harness(db, names, {
      chatBehavior: { ...behaviorOff, autoContinue: true, autoContinueRounds: 2 },
      onChatRequest: () => {
        generations += 1;
      },
      // Every reply hits the length cap — the bound (2) stops the loop after two follow-ups.
      replyTape: [
        { content: "a", finishReason: "length" },
        { content: "b", finishReason: "length" },
        { content: "c", finishReason: "length" },
        { content: "d", finishReason: "length" },
      ],
    });

    await h.turn.send({ principal: principal(host), chatId, content: "go" });

    expect(generations).toBe(3); // initial + exactly two continues (the autoContinueRounds=2 bound).
  });

  test("auto-swipe takes precedence over auto-continue on a reply that is both short AND length-capped", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    let generations = 0;
    const h = harness(db, names, {
      chatBehavior: { ...behaviorOff, autoContinue: true, autoSwipe: { enabled: true, minLength: 20, blacklist: [], maxRetries: 1 } },
      onChatRequest: () => {
        generations += 1;
      },
      replyTape: [
        { content: "cut off", finishReason: "length" }, // short (< 20) AND length-capped
        { content: "a full, comfortably long swiped reply" },
      ],
    });

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "go" });

    // Auto-swipe wins (one reroll); auto-continue never runs — so exactly 2 generations and a 2-variant slot.
    expect(generations).toBe(2);
    const tip = await loadMessageView(db, outcome.messages.at(-1)?.id ?? castId<MessageId>("x"));
    expect(tip?.variantCount).toBe(2);
  });

  test("defaults (all-off): a short, length-capped reply triggers NO follow-up (byte-identical)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    let generations = 0;
    const h = harness(db, names, {
      chatBehavior: behaviorOff,
      onChatRequest: () => {
        generations += 1;
      },
      replyTape: [{ content: "x", finishReason: "length" }],
    });

    await h.turn.send({ principal: principal(host), chatId, content: "go" });

    expect(generations).toBe(1);
    const canon = await loadCanonHistory(db, chatId);
    expect(canon.filter((m) => m.role === "assistant")).toHaveLength(1);
  });
});

describe("send — the D19 triple (run-as-host attribution)", () => {
  test("a member's send runs the AI as the host; the user row is authored by the member", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const member = await seedUser(db, castId<Handle>("member"));
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const h = harness(db, names);

    const outcome = await h.turn.send({ principal: principal(member), chatId, content: "hi" });

    expect(outcome.messages[0]?.authorUserId).toBe(member); // the user row is the caller's
    expect(h.connectionFunders).toEqual([host]);
    // TWO deltas ride the send (the stats design doc canon-mutator push): the USER row's (owner-grain only —
    // characterId null) then the assistant turn's — BOTH attributed to the host (runAsUserId, D19).
    expect(h.deltas).toHaveLength(2);
    expect(h.deltas[0]?.userTurns).toBe(1);
    expect(h.deltas[0]?.characterId).toBeNull();
    expect(h.deltas.map((d) => d.ownerId)).toEqual([host, host]);
  });

  test("auto-mode retains the member chain starter for attribution while the host funds every beat", async () => {
    const { host, chatId, names } = await seedRoom("list", ["aria", "bryn"], { autoMode: true, autoModeMaxTurns: 2 });
    const member = await seedUser(db, castId<Handle>("member-auto"));
    await seedParticipant(db, { chatId, key: "member-auto", userId: member, role: "member" });
    const attribution = triggeredBySpyRpg();
    const h = harness(db, names, { rpg: attribution.rpg });

    await h.turn.send({ principal: principal(member), chatId, content: "go" });

    expect(h.connectionFunders).toEqual([host]);
    expect(attribution.triggeredBy.length).toBeGreaterThan(1);
    expect(attribution.triggeredBy.every((id) => id === member)).toBe(true);
  });

  test("transferring the host seat transfers liability for subsequent turns", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const nextHost = await seedUser(db, castId<Handle>("next-host"));
    await seedParticipant(db, { chatId, key: "next-host", userId: nextHost, role: "member" });
    const h = harness(db, names);

    await h.turn.send({ principal: principal(nextHost), chatId, content: "before" });
    await transferHost(chatId, host, nextHost);
    await h.turn.send({ principal: principal(host), chatId, content: "after" });

    expect(h.connectionFunders).toEqual([host, nextHost]);
  });

  test("a missing host connection refuses without falling back to the member's connection", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const member = await seedUser(db, castId<Handle>("member-no-host-connection"));
    await seedParticipant(db, { chatId, key: "member-no-host-connection", userId: member, role: "member" });
    const h = harness(db, names, {
      resolveConnection: ({ funderUserId }) =>
        funderUserId === host ? Promise.reject(new Error("host has no chat connection")) : Promise.resolve(testConnection("vllm")),
    });

    await expect(h.turn.send({ principal: principal(member), chatId, content: "hi" })).rejects.toThrow("host has no chat connection");
    expect(h.connectionFunders).toEqual([host]);
    expect(await loadCanonHistory(db, chatId)).toHaveLength(0);
  });

  test("a non-member is refused (leak-free NOT_FOUND — can() default-deny)", async () => {
    const { chatId, names } = await seedRoom("natural", ["aria"]);
    const stranger = await seedUser(db, castId<Handle>("stranger"));
    const h = harness(db, names);

    await expect(h.turn.send({ principal: principal(stranger), chatId, content: "hi" })).rejects.toBeInstanceOf(ChatNotFoundError);
  });
});

// Part III §5 — the host-offline DEFERRED turn (`pending_turns`): a NON-host member's send while the funding
// host is dark queues the owed AI response as a durable, NOT-lock-held row instead of running it; the drain
// (boot reclaim / host-return) reconstructs + runs it through the engine (consent/budget re-validated in-lock)
// or DROPS it on a re-validation refusal. Both consume the row.
describe("send / drainDeferredTurns — host-offline defer + reclaim (D16 / Part III §5)", () => {
  /** Seed a group room whose host is offline + a present member who will trigger the send. */
  async function seedMemberRoom(): Promise<{
    host: UserId;
    member: UserId;
    chatId: ChatId;
    chars: CharacterId[];
    names: Record<string, string>;
  }> {
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria"]);
    const member = await seedUser(db, castId<Handle>("member"));
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    return { host, member, chatId, chars, names };
  }

  /** Host offline, everyone else online — the funding host is dark while a member drives. */
  function hostOffline(host: UserId): ChatContext["readPresence"] {
    return (userId) => Promise.resolve({ userId, online: userId !== host, lastSeenAt: null });
  }

  test("a member's send while the host is offline DEFERS: only the user row commits + a pending_turns row queues", async () => {
    const { host, member, chatId, names } = await seedMemberRoom();
    const h = harness(db, names, { readPresence: hostOffline(host) });

    const outcome = await h.turn.send({ principal: principal(member), chatId, content: "hi" });

    // The member's message is durable canon; the owed AI turn did NOT run.
    expect(outcome.messages).toHaveLength(1);
    expect(outcome.messages[0]?.role).toBe("user");
    expect(outcome.messages[0]?.authorUserId).toBe(member);
    const canon = await loadCanonHistory(db, chatId);
    expect(canon.filter((m) => m.role === "assistant")).toHaveLength(0);
    // …and the frozen identity triple is queued (triggeredBy = the responsible member; runAsUserId = host).
    const queued = await loadPendingTurns(db, chatId);
    expect(queued).toHaveLength(1);
    expect(queued[0]?.triggeredBy).toBe(member);
    expect(queued[0]?.runAsUserId).toBe(host);
  });

  test("a host's OWN send never defers, even when presence reports the host offline (present by definition)", async () => {
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names, {
      readPresence: (userId) => Promise.resolve({ userId, online: false, lastSeenAt: null }),
    });

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "hi" });

    // Ran inline: user + assistant, no queued row.
    expect(outcome.messages).toHaveLength(2);
    expect(outcome.messages[1]?.role).toBe("assistant");
    expect(outcome.messages[1]?.characterId).toBe(chars[0]);
    expect(await loadPendingTurns(db, chatId)).toHaveLength(0);
  });

  test("the host-return drain RECLAIMS a deferred turn: reconstructs + runs the owed AI response, consumes the row", async () => {
    const { host, member, chatId, chars, names } = await seedMemberRoom();
    const h = harness(db, names, { readPresence: hostOffline(host) });

    // DEFER via a real send (exercises insertPendingTurn), then DRAIN on the host's return.
    await h.turn.send({ principal: principal(member), chatId, content: "hi" });
    expect(await loadPendingTurns(db, chatId)).toHaveLength(1);

    const report = await h.turn.drainDeferredTurns({ hostUserId: host });

    expect(report).toStrictEqual({ ran: 1, dropped: 0 });
    expect(await loadPendingTurns(db, chatId)).toHaveLength(0); // consumed
    const assistants = (await loadCanonHistory(db, chatId)).filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(1);
    expect(assistants[0]?.characterId).toBe(chars[0]);
  });

  test("deferred replay preserves the host funder frozen when the turn was queued", async () => {
    const { host, member, chatId, names } = await seedMemberRoom();
    const nextHost = await seedUser(db, castId<Handle>("deferred-next-host"));
    await seedParticipant(db, { chatId, key: "deferred-next-host", userId: nextHost, role: "member" });
    const h = harness(db, names, { readPresence: hostOffline(host) });

    await h.turn.send({ principal: principal(member), chatId, content: "hi" });
    await transferHost(chatId, host, nextHost);
    h.connectionFunders.splice(0);

    await expect(h.turn.drainDeferredTurns({ all: true })).resolves.toStrictEqual({ ran: 1, dropped: 0 });
    expect(h.connectionFunders).toEqual([host]);
  });

  test("the boot reclaim ({all}) drains every chat's queued turns", async () => {
    const { host, member, chatId, names } = await seedMemberRoom();
    const h = harness(db, names, { readPresence: hostOffline(host) });
    await h.turn.send({ principal: principal(member), chatId, content: "hi" });

    const report = await h.turn.drainDeferredTurns({ all: true });

    expect(report).toStrictEqual({ ran: 1, dropped: 0 });
    expect(await loadPendingTurns(db, chatId)).toHaveLength(0);
  });

  // THE PERMANENT-VERDICT DROP PATH. The consent drop-pin that stood here was deleted with its separate
  // owner-consent belt (the host seat itself accepts room-turn liability), which left the drop
  // MECHANISM — claim, notify the frozen `triggeredBy`, stay deleted — with no coverage at all. It is
  // re-pinned on the ONE arm that still raises it: `loadRoom` refuses a room whose host participant is gone
  // (`turn.ts` `loadRoom` → `ChatNotFoundError`), which is a verdict no later drain edge can change.
  test("a HOSTLESS room is a PERMANENT drop: the claimed row stays deleted and the member is notified", async () => {
    const member = await seedUser(db, castId<Handle>("gone-member"));
    const goneHost = await seedUser(db, castId<Handle>("gone-host"));
    const chatId = await seedChat(db, "gone", { metadata: { group: { output: "per-speaker", policy: "natural" } } });
    // A member seat and a character, but NO host participant — the room the frozen row was queued against
    // no longer has anyone to run as.
    await seedParticipant(db, { chatId, key: "gm", userId: member, role: "member" });
    const charId = await seedCharacter(db, goneHost, "gone-aria");
    await seedParticipant(db, { chatId, key: "gone-aria", characterId: charId, joinSeq: 0 });
    await seedPendingTurn(db, { chatId, key: "gone", triggeredBy: member, runAsUserId: goneHost });
    const h = harness(db, {});

    const report = await h.turn.drainDeferredTurns({ all: true });

    expect(report).toStrictEqual({ ran: 0, dropped: 1 });
    // CLAIMED AND NOT RE-QUEUED — the half a "dropped" count alone cannot prove.
    expect(await loadPendingTurns(db, chatId)).toHaveLength(0);
    // The frozen `triggeredBy` is told their owed reply is never coming (never the resolved host).
    expect(h.notifications).toStrictEqual([{ type: "deferred-turn-dropped", recipientUserId: member, chatId, reason: "chat-gone" }]);
    // Nothing was generated on the way out.
    expect((await loadCanonHistory(db, chatId)).filter((m) => m.role === "assistant")).toHaveLength(0);
  });

  test("a TRANSIENT fault is TEMPORAL: the drain RE-QUEUES the row (no drop, no notification) to retry next drain", async () => {
    const { host, member, chatId, names } = await seedMemberRoom();
    await seedPendingTurn(db, { chatId, key: "transient", triggeredBy: member, runAsUserId: host });
    // WAS a per-member `budget_exceeded` thrower until @orb/inference §14 F11 retired that belt. The pin's
    // subject is the TEMPORAL class itself — anything that is not a permanent verdict — so it now drives the
    // other documented member of that class: a provider outage. "Not now" is not "never", so the owed reply
    // must survive to the next drain edge, unspammed.
    const h = harness(db, names, {
      runChatTurn: () => {
        throw new Error("provider outage");
      },
    });

    const report = await h.turn.drainDeferredTurns({ all: true });

    expect(report).toStrictEqual({ ran: 0, dropped: 0 });
    // Re-queued (re-inserted after the atomic claim), same frozen triple — waits for the next drain.
    const requeued = await loadPendingTurns(db, chatId);
    expect(requeued).toHaveLength(1);
    expect(requeued[0]?.triggeredBy).toBe(member);
    expect(requeued[0]?.runAsUserId).toBe(host);
    expect(h.notifications).toHaveLength(0); // NO spam on a temporal requeue
    expect((await loadCanonHistory(db, chatId)).filter((m) => m.role === "assistant")).toHaveLength(0);
  });

  test("two concurrent drains claim each row exactly once (no double-run)", async () => {
    // N rows across N DISTINCT chats (no per-chat lock contention) — the atomic DELETE…RETURNING claim is
    // the only serializer, so overlapping boot ∥ host-return snapshots can't run a row twice. The
    // double-SPEND half of this pin went with the member-budget belt (@orb/inference §14 F11); the
    // exactly-once CLAIM it also proved is untouched and is what the counts below assert.
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatIds: ChatId[] = [];
    for (let i = 0; i < 4; i += 1) {
      const chatId = await seedChat(db, `c${i}`, {
        metadata: { group: { output: "per-speaker", policy: "natural" } },
      });

      await seedParticipant(db, { chatId, key: `h${i}`, userId: host, role: "host" });

      await seedParticipant(db, { chatId, key: `m${i}`, userId: member, role: "member" });

      const cid = await seedCharacter(db, host, `aria${i}`);

      await seedParticipant(db, { chatId, key: `aria${i}`, characterId: cid, joinSeq: 0 });

      await seedPendingTurn(db, { chatId, key: `p${i}`, triggeredBy: member, runAsUserId: host });
      chatIds.push(chatId);
    }
    const names: Record<string, string> = {};
    const h = harness(db, names);

    // Two overlapping drains race the same 4 candidate rows.
    const [a, b] = await Promise.all([h.turn.drainDeferredTurns({ all: true }), h.turn.drainDeferredTurns({ hostUserId: host })]);

    // Across BOTH drains, exactly 4 rows ran (each claimed once); the losers skipped.
    expect(a.ran + b.ran).toBe(4);
    expect(a.dropped + b.dropped).toBe(0);
    expect(await loadPendingTurnsForReclaim(db)).toHaveLength(0); // all consumed
    // Each chat got exactly one AI response (never two).
    for (const chatId of chatIds) {
      const assistants = (await loadCanonHistory(db, chatId)).filter((m) => m.role === "assistant");
      expect(assistants).toHaveLength(1);
    }
  });
});

describe("send — a solo room drives exactly ONE speaker (PD-95: the deleted simpleSend was byte-identical)", () => {
  test("commits the user row + one assistant for the primary character", async () => {
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "yo" });

    expect(outcome.messages).toHaveLength(2);
    expect(outcome.messages[1]?.role).toBe("assistant");
    expect(outcome.messages[1]?.characterId).toBe(chars[0]);
  });
});

describe("forceCharacterTurn — host-only", () => {
  test("the host forces a specific character to speak (no user row)", async () => {
    const { host, chatId, chars, names } = await seedRoom("list", ["aria", "bryn"]);
    const h = harness(db, names);

    const outcome = await h.turn.forceCharacterTurn({
      principal: principal(host),
      chatId,
      characterId: chars[1] as CharacterId,
    });

    expect(outcome.messages).toHaveLength(1);
    expect(outcome.messages[0]?.role).toBe("assistant");
    expect(outcome.messages[0]?.characterId).toBe(chars[1]);
  });

  test("a plain member is refused with not_host", async () => {
    const { chatId, chars, names } = await seedRoom("list", ["aria"]);
    const member = await seedUser(db, castId<Handle>("member"));
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const h = harness(db, names);

    await expect(
      h.turn.forceCharacterTurn({
        principal: principal(member),
        chatId,
        characterId: chars[0] as CharacterId,
      }),
    ).rejects.toMatchObject({ code: "not_host" });
  });

  test("forcing a non-roster character is a leak-free NOT_FOUND", async () => {
    const { host, chatId, names } = await seedRoom("list", ["aria"]);
    const h = harness(db, names);

    await expect(
      h.turn.forceCharacterTurn({
        principal: principal(host),
        chatId,
        characterId: castId<CharacterId>("character_ghost"),
      }),
    ).rejects.toBeInstanceOf(ChatNotFoundError);
  });

  // #29 decision: force-turn ALLOWS a muted target. Mute (`disabled`) is passive arbitration exclusion
  // — it keeps a member out of `natural`/`smart` AUTO-selection — but a host CAN still explicitly summon
  // them. The two predicates are deliberately distinct: `isArbiterEligible` (present AND not muted) gates
  // auto-selection; forceCharacterTurn's target check is PRESENCE-only.
  test("a MUTED-but-present member is still force-summonable (drives a turn voiced by them)", async () => {
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria", "bryn"], {
      disabledKeys: ["bryn"],
    });
    const h = harness(db, names);

    const outcome = await h.turn.forceCharacterTurn({
      principal: principal(host),
      chatId,
      characterId: chars[1] as CharacterId,
    });

    expect(outcome.messages).toHaveLength(1);
    expect(outcome.messages[0]?.role).toBe("assistant");
    expect(outcome.messages[0]?.characterId).toBe(chars[1]);
  });

  test("the SAME muted member is excluded from a `natural` auto-round (send picks only the enabled one)", async () => {
    // aria enabled, bryn muted → the eligible set is {aria}; a normal send never voices bryn (the
    // arbitration-exclusion half of the #29 decision — force-turn overrides, auto-selection does not).
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria", "bryn"], {
      disabledKeys: ["bryn"],
    });
    const h = harness(db, names);

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "hi all" });

    const assistants = outcome.messages.filter((m) => m.role === "assistant");
    expect(assistants.length).toBeGreaterThan(0);
    for (const m of assistants) {
      expect(m.characterId).toBe(chars[0]);
      expect(m.characterId).not.toBe(chars[1]);
    }
  });
});

describe("generate — member-reachable speaker attribution is presence-gated (forgery + cross-tenant chrome leak defense)", () => {
  test("a member generating for a character NOT in this roster is a leak-free NOT_FOUND, nothing committed", async () => {
    // The hole: `generate` stamped any wire-supplied speakerCharacterId onto an assistant canon row without
    // a room check — a member could forge attribution to a foreign (e.g. another user's private) character
    // and leak its name+portrait through the message-stamped roster-avatar/name producers.
    const { chatId, names } = await seedRoom("natural", ["aria"]);
    const member = await seedUser(db, castId<Handle>("member"));
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const h = harness(db, names);

    await expect(
      h.turn.generate({
        principal: principal(member),
        chatId,
        speakerCharacterId: castId<CharacterId>("character_foreign"),
      }),
    ).rejects.toBeInstanceOf(ChatNotFoundError);

    // Attribution forgery must leave zero canon: no assistant row for the foreign speaker.
    expect((await loadCanonHistory(db, chatId)).filter((m) => m.role === "assistant")).toHaveLength(0);
  });

  test("a member generating for a DEPARTED (leftSeq set) character member is refused NOT_FOUND", async () => {
    // Presence is the hard requirement: a character that LEFT still has cards/history but is no longer a
    // present characters seat, so it may not be voiced by a fresh generate (the leftSeq === null sibling of
    // forceCharacterTurn's presence check).
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const member = await seedUser(db, castId<Handle>("member"));
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    // bryn is a DEPARTED character seat: its participant row + card survive, but leftSeq is set (no longer present).
    const departed = await seedCharacter(db, host, "bryn");
    await seedParticipant(db, { chatId, key: "bryn", characterId: departed, joinSeq: 0, leftSeq: 1 });
    const h = harness(db, names);

    await expect(
      h.turn.generate({
        principal: principal(member),
        chatId,
        speakerCharacterId: departed,
      }),
    ).rejects.toBeInstanceOf(ChatNotFoundError);
    expect((await loadCanonHistory(db, chatId)).filter((m) => m.role === "assistant")).toHaveLength(0);
  });

  test("a member generating for a PRESENT character character succeeds (regression: the legitimate path stays open)", async () => {
    const { chatId, chars, names } = await seedRoom("natural", ["aria", "bryn"]);
    const member = await seedUser(db, castId<Handle>("member"));
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const h = harness(db, names);

    const outcome = await h.turn.generate({
      principal: principal(member),
      chatId,
      speakerCharacterId: chars[1] as CharacterId,
    });

    expect(outcome.messages).toHaveLength(1);
    expect(outcome.messages[0]?.role).toBe("assistant");
    expect(outcome.messages[0]?.characterId).toBe(chars[1]);
  });

  test("a member generating for a PRESENT-but-MUTED character character succeeds (mute gates arbitration, not manual targeting)", async () => {
    // Mute (`disabled`) governs auto-selection eligibility + `{{groupNotMuted}}`, NOT explicit speaker
    // targeting — a member manually generating a muted seat is legitimate (it does NOT inherit any host
    // bypass; the only host-only bypass is a LEFT seat, refused above). Documented at the generate check site.
    const { chatId, chars, names } = await seedRoom("natural", ["aria", "bryn"], { disabledKeys: ["bryn"] });
    const member = await seedUser(db, castId<Handle>("member"));
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const h = harness(db, names);

    const outcome = await h.turn.generate({
      principal: principal(member),
      chatId,
      speakerCharacterId: chars[1] as CharacterId,
    });

    expect(outcome.messages).toHaveLength(1);
    expect(outcome.messages[0]?.characterId).toBe(chars[1]);
  });

  // W-D: the wand Response icon on an ASSISTANT tail needs the `responseNudge` trailing-user turn so the
  // reply isn't rudderless; a Response on a USER tail (or without the flag) appends nothing.
  test("afterAssistant:true appends the responseNudge trailing-user turn; omitted appends none", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    // Seed an assistant tail (the model's own last line — what a Response would reply after).
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "hello" });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "The tavern is quiet." });

    const lastUserText = (req: unknown): string => {
      const history = (req as { history: readonly { role: string; content: readonly { type: string; text?: string }[] }[] }).history;
      const lastUser = [...history].reverse().find((m) => m.role === "user");
      return (lastUser?.content ?? []).map((p) => (p.type === "text" ? (p.text ?? "") : "")).join("");
    };

    let withFlag = "";
    const h1 = harness(db, names, {
      onChatRequest: (req) => {
        withFlag = lastUserText(req);
      },
    });
    await h1.turn.generate({ principal: principal(host), chatId, afterAssistant: true });
    expect(withFlag).toContain("write the next reply"); // the DEFAULT_FORMAT_STRINGS.responseNudge text

    let withoutFlag = "sentinel";
    const h2 = harness(db, names, {
      onChatRequest: (req) => {
        withoutFlag = lastUserText(req);
      },
    });
    await h2.turn.generate({ principal: principal(host), chatId });
    expect(withoutFlag).not.toContain("write the next reply"); // no nudge without the flag
  });
});

describe("send / impersonate — an EXPLICIT foreign personaId is refused (cross-tenant persona chrome leak defense)", () => {
  test("a member sending with ANOTHER user's personaId is refused not_persona_owner, nothing committed", async () => {
    // The sibling hole: send/impersonate stamped any wire-supplied personaId onto a user row without an
    // ownership check — a member could stamp a foreign (private) persona and leak its name+avatar through the
    // message-stamped persona name/avatar producers. reattributePersona already guards the re-stamp path;
    // this closes the initial-stamp path with the SAME code.
    const { chatId, names } = await seedRoom("natural", ["aria"]);
    const member = await seedUser(db, castId<Handle>("member"));
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const stranger = await seedUser(db, castId<Handle>("stranger"));
    const foreignPersona = await seedPersona(stranger, "stranger_pov");
    const h = harness(db, names);

    await expect(h.turn.send({ principal: principal(member), chatId, content: "hi", personaId: foreignPersona })).rejects.toMatchObject({
      code: "not_persona_owner",
    });
    expect((await loadCanonHistory(db, chatId)).filter((m) => m.role === "user")).toHaveLength(0);

    // impersonateStream persists nothing, but the persona still binds the generation's `{{user}}` — a foreign id
    // would read a stranger's private persona name into the assembled prompt, so the ownership belt still fires
    // (on the first `.next()` — draining the stream surfaces the rejection before any delta yields).
    await expect(drainImpersonation(h.turn.impersonateStream({ principal: principal(member), chatId, personaId: foreignPersona }))).rejects.toMatchObject({
      code: "not_persona_owner",
    });
    expect((await loadCanonHistory(db, chatId)).filter((m) => m.role === "user")).toHaveLength(0);
  });
});

describe("abort — owner-only (rollback-theft defense)", () => {
  test("a caller aborting another user's in-flight turn is refused not_turn_owner", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const member = await seedUser(db, castId<Handle>("member"));
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const h = harness(db, names);
    h.activeTurns.register(chatId, host);

    await expect(h.turn.abort({ principal: principal(member), chatId })).rejects.toMatchObject({
      code: "not_turn_owner",
    });
  });

  test("a caller aborts their OWN in-flight turn (signalled)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);
    const handle = h.activeTurns.register(chatId, host);

    await h.turn.abort({ principal: principal(host), chatId });

    expect(handle.signal.aborted).toBe(true);
    expect(h.activeTurns.countActive(chatId)).toBe(0);
  });

  test("abort with nothing in flight is a no-op", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);
    await expect(h.turn.abort({ principal: principal(host), chatId })).resolves.toBeUndefined();
  });

  // RPG-SIGNAL: `activeTurns` covers the GENERATION only — its entry is released the instant the engine turn
  // returns, while the rpg state round the turn fired keeps running for another 0.8-2.9s with a model call of
  // its own. `abort` therefore reaches a SECOND registry, owner-scoped the same way.
  test("abort also cancels the caller's in-flight rpg STATE ROUNDS (the round outlives the turn's registration)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const cancels: { chatId: ChatId; userId: UserId }[] = [];
    const h = harness(db, names, { rpg: stateRoundCancellingRpg(cancels, 0) });
    h.activeTurns.register(chatId, host);

    await h.turn.abort({ principal: principal(host), chatId });

    expect(cancels).toEqual([{ chatId, userId: host }]); // scoped to the CALLER, mirroring activeTurns.abort
  });

  // The exact case the second registry exists for: the generation has already finished (nothing in
  // `activeTurns`) but the state round is still billing. That caller DOES own abortable work, so the
  // owner-only refusal must not fire on them.
  test("a caller whose only in-flight work is a STATE ROUND is not refused not_turn_owner", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const member = await seedUser(db, castId<Handle>("member"));
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const cancels: { chatId: ChatId; userId: UserId }[] = [];
    // A FOREIGN turn is generating (which alone would refuse the member), and the member's own round is running.
    const h = harness(db, names, { rpg: stateRoundCancellingRpg(cancels, 1) });
    h.activeTurns.register(chatId, host);

    await expect(h.turn.abort({ principal: principal(member), chatId })).resolves.toBeUndefined();

    expect(cancels).toEqual([{ chatId, userId: member }]);
  });
});

/** A `ctx.rpg` whose only live op is `cancelStateRounds` — it records the (chat, caller) it was asked about and
 *  answers `cancelled` for how many of that caller's rounds it "signalled".
 *  FABRICATION-OK: the abort path reaches only this op (the `macroDeclaringRpg` precedent). */
function stateRoundCancellingRpg(record: { chatId: ChatId; userId: UserId }[], cancelled: number): NonNullable<ChatContext["rpg"]> {
  // @orb-waive no-test-fabrication(unknown): minimal ChatRpgOps stub — `abort` touches nothing else. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return {
    resolvePresetOverride: () => Promise.resolve(null),
    resolveUserMacros: () => Promise.resolve([]),
    gatherTurnContext: () => Promise.resolve(null),
    markDicePreRollEligible: () => undefined,
    onUserCommit: () => Promise.resolve(),
    onTurnCompleted: () => Promise.resolve(),
    onTurnAborted: () => Promise.resolve(),
    cancelStateRounds: (chatId: ChatId, userId: UserId): number => {
      record.push({ chatId, userId });
      return cancelled;
    },
    resolveGmSeatHolderKind: () => Promise.resolve(null),
    resolveReasoningHostOnly: () => Promise.resolve(false),
  } as unknown as NonNullable<ChatContext["rpg"]>;
}

describe("guided steer routing (the chat design doc §6, PD-63)", () => {
  test("send threads the guided steer into the assembled prompt (system-marker default; {{input}} spliced)", async () => {
    const { host, chatId, names } = await seedRoom("list", ["aria"]);
    const requests: unknown[] = [];
    const h = harness(db, names, { onChatRequest: (r) => requests.push(r) });

    await h.turn.send({
      principal: principal(host),
      chatId,
      content: "hi",
      guided: { action: "response", input: "be dramatic" },
    });

    // The DEFAULT `response` template wraps the user's steering text; system placement renders it at the
    // {{guided_instruction}} marker — it must reach the wire request the engine dispatched.
    const wire = JSON.stringify(requests);
    expect(wire).toContain("special consideration");
    expect(wire).toContain("be dramatic");
  });

  test("an unsteered send carries NO guided template text", async () => {
    const { host, chatId, names } = await seedRoom("list", ["aria"]);
    const requests: unknown[] = [];
    const h = harness(db, names, { onChatRequest: (r) => requests.push(r) });

    await h.turn.send({ principal: principal(host), chatId, content: "hi" });

    expect(JSON.stringify(requests)).not.toContain("special consideration");
  });

  test("impersonateStream's guided steer threads {{person}} (composer wand's 1st/2nd/3rd-person picker)", async () => {
    const { host, chatId, names } = await seedRoom("list", ["aria"]);
    const requests: unknown[] = [];
    const h = harness(db, names, { onChatRequest: (r) => requests.push(r) });

    await drainImpersonation(
      h.turn.impersonateStream({
        principal: principal(host),
        chatId,
        guided: { action: "impersonate", input: "ask about the ruins", person: "third" },
      }),
    );

    // The default `impersonate` template carries a literal `{{person}}-person perspective` slot —
    // the wand's picked word must land there (never the kit resolver's "first" floor).
    const wire = JSON.stringify(requests);
    expect(wire).toContain("third-person perspective");
    expect(wire).toContain("ask about the ruins");
  });

  test("impersonateStream with NO person picked falls back to the kit resolver's 'first' default", async () => {
    const { host, chatId, names } = await seedRoom("list", ["aria"]);
    const requests: unknown[] = [];
    const h = harness(db, names, { onChatRequest: (r) => requests.push(r) });

    await drainImpersonation(
      h.turn.impersonateStream({
        principal: principal(host),
        chatId,
        guided: { action: "impersonate", input: "ask about the ruins" },
      }),
    );

    expect(JSON.stringify(requests)).toContain("first-person perspective");
  });

  // The load-bearing fix (impersonate-writes-as-the-character): the UNSTEERED nudge — appended when NO guided
  // steer rides — must reach the wire with its `{{user}}/{{char}}/{{person}}` SUBSTITUTED, never literal (the
  // gap that shipped `write as {{user}}` raw and let the weak 8B drift into the character's voice). Fires with
  // NO `guided` at all → the `appendUserTurn` nudge, rendered via `nudgeOf` → `resolveNudgeText`.
  test("the UNSTEERED impersonate nudge reaches the wire with {{user}}/{{char}}/{{person}} SUBSTITUTED (never literal)", async () => {
    // A room with a host persona + a named character "aria". The harness's foreign-inputs resolver binds the
    // active persona name to "Alex" ({{user}}); the character is "aria" ({{char}}) — the two names that must
    // appear SUBSTITUTED in the wire nudge (not literal `{{user}}/{{char}}`).
    const host = await seedUser(db, castId<Handle>("host"));
    const hostPersona = await seedPersona(host, "host_pov");
    const chatId = await seedChat(db, "a", { metadata: { group: { output: "per-speaker", policy: "natural" } } });
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host", activePersonaId: hostPersona });
    const cid = await seedCharacter(db, host, "aria");
    await seedParticipant(db, { chatId, key: "aria", characterId: cid, joinSeq: 0 });
    const requests: unknown[] = [];
    const h = harness(db, { [cid]: "aria" }, { onChatRequest: (r) => requests.push(r) });

    // NO guided steer → the unsteered impersonate nudge is the only steering appended.
    await drainImpersonation(h.turn.impersonateStream({ principal: principal(host), chatId }));

    const wire = JSON.stringify(requests);
    // {{user}}→persona name (harness "Alex"), {{char}}→character name ("aria"), {{person}}→the "first"
    // default — all RESOLVED, so the nudge reads "... AS Alex (not aria) ..." not "... AS {{user}} (not {{char}})".
    expect(wire).toContain("AS Alex (not aria)"); // {{user}} + {{char}} both substituted, in the right slots
    expect(wire).toContain("first-person perspective"); // {{person}} default
    // The proven voice-lock lead survived to the wire.
    expect(wire).toContain("Ignore all previous instructions");
    // NOT literal braces — the exact substitution bug this fix closes.
    expect(wire).not.toContain("{{user}}");
    expect(wire).not.toContain("{{char}}");
    expect(wire).not.toContain("{{person}}");
  });
});

// F1 (the ST `injection_trigger` gate, live-wired): the verb maps its `TurnKind` → the assemble ctx's
// `generationType` (turn.ts `GENERATION_TYPE_FOR_KIND`) so a trigger-gated preset section fires on the RIGHT
// turn kind. Before F1 every live turn hardcoded "normal", so `trigger:["continue"]` NEVER fired and
// `trigger:["normal"]` fired on swipe/continue too. These pins drive REAL turns end-to-end (production supplies
// the type — no hand-fed `generationType`) and read the wire the engine dispatched.
const NORMAL_MARK = "NORMAL-TRIGGER-SECTION";
const CONTINUE_MARK = "CONTINUE-TRIGGER-SECTION";
function triggerGatedConfig(): PromptConfig {
  const sections = [
    { type: "marker", id: "m1", name: "sys", marker: "main_prompt", role: "system", enabled: true },
    {
      type: "literal",
      id: "l-normal",
      name: "normal-only",
      role: "system",
      content: NORMAL_MARK,
      enabled: true,
      trigger: ["normal"],
    },
    {
      type: "literal",
      id: "l-continue",
      name: "continue-only",
      role: "system",
      content: CONTINUE_MARK,
      enabled: true,
      trigger: ["continue"],
    },
    {
      type: "marker",
      id: "m2",
      name: "hist",
      marker: "chat_history",
      role: "system",
      enabled: true,
    },
  ] satisfies PromptSection[];
  return {
    schemaVersion: 3,
    sections,
    params: {},
    variables: [],
    userMacros: [],
    prose: {},
  } satisfies PromptConfig;
}

describe("F1 — injection_trigger gate is wired per TurnKind (not hardcoded normal)", () => {
  test("send drives generationType 'normal' → the normal-gated section fires, the continue-gated one does not", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const requests: unknown[] = [];
    const h = harness(db, names, {
      promptConfig: triggerGatedConfig(),
      onChatRequest: (r) => requests.push(r),
    });

    await h.turn.send({ principal: principal(host), chatId, content: "hi" });

    const wire = JSON.stringify(requests);
    expect(wire).toContain(NORMAL_MARK);
    expect(wire).not.toContain(CONTINUE_MARK);
  });

  test("swipe drives generationType 'swipe' → NEITHER the normal- nor the continue-gated section fires", async () => {
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria"]);
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "hi" });
    const { messageId } = await seedMessage(db, chatId, 2, {
      role: "assistant",
      characterId: chars[0] as CharacterId,
      content: "first take",
    });
    const requests: unknown[] = [];
    const h = harness(db, names, {
      promptConfig: triggerGatedConfig(),
      onChatRequest: (r) => requests.push(r),
    });

    await h.turn.swipe({ principal: principal(host), chatId, messageId });

    const wire = JSON.stringify(requests);
    expect(wire).not.toContain(NORMAL_MARK);
    expect(wire).not.toContain(CONTINUE_MARK);
  });

  test("continue drives generationType 'continue' → the continue-gated section fires, the normal-gated one does not", async () => {
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria"]);
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "hi" });
    const { messageId } = await seedMessage(db, chatId, 2, {
      role: "assistant",
      characterId: chars[0] as CharacterId,
      content: "the tale so far",
    });
    const requests: unknown[] = [];
    const h = harness(db, names, {
      promptConfig: triggerGatedConfig(),
      onChatRequest: (r) => requests.push(r),
    });

    await h.turn.continueTurn({ principal: principal(host), chatId, messageId });

    const wire = JSON.stringify(requests);
    expect(wire).toContain(CONTINUE_MARK);
    expect(wire).not.toContain(NORMAL_MARK);
  });
});

describe("swipe — append-variant on an existing assistant slot (D26)", () => {
  test("appends a variant + advances the selection; slot attribution unchanged", async () => {
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria"]);
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "hi" });
    const { messageId } = await seedMessage(db, chatId, 2, {
      role: "assistant",
      characterId: chars[0] as CharacterId,
      content: "first take",
    });
    const h = harness(db, names);

    const outcome = await h.turn.swipe({ principal: principal(host), chatId, messageId });

    expect(outcome.messages).toHaveLength(1);
    expect(outcome.messages[0]?.id).toBe(messageId);
    expect(outcome.messages[0]?.variantCount).toBe(2);
    expect(outcome.messages[0]?.selectedVariantIdx).toBe(1);
    expect(outcome.messages[0]?.content).toBe("Hi there");
    expect(outcome.messages[0]?.characterId).toBe(chars[0]);
    expect(await loadCanonHistory(db, chatId)).toHaveLength(2);
  });

  test("swiping a non-assistant slot is a leak-free NOT_FOUND", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "user",
      authorUserId: host,
      content: "hi",
    });
    const h = harness(db, names);
    await expect(h.turn.swipe({ principal: principal(host), chatId, messageId })).rejects.toBeInstanceOf(ChatNotFoundError);
  });
});

describe("continueTurn / undoContinue / revertContinue — extend in place (D26)", () => {
  test("continue extends; undo restores the pre-continue state; revert re-applies it", async () => {
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria"]);
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "hi" });
    const { messageId } = await seedMessage(db, chatId, 2, {
      role: "assistant",
      characterId: chars[0] as CharacterId,
      content: "Once upon a time",
    });
    const h = harness(db, names);

    const cont = await h.turn.continueTurn({ principal: principal(host), chatId, messageId });
    expect(cont.messages[0]?.content).toBe("Once upon a timeHi there");

    const undone = await h.turn.undoContinue({ principal: principal(host), chatId, messageId });
    expect(undone.content).toBe("Once upon a time");
    expect((await db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, host)))[0]?.version).toBe(1);

    const reverted = await h.turn.revertContinue({ principal: principal(host), chatId, messageId });
    expect(reverted.content).toBe("Once upon a timeHi there");
    expect((await db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, host)))[0]?.version).toBe(2);
  });

  test("undoContinue on a never-continued variant is refused no_continuation", async () => {
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria"]);
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: chars[0] as CharacterId,
      content: "plain",
    });
    const h = harness(db, names);
    await expect(h.turn.undoContinue({ principal: principal(host), chatId, messageId })).rejects.toMatchObject({ code: "no_continuation" });
  });
});

describe("impersonateStream — a NON-PERSISTING, STREAMING user-line generation (composer fill)", () => {
  test("STREAMS the drafted user line as text deltas and writes NO canon (the user reviews + commits normally)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);

    // A 0-message chat: impersonate drafts the user's OPENING line (the ST sibling of "generate opening").
    // Collect the deltas — each `onText` from the generation stream yields one `{ delta }` (the scripted
    // runner emits the reply as one text delta; the client CT proves multi-delta progressive fill).
    const deltas: string[] = [];
    for await (const { delta } of h.turn.impersonateStream({ principal: principal(host), chatId })) {
      deltas.push(delta);
    }

    // At least one text delta arrived, and the accumulation IS the scripted reply.
    expect(deltas.length).toBeGreaterThan(0);
    expect(deltas.join("")).toBe("Hi there");
    // Nothing persisted — the canon is still empty (no user slot flashed into the conversation).
    expect(await loadCanonHistory(db, chatId)).toHaveLength(0);
  });

  // ── #1464: the draft is a TURN, and every turn is abortable ────────────────────────────────────────────
  // `abort` works by signalling the chat's registered in-flight turns; a generation that never registers is
  // unreachable from the Stop control no matter what the transport does. And an async generator whose
  // consumer walks away is finalized — the run it started must be cancelled there, or the draft keeps
  // generating (and billing) for a composer nobody is watching.
  /** A provider stream that yields one delta and then parks until the threaded signal aborts. Records the
   *  signal it was handed so the early-return pin can read the cancellation the verb owes it. */
  function parkingStream(seen: { signal: AbortSignal | undefined }): ChatContext["runChatTurn"] {
    return (request) =>
      (async function* (): AsyncGenerator<TurnStreamChunk> {
        seen.signal = request.signal;
        yield { kind: "text", text: "drafted line" };
        await new Promise<void>((resolve) => {
          request.signal?.addEventListener("abort", () => resolve(), { once: true });
        });
      })();
  }

  test("the stream REGISTERS with activeTurns, so abort() reaches it and ends the draft", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const seen: { signal: AbortSignal | undefined } = { signal: undefined };
    const h = harness(db, names, { runChatTurn: parkingStream(seen) });

    const iter = h.turn.impersonateStream({ principal: principal(host), chatId })[Symbol.asyncIterator]();
    expect((await iter.next()).value?.delta).toContain("drafted");

    // The in-flight draft is visible to the room's turn registry — which is the ONLY thing `abort` can see.
    expect(h.activeTurns.countActive(chatId)).toBe(1);
    expect(h.activeTurns.abort(chatId, host)).toMatchObject({ aborted: 1 });
    // The cancelled generation ends the stream instead of stranding the consumer.
    expect((await iter.next()).done).toBe(true);
    expect(h.activeTurns.countActive(chatId)).toBe(0);
  });

  test("a consumer that walks away CANCELS the run (generator finalization, not a zombie generation)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const seen: { signal: AbortSignal | undefined } = { signal: undefined };
    const h = harness(db, names, { runChatTurn: parkingStream(seen) });

    const iter = h.turn.impersonateStream({ principal: principal(host), chatId })[Symbol.asyncIterator]();
    await iter.next();
    expect(seen.signal?.aborted).toBe(false);

    // The composer closed / the subscription ended: the consumer stops iterating.
    await iter.return?.(undefined);

    expect(seen.signal?.aborted).toBe(true);
    expect(h.activeTurns.countActive(chatId)).toBe(0);
  });
});

describe("generate — LOCK-FREE (runs concurrent with a held send lock)", () => {
  test("commits while a foreign lock is held; a locked send yields its round on the same chat", async () => {
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);
    await tryAcquireLock(db, {
      chatId,
      holder: "other-replica",
      now: FROZEN_AT,
      expiresAt: FROZEN_AT + 60_000,
    });

    // A locked round path (send → the engine acquires the per-speaker lock) YIELDS the round (§6 — a
    // human send interleaved): the user row commits, the speaker turn is refused by the lock, driveRound
    // stops with what committed so far. (The deleted simpleSend hit the engine directly and REJECTED
    // `locked` — the round path's yield is the production behavior; PD-95.)
    const locked = await h.turn.send({ principal: principal(host), chatId, content: "blocked" });
    expect(locked.messages).toHaveLength(1);
    expect(locked.messages[0]?.role).toBe("user");

    // …but the lock-free generate commits concurrently.
    const outcome = await h.turn.generate({ principal: principal(host), chatId });
    expect(outcome.messages).toHaveLength(1);
    expect(outcome.messages[0]?.role).toBe("assistant");
    expect(outcome.messages[0]?.characterId).toBe(chars[0]);
  });
});

describe("send — SEND USER_INPUT regex (D53; the chat design doc §2/§7)", () => {
  test("the persisted user row is the POST-USER_INPUT-regex text (canon-mutating at write)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const script = regexScriptSchema.parse({
      id: mintTypeId(ID_PREFIX.regexScript),
      name: "u",
      // X-16: `updatedAt` is REQUIRED on the row (the edited stamp) — a fixed instant keeps the double honest.
      updatedAt: 1_700_000_000_000,
      findRegex: "badword",
      replaceString: "****",
      placement: ["USER_INPUT"],
    });
    const h = harness(db, names, { hostTierRegexScripts: [script] });

    const outcome = await h.turn.send({
      principal: principal(host),
      chatId,
      content: "this is a badword here",
    });

    // The user row returned by the verb is the transformed text…
    expect(outcome.messages[0]?.role).toBe("user");
    expect(outcome.messages[0]?.content).toBe("this is a **** here");
    // …and the PERSISTED canon row reflects it (re-loaded from the db — the stored row is post-regex).
    const canon = await loadCanonHistory(db, chatId);
    expect(canon.find((m) => m.role === "user")?.content).toBe("this is a **** here");
  });

  test("no host-tier scripts → the row is the RAW composer text (member has no entry point — D19)", async () => {
    // The verb's ONLY regex source is the host-tier union the gather computes under `runAsUserId`.
    // A non-host member's scripts have no parameter on that surface (structural — see regex-tier.test.ts), so
    // with none supplied the composer text is persisted verbatim.
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);

    const outcome = await h.turn.send({
      principal: principal(host),
      chatId,
      content: "raw badword text",
    });
    expect(outcome.messages[0]?.content).toBe("raw badword text");
  });
});

// ── Cross-chat IDOR (stickler F1): a message-targeting turn verb gates `requireParticipant(chatId)` but
// then loads + mutates the target by bare `messageId`. Before the fix, `loadSlotTarget`/`loadContinueSnapshot`
// queried `WHERE messages.id = ?` with NO chatId predicate, so a member of chat A passing `{chatId: A,
// messageId: <a message in chat B>}` could read + append to B's canon as a non-member. The loaders are now
// chat-scoped in-query, so a foreign message is indistinguishable from a nonexistent one and B stays untouched.
describe("cross-chat IDOR (F1) — swipe/continue/undo must be scoped to chatId", () => {
  /** Victim room B (alice hosts, one character, one assistant message M) + attacker room A (bob hosts). Bob is
   *  a PRESENT member of A [so `requireParticipant(A)` passes] and a NON-member of B. */
  async function seedTwoRooms(): Promise<{
    alice: UserId;
    bob: UserId;
    victimChat: ChatId;
    attackerChat: ChatId;
    victimMessageId: MessageId;
    names: Record<string, string>;
  }> {
    const alice = await seedUser(db, castId<Handle>("alice"));
    const bob = await seedUser(db, castId<Handle>("bob"));
    const victimChat = await seedChat(db, "victim", {
      metadata: { group: { output: "per-speaker", policy: "natural" } },
    });
    await seedParticipant(db, { chatId: victimChat, key: "va", userId: alice, role: "host" });
    const victimChar = await seedCharacter(db, alice, "vic");
    await seedParticipant(db, {
      chatId: victimChat,
      key: "vc",
      characterId: victimChar,
      joinSeq: 0,
    });
    await seedMessage(db, victimChat, 1, {
      role: "user",
      authorUserId: alice,
      content: "victim opening",
    });
    const { messageId: victimMessageId } = await seedMessage(db, victimChat, 2, {
      role: "assistant",
      characterId: victimChar,
      content: "victim canon",
    });
    const attackerChat = await seedChat(db, "attacker", {
      metadata: { group: { output: "per-speaker", policy: "natural" } },
    });
    await seedParticipant(db, { chatId: attackerChat, key: "ab", userId: bob, role: "host" });
    return {
      alice,
      bob,
      victimChat,
      attackerChat,
      victimMessageId,
      names: { [victimChar]: "vic" },
    };
  }

  /** A messageId that exists in NO chat — the nonexistent-message control (the response a foreign id must match). */
  const ghost = castId<MessageId>("message_ghost");

  test("swipe with a chat-B messageId is refused identically to a nonexistent id — B's canon untouched", async () => {
    const room = await seedTwoRooms();
    const h = harness(db, room.names);

    // Bob (host of A, non-member of B) targets B's assistant message via A → leak-free NOT_FOUND…
    await expect(
      h.turn.swipe({
        principal: principal(room.bob),
        chatId: room.attackerChat,
        messageId: room.victimMessageId,
      }),
    ).rejects.toBeInstanceOf(ChatNotFoundError);
    // …indistinguishable from a genuinely nonexistent message in A.
    await expect(
      h.turn.swipe({
        principal: principal(room.bob),
        chatId: room.attackerChat,
        messageId: ghost,
      }),
    ).rejects.toBeInstanceOf(ChatNotFoundError);

    // B's canon is unmutated: M still carries its single original variant (no appended swipe, no flip).
    const canonB = await loadCanonHistory(db, room.victimChat);
    const m = canonB.find((row) => row.id === room.victimMessageId);
    expect(m?.content).toBe("victim canon");
    expect(m?.variantCount).toBe(1);
  });

  test("continueTurn with a chat-B messageId is refused identically to a nonexistent id — B's canon untouched", async () => {
    const room = await seedTwoRooms();
    const h = harness(db, room.names);

    await expect(
      h.turn.continueTurn({
        principal: principal(room.bob),
        chatId: room.attackerChat,
        messageId: room.victimMessageId,
      }),
    ).rejects.toBeInstanceOf(ChatNotFoundError);
    await expect(
      h.turn.continueTurn({
        principal: principal(room.bob),
        chatId: room.attackerChat,
        messageId: ghost,
      }),
    ).rejects.toBeInstanceOf(ChatNotFoundError);

    const canonB = await loadCanonHistory(db, room.victimChat);
    expect(canonB.find((row) => row.id === room.victimMessageId)?.content).toBe("victim canon");
  });

  test("undoContinue with a chat-B messageId is refused no_continuation — B's real continuation stays intact", async () => {
    const room = await seedTwoRooms();
    const h = harness(db, room.names);

    // Alice legitimately continues M in B → writes the D26 snapshot columns + extends the content (so the
    // foreign undo below WOULD succeed against an unscoped loader — this is the real exploit precondition).
    const cont = await h.turn.continueTurn({
      principal: principal(room.alice),
      chatId: room.victimChat,
      messageId: room.victimMessageId,
    });
    expect(cont.messages[0]?.content).toBe("victim canonHi there");

    // Bob (member of A, non-member of B) tries to roll back B's continuation via A → no_continuation…
    await expect(
      h.turn.undoContinue({
        principal: principal(room.bob),
        chatId: room.attackerChat,
        messageId: room.victimMessageId,
      }),
    ).rejects.toMatchObject({ code: "no_continuation" });
    // …indistinguishable from a nonexistent message in A (both hit the empty-snapshot refusal).
    await expect(
      h.turn.undoContinue({
        principal: principal(room.bob),
        chatId: room.attackerChat,
        messageId: ghost,
      }),
    ).rejects.toMatchObject({ code: "no_continuation" });

    // B's continuation is intact: bob's undo did NOT restore the pre-continue content.
    const canonB = await loadCanonHistory(db, room.victimChat);
    expect(canonB.find((row) => row.id === room.victimMessageId)?.content).toBe("victim canonHi there");
  });
});

// TODO(#60): C5 (reattribution flips the stamp — a persona/character re-stamp re-resolves BOTH the
// macro subject and the attribution chrome from the SAME producer, content untouched) is out of scope
// here; it rides task #60 (persona reattribution, in flight separately per Chat-Macro-Resolution.md §5).

// ── Storage stays RAW (D51) — task #59 S5. Chat-Macro-Resolution.md §0: content stores literal
// `{{macros}}`; resolution happens ONLY at consumption (ASSEMBLE/DISPLAY), never at write. This is the
// real-DB pin: a full send/persist round-trip with `{{user}}`/`{{char}}` in BOTH the user's composer text
// and the model's reply must leave the committed canon row's `content` byte-identical to the raw macro
// text — never resolved to a name, even though the SAME turn's assemble ctx carries a real persona.
describe("storage stays RAW (D51) — macros in message content are never resolved at persist time", () => {
  test("the committed user AND assistant rows still hold the literal {{user}}/{{char}} tokens", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    // No host-tier regex rides this turn — the user text and the scripted reply both carry raw macros.
    const h = harness(db, names, { content: "{{char}} nods at {{user}}." });

    const outcome = await h.turn.send({
      principal: principal(host),
      chatId,
      content: "{{user}} waves at {{char}}.",
    });

    // The verb's OWN return value is unresolved…
    expect(outcome.messages[0]?.content).toBe("{{user}} waves at {{char}}.");
    expect(outcome.messages[1]?.content).toBe("{{char}} nods at {{user}}.");

    // …and a FRESH re-read of the persisted canon (real libSQL, not the in-memory return value) proves the
    // row was never mutated at write: the stored content is the SAME literal macro text.
    const canon = await loadCanonHistory(db, chatId);
    expect(canon.map((m) => m.content)).toEqual(["{{user}} waves at {{char}}.", "{{char}} nods at {{user}}."]);
  });
});

// The non-human turn seam — the walls, none optional. requestTurn is
// principal-free: the funding host is resolved from the room and the responsible human remains the initiator.
// No infinite cascade, no cross-tenant trigger. The
// budget and consent walls were retired with their belts (§14 F11/F13), so two of the original four remain.
describe("requestTurn — the non-human turn seam (walls: depth · authority)", () => {
  test("FIRES + STAMPS initiator/depth on the reply (the getTurnOrigin round-trip)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const author = await seedUser(db, castId<Handle>("automation-author"));
    await seedParticipant(db, { chatId, key: "automation-author", userId: author, role: "member" });
    const attribution = triggeredBySpyRpg();
    const h = harness(db, names, { rpg: attribution.rpg });

    const outcome = await h.requestTurn({ chatId, initiator: "automation", triggeredBy: author, automationDepth: 2 });

    // FIRES — one assistant reply committed; a non-human turn adds NO user line.
    expect(outcome.aborted).toBe(false);
    expect(outcome.messages).toHaveLength(1);
    expect(outcome.messages[0]?.role).toBe("assistant");
    expect(h.connectionFunders).toEqual([host]);
    expect(attribution.triggeredBy).toEqual([author]);
    // ORIGIN — the reply slot carries the non-human origin the cascade guard reads back through getTurnOrigin.
    const replyId = outcome.messages[0]?.id;
    expect(replyId).toBeDefined();
    expect(replyId !== undefined ? await loadTurnOrigin(db, chatId, replyId) : null).toEqual({ initiator: "automation", automationDepth: 2 });
    // A human turn in the same room stays byte-identical: its reply is born human/depth-0 (the column defaults).
    const send = await h.turn.send({ principal: principal(host), chatId, content: "hi" });
    const humanReplyId = send.messages[1]?.id;
    expect(humanReplyId !== undefined ? await loadTurnOrigin(db, chatId, humanReplyId) : null).toEqual({ initiator: "human", automationDepth: 0 });
  });

  test("WALL 1 (depth): a turn stamped PAST the hard cap is refused (cascade_depth_exceeded); nothing commits", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);

    await expect(h.requestTurn({ chatId, initiator: "automation", triggeredBy: host, automationDepth: AUTOMATION_DEPTH_HARD_CAP + 1 })).rejects.toMatchObject({
      code: "cascade_depth_exceeded",
    });
    expect(await loadCanonHistory(db, chatId)).toHaveLength(0);
  });

  test("WALL 2 (cross-tenant): an initiator with NO membership cannot trigger a turn — leak-free NOT_FOUND, nothing commits", async () => {
    const { chatId, names } = await seedRoom("natural", ["aria"]);
    const stranger = await seedUser(db, castId<Handle>("stranger")); // a real user, but NOT a participant of this chat
    const h = harness(db, names);

    await expect(h.requestTurn({ chatId, initiator: "automation", triggeredBy: stranger, automationDepth: 1 })).rejects.toMatchObject({
      name: "ChatNotFoundError",
    });
    expect(await loadCanonHistory(db, chatId)).toHaveLength(0);
  });

  // A separate by-proxy consent wall is gone: accepting the host seat accepts room-turn liability, so
  // `assertMaxProSubConsent` and `consent_required` no longer exist. The walls that remain are pinned above.

  test("a 'plugin' initiator is accepted + stamped (the membrane seam); a 'human' initiator is refused (no forged human turn)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);

    // The plugin membrane calls this exact shape (installer as initiator, cascade depth from the invocation).
    const outcome = await h.requestTurn({ chatId, initiator: "plugin", triggeredBy: host, automationDepth: 1 });
    const replyId = outcome.messages[0]?.id;
    expect(replyId !== undefined ? await loadTurnOrigin(db, chatId, replyId) : null).toEqual({ initiator: "plugin", automationDepth: 1 });

    await expect(h.requestTurn({ chatId, initiator: "human", triggeredBy: host, automationDepth: 0 })).rejects.toMatchObject({
      code: "forbidden_override",
    });
  });
});

// ═══ WAVE MU: the LOAD-BEARING pin — a random-pick user macro resolves in a turn AND a SWIPE replays the ═══
// ═══ identical draw, through the REAL assembly + persistence path (freeze-at-commit determinism). ══════════

/** A preset with a random-pick user macro `{{mood}}` (one input `tone` over a 4-option pool) referenced from
 *  an enabled literal SYSTEM section, so the drawn value renders into the assembled prompt's static half. */
function userMacroPromptConfig(): PromptConfig {
  return {
    ...DEFAULT_PROMPT_CONFIG,
    userMacros: [
      {
        name: "mood",
        description: "the scene tone",
        args: [],
        body: "{{tone}}",
        strict: false,
        inputs: [
          {
            kind: "random-pick",
            name: "tone",
            label: "Tone",
            options: [
              { label: "Grim", value: "grim" },
              { label: "Warm", value: "warm" },
              { label: "Tense", value: "tense" },
              { label: "Wry", value: "wry" },
            ],
            separator: ", ",
            onValue: "",
            offValue: "",
            defaultValue: "",
          },
        ],
      },
    ],
    sections: [
      { type: "literal", id: "mood-line", name: "mood", role: "system", content: "Scene tone: {{mood}}.", enabled: true },
      ...DEFAULT_PROMPT_CONFIG.sections,
    ],
  };
}

/** The four pool values one of which the draw resolves to (the assertion vocabulary). */
const MOOD_POOL = ["grim", "warm", "tense", "wry"] as const;

/** The assembled-prompt line the `{{mood}}` macro renders into ("Scene tone: <drawn>."). */
const MOOD_LINE_RE = /Scene tone: (\w+)\./;

/** Extract the drawn tone from a captured wire request's assembled static prompt ("Scene tone: <v>."). */
function drawnToneFrom(request: unknown): string | undefined {
  const staticPrompt = (request as { prompt?: { static?: string } }).prompt?.static ?? "";
  return MOOD_LINE_RE.exec(staticPrompt)?.[1];
}

describe("WAVE MU — user-macro random-pick delivery + swipe replay (the REAL assembly+persistence path)", () => {
  test("a random-pick macro resolves into the turn's prompt AND persists its draw; a SWIPE replays the identical draw", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const requests: unknown[] = [];
    const h = harness(db, names, { promptConfig: userMacroPromptConfig(), onChatRequest: (r) => requests.push(r) });

    // ── The SEND: a fresh draw renders into the assembled prompt + persists onto the committed variant. ──
    const sent = await h.turn.send({ principal: principal(host), chatId, content: "hello" });
    const drawn = drawnToneFrom(requests.at(-1));
    expect(drawn).toBeDefined();
    expect(MOOD_POOL).toContain(drawn);

    const replyId = sent.messages.find((m) => m.role === "assistant")?.id;
    expect(replyId).toBeDefined();
    const target0 = replyId !== undefined ? await loadSlotTarget(db, chatId, replyId) : undefined;
    // The persisted draw record matches EXACTLY what rendered into the prompt (write ↔ render agree).
    expect(target0?.macroDraws).toEqual({ mood: { tone: drawn } });

    // ── The SWIPE: re-generates the SAME slot; the prng would draw afresh, but the frozen record replays. ──
    requests.length = 0;
    if (replyId === undefined) {
      throw new Error("expected an assistant reply to swipe");
    }
    await h.turn.swipe({ principal: principal(host), chatId, messageId: replyId });
    const swipeDrawn = drawnToneFrom(requests.at(-1));
    // THE PIN: the swipe's prompt carries the ORIGINAL drawn value (replay, not a fresh draw).
    expect(swipeDrawn).toBe(drawn);
    // …and the appended (now-selected) variant re-persists the identical record.
    const target1 = await loadSlotTarget(db, chatId, replyId);
    expect(target1?.macroDraws).toEqual({ mood: { tone: drawn } });
  });

  test("a pre-feature assistant slot (no persisted draws) swipes with a FRESH draw and records it", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    // Seed an assistant row directly (no macro_draws) — the pre-feature / migrated-slot case.
    const { messageId } = await seedMessage(db, chatId, 1, { role: "assistant", characterId: null, content: "an old reply" });
    const requests: unknown[] = [];
    const h = harness(db, names, { promptConfig: userMacroPromptConfig(), onChatRequest: (r) => requests.push(r) });

    const target = await loadSlotTarget(db, chatId, messageId);
    expect(target?.macroDraws).toBeNull(); // no record to replay

    await h.turn.swipe({ principal: principal(host), chatId, messageId });
    const drawn = drawnToneFrom(requests.at(-1));
    expect(MOOD_POOL).toContain(drawn); // a fresh draw happened
    const after = await loadSlotTarget(db, chatId, messageId);
    expect(after?.macroDraws).toEqual({ mood: { tone: drawn } }); // and was recorded on the new variant
  });

  test("spec §5 item 3: a NEW send AFTER the first draws FRESH — a different draw in BOTH the prompt AND the record", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const requests: unknown[] = [];
    // A prng returning a FIXED SEQUENCE of pool indices (floor(v*4)): 0→grim (send #1), 0.9→wry (send #2),
    // so each fresh send draws a DIFFERENT, deterministic value. A solo natural room consumes the prng only
    // for the user-macro draw, so index i is turn i's draw.
    const seq = [0, 0.9];
    let i = 0;
    const prng = (): number => seq[Math.min(i++, seq.length - 1)] ?? 0;
    const h = harness(db, names, { promptConfig: userMacroPromptConfig(), onChatRequest: (r) => requests.push(r), prng });

    const sent1 = await h.turn.send({ principal: principal(host), chatId, content: "one" });
    const drawn1 = drawnToneFrom(requests.at(-1));
    expect(drawn1).toBe("grim");
    const reply1 = sent1.messages.find((m) => m.role === "assistant")?.id;
    expect(reply1 !== undefined ? (await loadSlotTarget(db, chatId, reply1))?.macroDraws : undefined).toEqual({ mood: { tone: "grim" } });

    // ── A NEW send: a FRESH draw (not the prior turn's frozen record) — a new slot, a new value. ──
    requests.length = 0;
    const sent2 = await h.turn.send({ principal: principal(host), chatId, content: "two" });
    const drawn2 = drawnToneFrom(requests.at(-1));
    expect(drawn2).toBe("wry");
    expect(drawn2).not.toBe(drawn1); // the new turn drew fresh, in the prompt…
    const reply2 = sent2.messages.find((m) => m.role === "assistant")?.id;
    expect(reply2).not.toBe(reply1); // a distinct slot
    expect(reply2 !== undefined ? (await loadSlotTarget(db, chatId, reply2))?.macroDraws : undefined).toEqual({ mood: { tone: "wry" } }); // …and in the record
  });

  test("W5 wired store: a STORED single-select pick (chats.user_macro_values) resolves into the turn's prompt", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    // Persist a per-chat pick for the random-pick input `tone` = "warm" (a stored single value NARROWS the
    // pool to exactly that option, so the draw is deterministic regardless of the prng — the store is wired).
    await db
      .update(chats)
      .set({ userMacroValues: { mood: { tone: ["warm"] } } })
      .where(eq(chats.id, chatId));
    const requests: unknown[] = [];
    // A prng that would draw index 0 (grim) from the FULL pool — proving the STORE, not the prng, chose "warm".
    const h = harness(db, names, { promptConfig: userMacroPromptConfig(), onChatRequest: (r) => requests.push(r), prng: () => 0 });

    const sent = await h.turn.send({ principal: principal(host), chatId, content: "hello" });
    // The stored pick narrowed the pool to ["warm"], so the turn resolves + records "warm" (not the prng's grim).
    expect(drawnToneFrom(requests.at(-1))).toBe("warm");
    const replyId = sent.messages.find((m) => m.role === "assistant")?.id;
    expect(replyId !== undefined ? (await loadSlotTarget(db, chatId, replyId))?.macroDraws : undefined).toEqual({ mood: { tone: "warm" } });
  });

  test("spec §5 item 4: continueTurn replays the ORIGINAL draw end-to-end through the verb; the record survives", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const requests: unknown[] = [];
    // A length-capped reply so the continue extends it (finishReason:"length" per the continue mechanics).
    const h = harness(db, names, {
      promptConfig: userMacroPromptConfig(),
      onChatRequest: (r) => requests.push(r),
      replyTape: [{ content: "part one", finishReason: "length" }, { content: " part two" }],
    });

    const sent = await h.turn.send({ principal: principal(host), chatId, content: "hello" });
    const drawn = drawnToneFrom(requests.at(-1));
    expect(MOOD_POOL).toContain(drawn);
    const replyId = sent.messages.find((m) => m.role === "assistant")?.id;
    if (replyId === undefined) {
      throw new Error("expected an assistant reply to continue");
    }

    // ── The CONTINUE: re-assembles through the verb; the prompt carries the ORIGINAL drawn value (replay). ──
    requests.length = 0;
    await h.turn.continueTurn({ principal: principal(host), chatId, messageId: replyId });
    expect(drawnToneFrom(requests.at(-1))).toBe(drawn); // the extension prompt replays the same draw
    // The continued variant re-stamps the identical record (never nulled by the in-place continue write).
    expect((await loadSlotTarget(db, chatId, replyId))?.macroDraws).toEqual({ mood: { tone: drawn } });
  });
});

// ═══ The GAME's user macros (owner ruling #20's second definition home) reach the SAME turn resolution, ═══
// ═══ and shadow the preset's on a name clash (the 2026-08-01 collision ruling). Through the REAL path. ════

/** The game's own `{{mood}}` — a SINGLE-SELECT (never draws), so which def the turn resolved is readable off
 *  both the rendered prompt and the persisted draw record. */
function gameMoodDef(): UserMacroSpec {
  return {
    name: "mood",
    description: "the game's scene tone",
    args: [],
    body: "{{tone}}",
    strict: false,
    inputs: [
      {
        kind: "single-select",
        name: "tone",
        label: "Tone",
        options: [
          { label: "Doomed", value: "doomed" },
          { label: "Hopeful", value: "hopeful" },
        ],
        separator: ", ",
        onValue: "",
        offValue: "",
        defaultValue: "doomed",
      },
    ],
  };
}

/** A minimal `ctx.rpg` that declares game user macros and nothing else (gather stays `null` — a non-game
 *  turn everywhere BUT the macro-declaration op, which is exactly the seam under test).
 *  FABRICATION-OK: the turn path reaches only these ops. */
function macroDeclaringRpg(defs: readonly UserMacroSpec[]): NonNullable<ChatContext["rpg"]> {
  // @orb-waive no-test-fabrication(unknown): minimal ChatRpgOps stub — the turn path reaches only these ops (the `foldedRpg` precedent). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return {
    resolvePresetOverride: () => Promise.resolve(null),
    resolveUserMacros: () => Promise.resolve(defs),
    gatherTurnContext: () => Promise.resolve(null),
    markDicePreRollEligible: () => undefined,
    onUserCommit: () => Promise.resolve(),
    onTurnCompleted: () => Promise.resolve(),
    onTurnAborted: () => Promise.resolve(),
    resolveGmSeatHolderKind: () => Promise.resolve(null),
    resolveReasoningHostOnly: () => Promise.resolve(false),
  } as unknown as NonNullable<ChatContext["rpg"]>;
}

/** The MU prompt config with the preset's own macros REMOVED — the section still references `{{mood}}`, so a
 *  render can only come from the GAME's def. */
function gameOnlyPromptConfig(): PromptConfig {
  return { ...userMacroPromptConfig(), userMacros: [] };
}

describe("WAVE MU — the GAME's user macros (the second definition home) through the real turn", () => {
  test("a GAME-declared macro resolves into the turn's prompt (the preset declares none)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const requests: unknown[] = [];
    const h = harness(db, names, {
      promptConfig: gameOnlyPromptConfig(),
      rpg: macroDeclaringRpg([gameMoodDef()]),
      onChatRequest: (r) => requests.push(r),
    });

    const sent = await h.turn.send({ principal: principal(host), chatId, content: "hello" });
    expect(drawnToneFrom(requests.at(-1))).toBe("doomed"); // the game's def rendered, via its declared default
    const replyId = sent.messages.find((m) => m.role === "assistant")?.id;
    // A single-select never draws → the committed record is empty (nothing to replay on a swipe).
    expect(replyId !== undefined ? (await loadSlotTarget(db, chatId, replyId))?.macroDraws : undefined).toEqual({});
  });

  test("SHADOW: the game's def wins the name — the preset's random-pick never renders and never draws", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const requests: unknown[] = [];
    const h = harness(db, names, {
      // The preset declares the random-pick `{{mood}}`; the game declares its own. Game wins.
      promptConfig: userMacroPromptConfig(),
      rpg: macroDeclaringRpg([gameMoodDef()]),
      onChatRequest: (r) => requests.push(r),
      prng: () => 0, // would draw "grim" from the preset's pool if the preset's def had survived
    });

    const sent = await h.turn.send({ principal: principal(host), chatId, content: "hello" });
    expect(drawnToneFrom(requests.at(-1))).toBe("doomed");
    const replyId = sent.messages.find((m) => m.role === "assistant")?.id;
    expect(replyId !== undefined ? (await loadSlotTarget(db, chatId, replyId))?.macroDraws : undefined).toEqual({});
  });

  test("PICKS SURVIVE THE SHADOW: the stored `mood.tone` pick binds to the GAME's input of that name", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    await db
      .update(chats)
      .set({ userMacroValues: { mood: { tone: "hopeful" } } })
      .where(eq(chats.id, chatId));
    const requests: unknown[] = [];
    const h = harness(db, names, {
      promptConfig: userMacroPromptConfig(),
      rpg: macroDeclaringRpg([gameMoodDef()]),
      onChatRequest: (r) => requests.push(r),
    });

    await h.turn.send({ principal: principal(host), chatId, content: "hello" });
    expect(drawnToneFrom(requests.at(-1))).toBe("hopeful"); // the pick keyed by NAME, not by source
  });

  test("a wired rpg that declares NO game macros leaves the preset's delivery untouched", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const requests: unknown[] = [];
    const h = harness(db, names, {
      promptConfig: userMacroPromptConfig(),
      rpg: macroDeclaringRpg([]),
      onChatRequest: (r) => requests.push(r),
    });

    const sent = await h.turn.send({ principal: principal(host), chatId, content: "hello" });
    const drawn = drawnToneFrom(requests.at(-1));
    expect(MOOD_POOL).toContain(drawn);
    const replyId = sent.messages.find((m) => m.role === "assistant")?.id;
    expect(replyId !== undefined ? (await loadSlotTarget(db, chatId, replyId))?.macroDraws : undefined).toEqual({ mood: { tone: drawn } });
  });
});

// ── R1: the FOLDED state extraction, END TO END through the real verb + engine ────────────────────
// Everything between the gather and the flush is plumbing I could break silently: a game turn's terminal tools
// travel gather → BuiltTurnContext → RoundBase → TurnPrep → runTurnPipeline → the wire, and the completion's
// calls travel back economics → TurnPipelineResult → RpgTurnContext → onTurnCompleted. A typecheck proves it
// compiles; only a real `send` proves the VALUE survives every hop. These drive exactly that.

const RPG_TOOLS = [{ name: "update_scene", description: "the scene", parameters: { type: "object" as const } }];

/** A TOOLS-capable connection — `testConnection`'s minimal descriptor has no `tools` axis, and the pipeline's
 *  terminal-tool gate keys on its presence (an incapable model gets a byte-identical tool-less request). */
// Partial GenerationCapability — only the belt-read fields (TEST_CAPABILITY, see _support.ts) plus the tools
// axis under test are set.
const TOOLS_CONNECTION: Resolved<"chat"> = {
  ...testConnection("vllm"),
  capability: makeCapability({ ...generationOf(testConnection("vllm")), tools: { parallel: true } }),
};

/** A minimal `ctx.rpg` whose GATHER contributes terminal tools (a `folded` game), recording what the FLUSH
 *  was handed back. FABRICATION-OK: the turn path reaches only these ops. */
function foldedRpg(): { flushes: (readonly { name: string; arguments: string }[] | null)[]; rpg: NonNullable<ChatContext["rpg"]> } {
  const flushes: (readonly { name: string; arguments: string }[] | null)[] = [];
  // @orb-waive no-test-fabrication(unknown): the turn path reaches only these ops. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const rpg = {
    resolvePresetOverride: () => Promise.resolve(null),
    resolveUserMacros: () => Promise.resolve([]),
    gatherTurnContext: () => Promise.resolve({ macros: {}, injections: [], tools: [], cardKeepLastX: 0, terminalTools: RPG_TOOLS }),
    markDicePreRollEligible: () => undefined,
    onUserCommit: () => Promise.resolve(),
    // Variadic (not 5 named params): the injected contract is POSITIONAL and this stub only needs the 5th.
    onTurnCompleted: (...args: unknown[]) => {
      const turn = args[4] as { terminalToolCalls: readonly { name: string; arguments: string }[] | null };
      flushes.push(turn.terminalToolCalls);
      return Promise.resolve();
    },
    onTurnAborted: () => Promise.resolve(),
    resolveGmSeatHolderKind: () => Promise.resolve(null),
    resolveReasoningHostOnly: () => Promise.resolve(false),
  } as unknown as NonNullable<ChatContext["rpg"]>;
  return { flushes, rpg };
}

/** A scripted turn that co-emits prose AND tool calls off ONE completion (what a folded character turn does). */
function coEmittingTurn(sink: unknown[], calls: readonly { name: string; args: string }[]): ChatContext["runChatTurn"] {
  return (request) => {
    sink.push(request);
    return (async function* (): AsyncGenerator<TurnStreamChunk> {
      await Promise.resolve();
      yield { kind: "text", text: "She fords the river." };
      yield {
        kind: "final",
        economics: {
          content: "She fords the river.",
          tokensIn: 5,
          tokensOut: 4,
          finishReason: "tool",
          toolCalls: calls.map((c, i) => ({ toolCallId: `call_${i}`, name: c.name, arguments: c.args })),
        },
      };
    })();
  };
}

test("R1 end-to-end: a send mounts the gather's terminal tools on the wire and hands the co-emitted calls to the rpg flush", async () => {
  const host = await seedUser(db, castId<Handle>("r1host"));
  const charA = await seedCharacter(db, host, "aria");
  const chatId = await seedChat(db, "r1_fold");
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: "c", characterId: charA });

  const requests: unknown[] = [];
  const { flushes, rpg } = foldedRpg();
  const h = harness(
    db,
    { [charA]: "Aria" },
    {
      rpg,
      connection: TOOLS_CONNECTION,
      runChatTurn: coEmittingTurn(requests, [{ name: "update_scene", args: '{"location":"the ford"}' }]),
    },
  );

  const out = await h.turn.send({ principal: makePrincipal(host), chatId, content: "I cross the river." });

  // The gather's tools reached the request as the TERMINAL set (the wire's `auto`, which keeps the prose safe,
  // is `@orb/inference`'s projection of it — tests/inference/roles/chat-request.test.ts).
  const req = requests[0] as TurnRequest;
  expect(req.tools?.terminal?.map((t) => t.name)).toEqual(["update_scene"]);
  expect(req.tools?.offer).toBeUndefined();
  // The NARRATIVE committed exactly as always — the state channel changed nothing about the reply.
  expect(out.messages.at(-1)?.content).toBe("She fords the river.");
  // …and the calls arrived at the rpg flush (the fold's input), with nothing executed on the way.
  expect(flushes).toHaveLength(1);
  expect(flushes[0]?.map((c) => c.name)).toEqual(["update_scene"]);
  expect(flushes[0]?.[0]?.arguments).toBe('{"location":"the ford"}');
  // The variant persisted NO toolCalls — the terminal traffic stays server-internal (never executed ⇒ never a
  // `ToolCallRecord`), so it can never reach a member-visible payload the way an executed chat tool does.
  const view = await loadMessageView(db, castId<MessageId>(out.messages.at(-1)?.id ?? ""));
  expect(view?.toolCalls).toEqual([]);
});

test("R1 end-to-end: a game turn that mounts NO terminal tools hands the flush a NULL channel (fall back to a round)", async () => {
  const host = await seedUser(db, castId<Handle>("r1host2"));
  const charA = await seedCharacter(db, host, "aria");
  const chatId = await seedChat(db, "r1_nofold");
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: "c", characterId: charA });

  const requests: unknown[] = [];
  const { flushes, rpg } = foldedRpg();
  // A NON-folded game: same rpg ops, but the gather contributes no terminal tools.
  const plainRpg = { ...rpg, gatherTurnContext: () => Promise.resolve({ macros: {}, injections: [], tools: [], cardKeepLastX: 0 }) };
  const h = harness(
    db,
    { [charA]: "Aria" },
    {
      rpg: plainRpg as NonNullable<ChatContext["rpg"]>,
      connection: TOOLS_CONNECTION,
      runChatTurn: coEmittingTurn(requests, []),
    },
  );

  await h.turn.send({ principal: makePrincipal(host), chatId, content: "I cross the river." });

  expect((requests[0] as { tools?: unknown }).tools).toBeUndefined();
  // NULL, not `[]` — the consumer must be able to tell "no fold happened" from "the fold found nothing".
  expect(flushes).toEqual([null]);
});

// ── R2: THE ATTACH MATRIX, proved on a REAL turn ───────────────────────────────────────────────
// `attachedToolNames` is now the UNION over the S2 teaching contributions' `toolNames` — teach and attach
// travel together (spec R2). `pipeline.test.ts` pins what the pipeline does with a name set; the collector
// unit pins the union itself. These pin the hop between them, which no other test can see: a REGISTERED
// contribution's declared name surviving collect → BuiltTurnContext → TurnPrep → the wire, and the capability
// gate still dropping it on a model that cannot carry tools (attach is capability-gated, authority runs at
// execute).

/** A teaching contribution that declares a registry tool name and teaches nothing. */
function toolDeclaringTeacher(name: string): NonNullable<ChatContext["teaching"]>[number] {
  return { id: "test.attach", order: 1, collect: () => Promise.resolve({ injections: [], toolNames: [name] }) };
}

/** The tool-use ops the attach path needs: resolve the declared names into the opaque `ChatToolSet`, then
 *  project that set into neutral definitions. No fabrication — `ChatToolSet` is `unknown` by contract (chat
 *  never narrows it), so a fake owns its own shape and narrows it back on the way out. */
function fakeChatToolOps(): NonNullable<ChatContext["tools"]> {
  return {
    resolveTools: (_driverUserId, names) => ({ names }),
    toToolDefinitions: (set) =>
      (set as { readonly names: readonly string[] }).names.map((n) => ({ name: n, description: "d", parameters: { type: "object" as const }, inputShape: {} })),
    prepareExecution: () => Promise.resolve(() => Promise.resolve([])),
  };
}

test("R2 end-to-end: a teaching contribution's declared tool name reaches the WIRE on a real send", async () => {
  const { host, chatId, names } = await seedRoom("attach_on", ["aria"]);
  const requests: unknown[] = [];
  const h = harness(db, names, {
    teaching: [toolDeclaringTeacher("tick_clock")],
    tools: fakeChatToolOps(),
    connection: TOOLS_CONNECTION,
    onChatRequest: (req) => requests.push(req),
  });

  await h.turn.send({ principal: principal(host), chatId, content: "how long have we walked?" });

  const attached = requests[0] as TurnRequest;
  expect(attached.tools?.offer?.definitions.map((t) => t.name)).toEqual(["tick_clock"]);
});

test("R2 end-to-end: the SAME declaration on a tools-INCAPABLE model is dropped — attach is capability-gated", async () => {
  const { host, chatId, names } = await seedRoom("attach_off", ["aria"]);
  const requests: unknown[] = [];
  // `testConnection`'s default capability carries no `tools` axis — the honesty gate drops the attachment.
  const h = harness(db, names, {
    teaching: [toolDeclaringTeacher("tick_clock")],
    tools: fakeChatToolOps(),
    onChatRequest: (req) => requests.push(req),
  });

  await h.turn.send({ principal: principal(host), chatId, content: "how long have we walked?" });

  expect((requests[0] as { tools?: unknown }).tools).toBeUndefined();
});

test("R2 end-to-end: NO contribution declares a name — the request carries no tools field (byte-identical)", async () => {
  const { host, chatId, names } = await seedRoom("attach_none", ["aria"]);
  const requests: unknown[] = [];
  const h = harness(db, names, { tools: fakeChatToolOps(), connection: TOOLS_CONNECTION, onChatRequest: (req) => requests.push(req) });

  await h.turn.send({ principal: principal(host), chatId, content: "hello" });

  expect((requests[0] as { tools?: unknown }).tools).toBeUndefined();
});

// D146 / #648 — THE SAME HOP WITH NOTHING FAKED. The three rows above drive a hand-written teacher and a fake
// `ChatToolSet`, which is right for pinning the pipeline's own behaviour; this one closes the last link the
// row's outcome sentence is actually about: a tool a PLUGIN registered at activation, attached by tool-use's
// REAL teaching contribution, resolved by the REAL registry, arriving in the request's tool offer of a real
// send. Unit pins cover the matrix (`tests/server/domain/tool-use/teaching-contribution.test.ts`); this proves
// the hop between them, which no other test can see.
test("R2 end-to-end: a REAL plugin registration reaches the WIRE, and a deactivated one silently does not", async () => {
  const { host, chatId, names } = await seedRoom("attach_plugin", ["aria"]);
  const requests: unknown[] = [];
  const toolUse = createToolUseService({ can: (() => undefined) as Can, clock: () => 0 });
  const handle = toolUse.registerPluginTool({
    name: "plugin_mood_report",
    description: "report the mood",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    installer: principal(host),
    invoke: () => Promise.resolve("ok"),
    resolveInstallerRole: () => Promise.resolve("host"),
  });
  // The tool ops wired the way `entry/compose/chat.ts::buildChatToolOps` wires them: chat's opaque
  // `ChatToolSet` IS the registry's `ResolvedToolSet`, round-tripped through this seam.
  const toolOps: NonNullable<ChatContext["tools"]> = {
    resolveTools: (driverUserId, toolNames) => toolUse.resolveTools(driverUserId, toolNames),
    toToolDefinitions: (set) => toolUse.toToolDefinitions(set as ReturnType<typeof toolUse.resolveTools>),
    prepareExecution: () => Promise.resolve(() => Promise.resolve([])),
  };
  const teaching = createToolUseTeachingContributions({ listDrivableToolNames: toolUse.listDrivableToolNames });
  const h = harness(db, names, { teaching, tools: toolOps, connection: TOOLS_CONNECTION, onChatRequest: (req) => requests.push(req) });

  await h.turn.send({ principal: principal(host), chatId, content: "how do we feel?" });
  expect((requests[0] as TurnRequest).tools?.offer?.definitions.map((t) => t.name)).toEqual(["plugin_mood_report"]);

  // The owner switches the plugin off between turns. `resolveTools` THROWS on an unknown name at attach, so a
  // contribution that had cached its list would fail this send outright; the read-through contribution simply
  // stops naming it, and the turn ships tool-less exactly as it would for a host with no plugins at all.
  handle.unregister();
  await h.turn.send({ principal: principal(host), chatId, content: "and now?" });
  expect((requests[1] as { tools?: unknown }).tools).toBeUndefined();
});

// #677 — THE SAME HOP WITH TWO INSTALLERS. The row above proves one host's plugin reaches the wire; this one
// proves it still does when SOMEONE ELSE has the same plugin installed, which is the normal case now that the
// example plugins seed per user. Pre-fix the second registration threw `ToolNameCollisionError` (so the second
// user's activation landed `errored` and their turn shipped tool-less); the unit pins cover the registry, this
// covers the turn's own resolve, which is the only place the wrong copy could be handed to a real send.
test("R2 end-to-end: a STRANGER holds the same plugin tool name, and the host's turn attaches the HOST's copy", async () => {
  const { host, chatId, names } = await seedRoom("attach_shared", ["aria"]);
  const stranger = await seedUser(db, castId<Handle>("shared_stranger"));
  const toolUse = createToolUseService({ can: (() => undefined) as Can, clock: () => 0 });
  const specFor = (installerUserId: UserId, description: string): Parameters<typeof toolUse.registerPluginTool>[0] => ({
    name: "plugin_mood_report",
    description,
    parameters: { type: "object", properties: {}, additionalProperties: false },
    installer: principal(installerUserId),
    invoke: () => Promise.resolve("ok"),
    resolveInstallerRole: () => Promise.resolve("host"),
  });
  // The stranger enables FIRST — pre-fix this squatted the name and the room host's own activation would have
  // thrown; post-fix both are resident and the turn must pick the host's.
  toolUse.registerPluginTool(specFor(stranger, "the stranger's copy"));
  toolUse.registerPluginTool(specFor(host, "the host's copy"));

  const requests: unknown[] = [];
  const toolOps: NonNullable<ChatContext["tools"]> = {
    resolveTools: (driverUserId, toolNames) => toolUse.resolveTools(driverUserId, toolNames),
    toToolDefinitions: (set) => toolUse.toToolDefinitions(set as ReturnType<typeof toolUse.resolveTools>),
    prepareExecution: () => Promise.resolve(() => Promise.resolve([])),
  };
  const teaching = createToolUseTeachingContributions({ listDrivableToolNames: toolUse.listDrivableToolNames });
  const h = harness(db, names, { teaching, tools: toolOps, connection: TOOLS_CONNECTION, onChatRequest: (req) => requests.push(req) });

  await h.turn.send({ principal: principal(host), chatId, content: "how do we feel?" });

  // The wire `description` is the observable that says WHICH copy rode — the NAME is identical by construction,
  // so a resolve that picked "whoever registered first" would ship the stranger's tool into this room.
  const tools = (requests[0] as TurnRequest).tools?.offer?.definitions;
  expect(tools?.map((t) => t.name)).toEqual(["plugin_mood_report"]);
  expect(tools?.[0]?.description).toBe("the host's copy");
});

// ── M2 keep-last-X: ABSENT ≠ ZERO, proved at the TURN seam ───────────────────────────────────────
// `cardKeepLastX` is contributed ONLY by an rpg game's GATHER, so a chat with no game contributes nothing.
// The verb used to floor that absence to `0` (`rpg?.cardKeepLastX ?? 0`) — the rpg default — which handed
// every NON-game chat the strictest setting of a feature it never opted into: an immersive-character card in
// its history collapsed to `[card: title]` on every single turn, with no knob anywhere to turn it off.
// `pipeline.test.ts` pins the window ARITHMETIC at the engine seam; these two pin that the ABSENCE (and a
// game's explicit `0`) actually survive gather → BuiltTurnContext → TurnPrep → runTurnPipeline on a REAL turn,
// which is the hop that was floored and which no engine-level test can see.

const CARD_FENCE = ':::card title="Terminal"\n<div style="color:red">multi-KB html blob</div>\n:::';

/** Each wire history row flattened to its text (adjacent text parts merge, so a card row is one part). */
function historyTexts(request: unknown): string[] {
  const { history } = request as { history: readonly { content: readonly { type: string; text?: string }[] }[] };
  return history.map((m) => m.content.map((p) => (p.type === "text" ? (p.text ?? "") : "")).join(""));
}

test("M2: a chat with NO rpg game contributes no window — a stored card rides the wire WHOLE", async () => {
  const { host, chatId, names } = await seedRoom("natural", ["aria"]);
  await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: `look:\n${CARD_FENCE}` });
  const requests: unknown[] = [];
  const h = harness(db, names, { onChatRequest: (req) => requests.push(req) });

  await h.turn.generate({ principal: principal(host), chatId });

  const texts = historyTexts(requests[0]);
  expect(texts.some((t) => t.includes("multi-KB html blob"))).toBe(true);
  expect(texts.some((t) => t.includes("[card: Terminal]"))).toBe(false);
});

test("M2: a GAME turn's explicit cardKeepLastX:0 still stubs every stored card (the rpg default is unchanged)", async () => {
  const { host, chatId, names } = await seedRoom("natural", ["aria"]);
  await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: `look:\n${CARD_FENCE}` });
  const requests: unknown[] = [];
  const { rpg } = foldedRpg();
  // A plain (non-folded) game whose gather contributes the rpg default — the arm that must NOT change.
  const gameRpg = { ...rpg, gatherTurnContext: () => Promise.resolve({ macros: {}, injections: [], tools: [], cardKeepLastX: 0 }) };
  const h = harness(db, names, { rpg: gameRpg as NonNullable<ChatContext["rpg"]>, onChatRequest: (req) => requests.push(req) });

  await h.turn.generate({ principal: principal(host), chatId });

  const texts = historyTexts(requests[0]);
  expect(texts.some((t) => t.includes("[card: Terminal]"))).toBe(true);
  expect(texts.some((t) => t.includes("multi-KB html blob"))).toBe(false);
});

// S1 (w4-my-lane) — the rpg post-turn register must precede the CLIENT-VISIBLE `turnCompleted` emit. The
// barrier entry is registered SYNCHRONOUSLY inside `onTurnCompleted` (rpg/chat-ops/index.ts), so "the fire
// happens before the emit" IS the no-stale-gather window: a scripted re-send riding the bus can only run
// after `turnCompleted`, by which point `awaitInFlight` already sees this turn's flush. Ordering is invisible
// to a typecheck and was silently wrong (the fire sat after the emit + the memory/chatsChanged block).

/** A minimal `ctx.rpg` that stamps the shared timeline when the post-turn flush fires. */
function fireOrderRpg(timeline: string[]): NonNullable<ChatContext["rpg"]> {
  // @orb-waive no-test-fabrication(unknown): minimal ChatRpgOps stub — the turn path reaches only these ops (the `foldedRpg` precedent). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return {
    resolvePresetOverride: () => Promise.resolve(null),
    resolveUserMacros: () => Promise.resolve([]),
    gatherTurnContext: () => Promise.resolve(null),
    markDicePreRollEligible: () => undefined,
    onUserCommit: () => Promise.resolve(),
    onTurnCompleted: () => {
      timeline.push(RPG_FIRE_MARK);
      return Promise.resolve();
    },
    onTurnAborted: () => Promise.resolve(),
    resolveGmSeatHolderKind: () => Promise.resolve(null),
    resolveReasoningHostOnly: () => Promise.resolve(false),
  } as unknown as NonNullable<ChatContext["rpg"]>;
}

const RPG_FIRE_MARK = "rpg:onTurnCompleted";
/** The round's own trace-ring bucket key: `rpg-turn:<turnId>`. */
const RPG_ROUND_REQUEST_ID_RE = /^rpg-turn:/;

test("S1: the rpg post-turn flush is registered BEFORE the turnCompleted emit (after the commit)", async () => {
  const host = await seedUser(db, castId<Handle>("s1host"));
  const charA = await seedCharacter(db, host, "aria");
  const chatId = await seedChat(db, "s1_order");
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: "c", characterId: charA });

  // ONE interleaved sequence of bus emits + the rpg fire, in real time.
  const timeline: string[] = [];
  const h = harness(db, { [charA]: "Aria" }, { rpg: fireOrderRpg(timeline), onEmit: (e) => timeline.push(e.type) });

  await h.turn.send({ principal: makePrincipal(host), chatId, content: "I cross the river." });

  const fired = timeline.indexOf(RPG_FIRE_MARK);
  const completed = timeline.indexOf("turnCompleted");
  expect(fired).toBeGreaterThanOrEqual(0);
  expect(completed).toBeGreaterThanOrEqual(0);
  // The reply is COMMITTED before the fire (the flush needs the committed view)…
  expect(timeline.lastIndexOf("messageCommitted")).toBeLessThan(fired);
  // …and the turn is not publicly DONE until after it — no listener can re-send into the pre-register window.
  expect(fired).toBeLessThan(completed);
});

// ── The post-turn rpg round is TRACED (the observability hole) ────────────────────────────────────────
// The round is the most expensive thing a turn does after the reply lands (a whole state round, its own
// provider call, its own writes) and it ran under NO live span: it OUTLIVES the request, and the trace ring
// drops every span that arrives for an already-sealed bucket. It now opens a DETACHED root of its own,
// keyed by the turn — so `/api/_debug/traces` shows it as its own trace instead of nothing.
//
// Proved through the TRACE RING (`recentTraces`, the read `/api/_debug/traces` serves), not through the span
// API the fix calls, and with the turn driven from INSIDE an outer request span — that nesting is the exact
// condition a non-detached root would silently lose.
const RPG_ROUND_ROOT = "rpg.turnCompleted";
const OUTER_REQUEST_ID = "rpg-trace-outer-request";
const TRACE_SCAN_LIMIT = 50;

test("the post-turn rpg round opens its OWN request trace (it outlives the request that started it)", async () => {
  initTracing();
  const host = await seedUser(db, castId<Handle>("rpgtracehost"));
  const charA = await seedCharacter(db, host, "aria");
  const chatId = await seedChat(db, "rpg_trace");
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: "c", characterId: charA });

  // The round is fire-and-forget, so the test needs a handle on its completion: the stub resolves this once
  // its (deliberately async) work is done, which is also when the round's span ends and its bucket seals.
  let roundDone = (): void => undefined;
  const rounded = new Promise<void>((resolve) => {
    roundDone = resolve;
  });
  // @orb-waive no-test-fabrication(unknown): minimal ChatRpgOps stub — the turn path reaches only these ops (the `fireOrderRpg` precedent). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const rpg = {
    resolvePresetOverride: () => Promise.resolve(null),
    resolveUserMacros: () => Promise.resolve([]),
    gatherTurnContext: () => Promise.resolve(null),
    markDicePreRollEligible: () => undefined,
    onUserCommit: () => Promise.resolve(),
    onTurnCompleted: async () => {
      // Real async work, so the round genuinely spans a tick — the shape a state round has.
      await Promise.resolve();
      roundDone();
    },
    onTurnAborted: () => Promise.resolve(),
    resolveGmSeatHolderKind: () => Promise.resolve(null),
    resolveReasoningHostOnly: () => Promise.resolve(false),
  } as unknown as NonNullable<ChatContext["rpg"]>;
  const h = harness(db, { [charA]: "Aria" }, { rpg });

  // The turn runs INSIDE a request root, exactly as production runs it under the tRPC span.
  await withRequestSpan(OUTER_REQUEST_ID, "http POST /api/trpc/chat.send", {}, () =>
    h.turn.send({ principal: makePrincipal(host), chatId, content: "I cross the river." }),
  );
  await rounded;

  // THE PIN: a SEALED trace of its own in the ring. Before the fix the round opened no span at all, and a
  // naively-nested root would never have sealed (a parented span never triggers `TraceRing.seal`).
  const round = recentTraces(TRACE_SCAN_LIMIT).find((t) => t.rootName === RPG_ROUND_ROOT);
  expect(round).toBeDefined();
  expect(round?.requestId).toMatch(RPG_ROUND_REQUEST_ID_RE);
  expect(round?.status).toBe("ok");
  // It is its OWN trace, not a subtree of the request's — the request sealed before this work ran.
  expect(round?.requestId).not.toBe(OUTER_REQUEST_ID);
  expect(recentTraces(TRACE_SCAN_LIMIT).find((t) => t.requestId === OUTER_REQUEST_ID)?.rootName).toBe("http POST /api/trpc/chat.send");
});

// SPANGATE — the SIXTH instance of the outlives-the-request class, found by the `detached-work-traced` gate
// after SM4 fixed one and OBSCLOSE found four more. `fireRpgUserCommit` runs the SEND-path snapshot commit
// (a DB write + a queued-dice consume) fire-and-forget with `.catch(() => undefined)`, so before the fix its
// cost and its failures were invisible everywhere: no span of its own, and a parented one would have been
// dropped as a late orphan. Same proof shape as the round above, driven from inside an outer request root.
const RPG_USER_COMMIT_ROOT = "rpg.userCommit";
/** The commit's own trace-ring bucket key: `rpg-user-commit:<messageId>`. */
const RPG_USER_COMMIT_REQUEST_ID_RE = /^rpg-user-commit:/;
const USER_COMMIT_OUTER_REQUEST_ID = "rpg-user-commit-outer-request";

test("the send-path rpg user-commit opens its OWN request trace (it outlives the send that started it)", async () => {
  initTracing();
  const host = await seedUser(db, castId<Handle>("rpgcommithost"));
  const charA = await seedCharacter(db, host, "aria");
  const chatId = await seedChat(db, "rpg_commit_trace");
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: "c", characterId: charA });

  let commitDone = (): void => undefined;
  const committed = new Promise<void>((resolve) => {
    commitDone = resolve;
  });
  // @orb-waive no-test-fabrication(unknown): minimal ChatRpgOps stub — the turn path reaches only these ops (the `fireOrderRpg` precedent). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const rpg = {
    resolvePresetOverride: () => Promise.resolve(null),
    resolveUserMacros: () => Promise.resolve([]),
    gatherTurnContext: () => Promise.resolve(null),
    markDicePreRollEligible: () => undefined,
    onUserCommit: async () => {
      // Real async work, so the commit genuinely spans a tick — the shape a snapshot commit has.
      await Promise.resolve();
      commitDone();
    },
    onTurnCompleted: () => Promise.resolve(),
    onTurnAborted: () => Promise.resolve(),
    resolveGmSeatHolderKind: () => Promise.resolve(null),
    resolveReasoningHostOnly: () => Promise.resolve(false),
  } as unknown as NonNullable<ChatContext["rpg"]>;
  const h = harness(db, { [charA]: "Aria" }, { rpg });

  await withRequestSpan(USER_COMMIT_OUTER_REQUEST_ID, "http POST /api/trpc/chat.send", {}, () =>
    h.turn.send({ principal: makePrincipal(host), chatId, content: "I ford the river." }),
  );
  await committed;

  const commit = recentTraces(TRACE_SCAN_LIMIT).find((t) => t.rootName === RPG_USER_COMMIT_ROOT);
  expect(commit).toBeDefined();
  expect(commit?.requestId).toMatch(RPG_USER_COMMIT_REQUEST_ID_RE);
  expect(commit?.status).toBe("ok");
  // Its OWN bucket, never the send's — the request root had already sealed when this work ran.
  expect(commit?.requestId).not.toBe(USER_COMMIT_OUTER_REQUEST_ID);
});

// VER-1b — the REGEN SLOT reaches the rpg gather. A swipe regenerates an EXISTING slot whose currently-selected
// variant is the one being abandoned, so rpg must read its tracked state as of BEFORE that slot (else the
// reminder describes the very prose the model is being asked to rewrite). Chat owns slot mechanics and is the
// only side that knows which slot this is — this pins the thread, so the rpg-side fix can never be dead wire.

/** A minimal `ctx.rpg` recording the `regenSlotMessageId` each gather args object was handed. */
function gatherSpyRpg(): { slots: (MessageId | undefined)[]; rpg: NonNullable<ChatContext["rpg"]> } {
  const slots: (MessageId | undefined)[] = [];
  // @orb-waive no-test-fabrication(unknown): the turn path reaches only these ops (the `foldedRpg` stub above's precedent). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const rpg = {
    resolvePresetOverride: () => Promise.resolve(null),
    resolveUserMacros: () => Promise.resolve([]),
    gatherTurnContext: (args: { regenSlotMessageId?: MessageId }) => {
      slots.push(args.regenSlotMessageId);
      return Promise.resolve({ macros: {}, injections: [], tools: [], cardKeepLastX: 0 });
    },
    markDicePreRollEligible: () => undefined,
    onUserCommit: () => Promise.resolve(),
    onTurnCompleted: () => Promise.resolve(),
    onTurnAborted: () => Promise.resolve(),
    resolveGmSeatHolderKind: () => Promise.resolve(null),
    resolveReasoningHostOnly: () => Promise.resolve(false),
  } as unknown as NonNullable<ChatContext["rpg"]>;
  return { slots, rpg };
}

test("VER-1b: a SWIPE tells the rpg gather which slot it regenerates; a SEND tells it none", async () => {
  const host = await seedUser(db, castId<Handle>("ver1bhost"));
  const charA = await seedCharacter(db, host, "aria");
  const chatId = await seedChat(db, "ver1b_regen");
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: "c", characterId: charA });
  await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "hi" });
  const { messageId } = await seedMessage(db, chatId, 2, { role: "assistant", characterId: charA, content: "first take" });

  const { slots, rpg } = gatherSpyRpg();
  const h = harness(db, { [charA]: "Aria" }, { rpg });

  await h.turn.swipe({ principal: makePrincipal(host), chatId, messageId });
  // The swipe's `append-variant` target — the same slot its canon context stops before.
  expect(slots).toEqual([messageId]);

  // A fresh turn regenerates nothing: the gather resolves the head, exactly as before (byte-identical arm).
  await h.turn.send({ principal: makePrincipal(host), chatId, content: "and then?" });
  expect(slots.at(-1)).toBeUndefined();
});
