// verbs/turn — the turn-running front doors (.int: real libSQL for the lock + the D26 canon persist + a REAL
// engine via `createTurnEngine`). Proves the wiring: identity triple → connection → ONE assemble ctx →
// arbitrate → driveRound; the group round (N speakers), @mention force, auto-mode chaining, send's solo
// (roster-of-1) path, host-only force, abort's owner-only refusal, and the `can()` default-deny. Determinism:
// frozen clock, seeded prng, no-op delay (D46) — no ambient clock / RNG.

import type { CharacterCard } from "@orb/contracts/character";
import type { AssemblePersona, ChatBusEvent } from "@orb/contracts/chat";
import { AUTOMATION_DEPTH_HARD_CAP } from "@orb/contracts/chat";
import type { ModelCapability, ResolvedConnection } from "@orb/contracts/connection";
import type { Principal } from "@orb/contracts/identity";
import type { NotificationEvent } from "@orb/contracts/notifications";
import type { PromptConfig, PromptSection, UserMacroSpec } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { RegexScript } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { chats, personas } from "@orb/db";
import { DomainRateLimitError } from "@orb/kit/errors";
import type { CharacterId, ChatId, Handle, MessageId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { resolveRowMacros } from "@orb/kit/macro";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createActiveTurns } from "../../../../../packages/server/src/domain/chat/active-turns";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/context";
import { ChatNotFoundError } from "../../../../../packages/server/src/domain/chat/contract/errors";
import type { ChatBehaviorInputs } from "../../../../../packages/server/src/domain/chat/contract/foreign";
import type { TurnStreamChunk } from "../../../../../packages/server/src/domain/chat/contract/results";
import { createTurnEngine } from "../../../../../packages/server/src/domain/chat/engine/engine";
import { loadWitnessHorizons } from "../../../../../packages/server/src/domain/chat/memory/persistence/queries";
import { recallMemory } from "../../../../../packages/server/src/domain/chat/memory/recall/recall";
import { loadPendingTurns, loadPendingTurnsForReclaim } from "../../../../../packages/server/src/domain/chat/persistence/invites";
import { tryAcquireLock } from "../../../../../packages/server/src/domain/chat/persistence/lock";
import {
  loadCanonHistory,
  loadMaxMessageSeq,
  loadMessageView,
  loadSlotTarget,
  loadTurnOrigin,
} from "../../../../../packages/server/src/domain/chat/persistence/queries";
import { createRequestTurn, createTurn } from "../../../../../packages/server/src/domain/chat/verbs/turn";
import { freshDb } from "../../../../support/db";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures";
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
  TEST_CAPABILITY,
  testConnection,
} from "../_support";

const card = (name: string): CharacterCard => ({ name, description: "", avatarAssetId: null, regexScripts: [] }) as unknown as CharacterCard;

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

/** A scripted role turn — text delta + a terminal `final` carrying the content/economics. */
function scripted(content: string, finishReason?: string): ChatContext["runChatTurn"] {
  return () =>
    (async function* (): AsyncGenerator<TurnStreamChunk> {
      await Promise.resolve();
      yield { kind: "text", text: content };
      yield {
        kind: "final",
        economics: { content, tokensIn: 4, tokensOut: 2, model: "test-model", ...(finishReason !== undefined ? { finishReason } : {}) },
      };
    })();
}

/** One scripted generation the reply-tape yields in order (PD-146 auto-behaviors run a follow-up turn, so a
 *  send fires ≥2 `runChatTurn` calls that must reply distinctly). */
interface ScriptedReply {
  readonly content: string;
  readonly finishReason?: string;
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
  anchor: { name: "Nate", description: "the user" },
  active: { name: "Nate", description: "the user" },
};

interface Harness {
  ctx: ChatContext;
  events: ChatBusEvent[];
  deltas: StatsDelta[];
  notifications: NotificationEvent[];
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
    hostTierRegexScripts?: RegexScript[];
    /** Capture each wire `TurnRequest` (the guided-routing pins inspect the assembled prompt). */
    onChatRequest?: (request: unknown) => void;
    /** Override the resolved `PromptConfig` (the F1 injection_trigger pin drives trigger-gated sections). */
    promptConfig?: PromptConfig;
    /** Capture the `personaIds` `loadRoom` resolved for the round (the PD-70 presence-gating pin). */
    onForeignInputs?: (args: { readonly personaIds: readonly PersonaId[] }) => void;
    /** Override server-derived presence (default = everyone online; a cast-gating test marks a member away). */
    readPresence?: ChatContext["readPresence"];
    /** Override the resolved connection's credential `source` (default `vllm`; the drain drop-path pins
     *  `max-pro-sub` so the engine's consent belt refuses a by-proxy deferred turn). */
    connectionSource?: string;
    /** Override the engine's per-turn budget debit (default no-op). The drain requeue-path pins a thrower
     *  (`DomainRateLimitError` → `budget_exceeded`) to prove a temporal drop re-queues, not drops. */
    debitBudget?: (triggeredBy: UserId, budget: number | null) => Promise<void>;
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
    /** The `smart` policy's side-LLM turn director (default = the throwing `notStubbed` — every non-smart
     *  room must never reach it). The smart-policy pins script it (a pick, or an outage). */
    summarize?: ChatContext["summarize"];
    /** The injected rpg turn ops (default null = not wired, byte-identical). The R1 folded-extraction pin
     *  wires a stub whose gather contributes TERMINAL tools, to prove the whole gather→prep→wire→flush thread. */
    rpg?: ChatContext["rpg"];
    /** Override the resolved connection wholesale (the R1 pin needs a TOOLS-capable capability, which
     *  `testConnection`'s minimal descriptor deliberately lacks). */
    connection?: ResolvedConnection;
  } = {},
): Harness {
  const events: ChatBusEvent[] = [];
  const deltas: StatsDelta[] = [];
  const notifications: NotificationEvent[] = [];
  let replyIdx = 0;
  const ctx = makeChatContext(database, {
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
    ...(over.summarize !== undefined ? { summarize: over.summarize } : {}),
    ...(over.rpg !== undefined ? { rpg: over.rpg } : {}),
  });
  const emit = (event: ChatBusEvent): Promise<void> => {
    events.push(event);
    return Promise.resolve();
  };
  const engine = createTurnEngine(ctx, {
    emit,
    debitBudget: over.debitBudget ?? (() => Promise.resolve()),
    resolveTurnPolicy: () => Promise.resolve({ budget: null, allowNonOwnerMaxProSub: false }),
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
    prng: over.prng ?? seededPrng(),
    delay: () => Promise.resolve(),
    resolveConnection: () => Promise.resolve(over.connection ?? testConnection(over.connectionSource ?? "vllm")),
    resolveForeignInputs: (args) => {
      over.onForeignInputs?.(args);
      return Promise.resolve({
        promptConfig: over.promptConfig ?? DEFAULT_PROMPT_CONFIG,
        personas: PERSONAS,
        globalRegexScripts: over.hostTierRegexScripts ?? [],
        scanDepth: 6,
        injectionTokenBudget: 0,
        ...(over.chatBehavior !== undefined ? { chatBehavior: over.chatBehavior } : {}),
      });
    },
  };
  const turn = createTurn(ctx, turnDeps);
  const requestTurn = createRequestTurn(ctx, turnDeps);
  return { ctx, events, deltas, notifications, turn, requestTurn, activeTurns };
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
    /** Character keys seeded MUTED (`disabled: true`) — #29's force-turn-on-muted pin. */
    disabledKeys?: readonly string[];
  } = {},
): Promise<{ host: UserId; chatId: ChatId; chars: CharacterId[]; names: Record<string, string> }> {
  const host = await seedUser(db, "host");
  const group: Record<string, unknown> = {
    output: opts.output ?? "per-speaker",
    policy,
    ...(opts.autoMode === true ? { autoMode: true, autoModeMaxTurns: opts.autoModeMaxTurns ?? 2, autoModeDelayMs: 0 } : {}),
  };
  const chatId = await seedChat(db, "a", { metadata: { group } });
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  const chars: CharacterId[] = [];
  const names: Record<string, string> = {};
  for (const k of charKeys) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential fixture seeding — deterministic ids + join order.
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

  test("an EXPLICIT foreign personaId is refused not_persona_owner — nothing committed (the trust boundary)", async () => {
    const { chatId, names } = await seedRoom("natural", ["aria"]);
    const member = await seedUser(db, "member");
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const stranger = await seedUser(db, "stranger");
    const foreignPersona = await seedPersona(stranger, "stranger_pov");
    const h = harness(db, names);

    await expect(h.turn.commitMessage({ principal: principal(member), chatId, content: "hi", personaId: foreignPersona })).rejects.toMatchObject({
      code: "not_persona_owner",
    });
    expect((await loadCanonHistory(db, chatId)).filter((m) => m.role === "user")).toHaveLength(0);
  });

  test("a non-member is refused (leak-free NOT_FOUND — the membership gate)", async () => {
    const { chatId, names } = await seedRoom("natural", ["aria"]);
    const stranger = await seedUser(db, "stranger");
    const h = harness(db, names);

    await expect(h.turn.commitMessage({ principal: principal(stranger), chatId, content: "hi" })).rejects.toBeInstanceOf(ChatNotFoundError);
    expect((await loadCanonHistory(db, chatId)).filter((m) => m.role === "user")).toHaveLength(0);
  });
});

describe("send — a caller-cancelled turn RETURNS aborted (the return-based abort reaches the verb)", () => {
  test("aborted:true + reason reach the send return; the user row still committed, no assistant row", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    // The provider honors a cancel: it throws a name-based AbortError instead of yielding a reply.
    const aborting: ChatContext["runChatTurn"] = () =>
      (async function* (): AsyncGenerator<TurnStreamChunk> {
        await Promise.reject(Object.assign(new Error("request aborted"), { name: "AbortError" }));
        yield { kind: "text", text: "unreachable" };
      })();
    const h = harness(db, names, { runChatTurn: aborting });

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

describe("send — presence cast-gating (PD-70)", () => {
  /** Seed a host + an away member (each with a persona) + one character; return the ids + persona ids. */
  async function seedTwoHumanRoom(): Promise<{
    host: UserId;
    member: UserId;
    chatId: ChatId;
    hostPersona: PersonaId;
    memberPersona: PersonaId;
    names: Record<string, string>;
  }> {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
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

  test("an OFFLINE human's persona drops from the round; the host's (and cast) survive", async () => {
    const room = await seedTwoHumanRoom();
    const seen: (readonly PersonaId[])[] = [];
    const h = harness(db, room.names, {
      onForeignInputs: ({ personaIds }) => seen.push(personaIds),
      // The member is away (no live SSE); the host is driving the turn.
      readPresence: (userId) => Promise.resolve({ userId, online: userId !== room.member, lastSeenAt: null }),
    });

    await h.turn.send({ principal: principal(room.host), chatId: room.chatId, content: "hi" });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain(room.hostPersona);
    expect(seen[0]).not.toContain(room.memberPersona);
  });

  test("when BOTH humans are online, both personas are present (no drop)", async () => {
    const room = await seedTwoHumanRoom();
    const seen: (readonly PersonaId[])[] = [];
    const h = harness(db, room.names, {
      onForeignInputs: ({ personaIds }) => seen.push(personaIds),
      readPresence: (userId) => Promise.resolve({ userId, online: true, lastSeenAt: null }),
    });

    await h.turn.send({ principal: principal(room.host), chatId: room.chatId, content: "hi" });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual(expect.arrayContaining([room.hostPersona, room.memberPersona]));
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
    const host = await seedUser(db, "host");
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

// The `smart` policy routes the round through the side-LLM turn director (`engine/smart-arbitrate`) BEFORE
// the deterministic sampler is reached. The owner contract: when that call fails, the round degrades to the
// `natural` math rather than stalling — and says so out loud (D41: no silent degrade).
describe("send — the smart policy (side-LLM turn director + its visible fallback)", () => {
  /** A scripted turn-director reply (the `summarize` role op the smart arbitration calls). */
  function director(text: string): { op: ChatContext["summarize"]; calls: () => number } {
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
    const chosen = director("bryn");
    const h = harness(db, names, { summarize: chosen.op });

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "who's up?" });

    const assistants = outcome.messages.filter((m) => m.role === "assistant");
    expect(assistants.map((m) => m.characterId)).toEqual([chars[1]]);
    expect(chosen.calls()).toBe(1);
    expect(warnings(h.events)).toHaveLength(0);
  });

  test("a THROWING director (outage) still commits a turn, chosen by the natural math, with a warning", async () => {
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
  test("an UNWIRED director (sync fail-closed throw) degrades the same way", async () => {
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
    const h = harness(db, names, { summarize: director("Gandalf the Grey").op });

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "who's up?" });

    const assistants = outcome.messages.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(1);
    expect(chars).toContainEqual(assistants[0]?.characterId);
    expect(warnings(h.events)).toEqual([{ type: "warning", chatId, code: "smart_arbitration_degraded" }]);
  });

  test("a human @mention hard-overrides smart entirely — the director is never called", async () => {
    const { host, chatId, chars, names } = await seedRoom("smart", ["aria", "bryn"]);
    const chosen = director("aria");
    const h = harness(db, names, { summarize: chosen.op });

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "@bryn hello" });

    const assistants = outcome.messages.filter((m) => m.role === "assistant");
    expect(assistants.map((m) => m.characterId)).toEqual([chars[1]]);
    expect(chosen.calls()).toBe(0);
    expect(warnings(h.events)).toHaveLength(0);
  });

  test("a MUTED member named by the director is never scheduled (untrusted model output)", async () => {
    const { host, chatId, chars, names } = await seedRoom("smart", ["aria", "bryn", "cara"], { disabledKeys: ["cara"] });
    const h = harness(db, names, { summarize: director("cara").op });

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "who's up?" });

    const assistants = outcome.messages.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(1);
    expect(assistants[0]?.characterId).not.toBe(chars[2]);
    expect(warnings(h.events)).toEqual([{ type: "warning", chatId, code: "smart_arbitration_degraded" }]);
  });

  // THE HANG (a hang is not a failure, so the degrade belt above cannot catch it): a director box that
  // accepts the request and never answers holds the whole turn open. The turn's abort signal now rides INTO
  // the summarize op, so the user's Stop cuts it — and a cancelled arbitration is NOT a degrade: the round
  // ends with nothing generated and no warning (nothing degraded — the user stopped it).
  test("an abort mid-arbitration ends the turn: no fallback speaker, no generation, no degrade warning", async () => {
    const { host, chatId, names } = await seedRoom("smart", ["aria", "bryn"]);
    let generations = 0;
    let directorEntered: () => void = () => undefined;
    const arrived = new Promise<void>((resolve) => {
      directorEntered = resolve;
    });
    const h = harness(db, names, {
      onChatRequest: () => {
        generations += 1;
      },
      // The non-responsive box: settles ONLY when the injected signal fires, exactly like a real provider
      // fetch that got a socket and no bytes.
      summarize: (_inputs, opts): Promise<SummarizeResult> =>
        new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
          directorEntered();
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

  // THE CHAIN-ARBITRATION HANG (owner: "handle it in full"): the continuation arbitration between chained
  // speakers rides the SAME `smart` side-LLM that can hang. Each chain iteration now emits `turnAccepted`
  // BEFORE it arbitrates (so Stop renders during the hang), and the abort handle spans the WHOLE chain — so a
  // Stop mid-chain-arbitration cancels the chain, not just the current iteration.
  test("a hung chain arbitration mid-chain: Stop cancels the WHOLE chain (turnAborted lands, no further turn)", async () => {
    // A `smart` room so the chain's continuation arbitration calls the side-LLM director each iteration.
    const { host, chatId, chars, names } = await seedRoom("smart", ["aria", "bryn"], {
      autoMode: true,
      autoModeMaxTurns: 3,
    });
    // The director answers the FIRST arbitrations (human round → aria, chain iter 1 → bryn), then HANGS on the
    // next chain arbitration exactly like a non-responsive box — settling only when the turn signal fires.
    let calls = 0;
    let hungEntered: () => void = () => undefined;
    const arrived = new Promise<void>((resolve) => {
      hungEntered = resolve;
    });
    const summarize: ChatContext["summarize"] = (_inputs, opts): Promise<SummarizeResult> => {
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
    const member = await seedUser(db, "member");
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const h = harness(db, names);

    const outcome = await h.turn.send({ principal: principal(member), chatId, content: "hi" });

    expect(outcome.messages[0]?.authorUserId).toBe(member); // the user row is the caller's
    // TWO deltas ride the send (stats.md canon-mutator push): the USER row's (owner-grain only —
    // characterId null) then the assistant turn's — BOTH attributed to the host (runAsUserId, D19).
    expect(h.deltas).toHaveLength(2);
    expect(h.deltas[0]?.userTurns).toBe(1);
    expect(h.deltas[0]?.characterId).toBeNull();
    expect(h.deltas.map((d) => d.ownerId)).toEqual([host, host]);
  });

  test("a non-member is refused (leak-free NOT_FOUND — can() default-deny)", async () => {
    const { chatId, names } = await seedRoom("natural", ["aria"]);
    const stranger = await seedUser(db, "stranger");
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
    const member = await seedUser(db, "member");
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

  test("the boot reclaim ({all}) drains every chat's queued turns", async () => {
    const { host, member, chatId, names } = await seedMemberRoom();
    const h = harness(db, names, { readPresence: hostOffline(host) });
    await h.turn.send({ principal: principal(member), chatId, content: "hi" });

    const report = await h.turn.drainDeferredTurns({ all: true });

    expect(report).toStrictEqual({ ran: 1, dropped: 0 });
    expect(await loadPendingTurns(db, chatId)).toHaveLength(0);
  });

  test("consent_required is a PERMANENT verdict: the drain drops the row AND notifies the triggering member", async () => {
    const { host, member, chatId, names } = await seedMemberRoom();
    // A queued by-proxy turn: the member triggered it; it funds the host's box.
    await seedPendingTurn(db, { chatId, key: "drop", triggeredBy: member, runAsUserId: host });
    // The host box is a hosted (max-pro-sub) credential + owner consent is OFF (harness default policy), so
    // the engine's consent belt refuses a non-owner-triggered hosted turn → a permanent verdict drop.
    const h = harness(db, names, { connectionSource: "max-pro-sub" });

    const report = await h.turn.drainDeferredTurns({ all: true });

    expect(report).toStrictEqual({ ran: 0, dropped: 1 });
    expect(await loadPendingTurns(db, chatId)).toHaveLength(0); // consumed (dropped), no reboot re-run
    expect((await loadCanonHistory(db, chatId)).filter((m) => m.role === "assistant")).toHaveLength(0);
    // The frozen triggeredBy member is told their owed reply never ran + why (the kick/handoff inbox precedent).
    expect(h.notifications).toHaveLength(1);
    expect(h.notifications[0]).toStrictEqual({
      type: "deferred-turn-dropped",
      recipientUserId: member,
      chatId,
      reason: "consent",
    });
  });

  test("budget_exceeded is TEMPORAL: the drain RE-QUEUES the row (no drop, no notification) to retry next drain", async () => {
    const { host, member, chatId, names } = await seedMemberRoom();
    await seedPendingTurn(db, { chatId, key: "budget", triggeredBy: member, runAsUserId: host });
    // The per-member budget is exhausted this window → the engine throws budget_exceeded. A spent window is
    // "not now", not "never" — the owed reply must survive to the next drain edge, unspammed.
    const h = harness(db, names, {
      debitBudget: () => Promise.reject(new DomainRateLimitError("per-member budget exhausted")),
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

  test("two concurrent drains claim each row exactly once (no double-run / double-spend)", async () => {
    // N rows across N DISTINCT chats (no per-chat lock contention) — the atomic DELETE…RETURNING claim is
    // the only serializer, so overlapping boot ∥ host-return snapshots can't run or spend a row twice.
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatIds: ChatId[] = [];
    for (let i = 0; i < 4; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: sequential deterministic fixture seeding.
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
    let debits = 0;
    const names: Record<string, string> = {};
    const h = harness(db, names, {
      debitBudget: () => {
        debits += 1;
        return Promise.resolve();
      },
    });

    // Two overlapping drains race the same 4 candidate rows.
    const [a, b] = await Promise.all([h.turn.drainDeferredTurns({ all: true }), h.turn.drainDeferredTurns({ hostUserId: host })]);

    // Across BOTH drains, exactly 4 rows ran (each claimed once); the losers skipped.
    expect(a.ran + b.ran).toBe(4);
    expect(a.dropped + b.dropped).toBe(0);
    expect(debits).toBe(4); // exactly-once spend — no double debit
    expect(await loadPendingTurnsForReclaim(db)).toHaveLength(0); // all consumed
    // Each chat got exactly one AI response (never two).
    for (const chatId of chatIds) {
      // biome-ignore lint/performance/noAwaitInLoops: per-chat assertion over a tiny fixed set.
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
    const member = await seedUser(db, "member");
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
    const member = await seedUser(db, "member");
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

  test("a member generating for a DEPARTED (leftSeq set) cast member is refused NOT_FOUND", async () => {
    // Presence is the hard requirement: a character that LEFT still has cards/history but is no longer a
    // present cast seat, so it may not be voiced by a fresh generate (the leftSeq === null sibling of
    // forceCharacterTurn's presence check).
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const member = await seedUser(db, "member");
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    // bryn is a DEPARTED cast seat: its participant row + card survive, but leftSeq is set (no longer present).
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

  test("a member generating for a PRESENT cast character succeeds (regression: the legitimate path stays open)", async () => {
    const { chatId, chars, names } = await seedRoom("natural", ["aria", "bryn"]);
    const member = await seedUser(db, "member");
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

  test("a member generating for a PRESENT-but-MUTED cast character succeeds (mute gates arbitration, not manual targeting)", async () => {
    // Mute (`disabled`) governs auto-selection eligibility + `{{groupNotMuted}}`, NOT explicit speaker
    // targeting — a member manually generating a muted seat is legitimate (it does NOT inherit any host
    // bypass; the only host-only bypass is a LEFT seat, refused above). Documented at the generate check site.
    const { chatId, chars, names } = await seedRoom("natural", ["aria", "bryn"], { disabledKeys: ["bryn"] });
    const member = await seedUser(db, "member");
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
    const member = await seedUser(db, "member");
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const stranger = await seedUser(db, "stranger");
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
    const member = await seedUser(db, "member");
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
});

describe("guided steer routing (chat.md §6, PD-63)", () => {
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
    // active persona name to "Nate" ({{user}}); the character is "aria" ({{char}}) — the two names that must
    // appear SUBSTITUTED in the wire nudge (not literal `{{user}}/{{char}}`).
    const host = await seedUser(db, "host");
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
    // {{user}}→persona name (harness "Nate"), {{char}}→character name ("aria"), {{person}}→the "first"
    // default — all RESOLVED, so the nudge reads "... AS Nate (not aria) ..." not "... AS {{user}} (not {{char}})".
    expect(wire).toContain("AS Nate (not aria)"); // {{user}} + {{char}} both substituted, in the right slots
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
    regexScripts: [],
    variables: [],
    userMacros: [],
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

    const reverted = await h.turn.revertContinue({ principal: principal(host), chatId, messageId });
    expect(reverted.content).toBe("Once upon a timeHi there");
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

describe("send — SEND USER_INPUT regex (D53; chat.md §2/§7)", () => {
  test("the persisted user row is the POST-USER_INPUT-regex text (canon-mutating at write)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const script = regexScriptSchema.parse({
      id: "u",
      name: "u",
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
    const alice = await seedUser(db, "alice");
    const bob = await seedUser(db, "bob");
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

// The non-human turn seam (automation-design/03 §4 / 05 §AC-B) — the four walls, none optional. requestTurn is
// principal-free: the funding host is resolved from the room, the funder is the responsible human, and the turn
// routes through the SAME engine belts a human send clears (consent + per-member budget). No free turn, no
// consent bypass, no infinite cascade, no cross-tenant funding.
describe("requestTurn — the non-human turn seam (four walls: depth · authority · budget · consent)", () => {
  test("FIRES + SPENDS the funder's budget + STAMPS initiator/depth on the reply (the getTurnOrigin round-trip)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const debits: { triggeredBy: UserId; budget: number | null }[] = [];
    const h = harness(db, names, {
      debitBudget: (triggeredBy, budget) => {
        debits.push({ triggeredBy, budget });
        return Promise.resolve();
      },
    });

    const outcome = await h.requestTurn({ chatId, initiator: "automation", funderUserId: host, automationDepth: 2 });

    // FIRES — one assistant reply committed; a non-human turn adds NO user line.
    expect(outcome.aborted).toBe(false);
    expect(outcome.messages).toHaveLength(1);
    expect(outcome.messages[0]?.role).toBe("assistant");
    // SPENDS — the engine debited the funder's (triggeredBy) per-member budget; a non-human turn is never free.
    expect(debits).toEqual([{ triggeredBy: host, budget: null }]);
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

    await expect(h.requestTurn({ chatId, initiator: "automation", funderUserId: host, automationDepth: AUTOMATION_DEPTH_HARD_CAP + 1 })).rejects.toMatchObject({
      code: "cascade_depth_exceeded",
    });
    expect(await loadCanonHistory(db, chatId)).toHaveLength(0);
  });

  test("WALL 2 (cross-tenant): a funder with NO membership cannot fund a turn — leak-free NOT_FOUND, nothing commits", async () => {
    const { chatId, names } = await seedRoom("natural", ["aria"]);
    const stranger = await seedUser(db, "stranger"); // a real user, but NOT a participant of this chat
    const h = harness(db, names);

    await expect(h.requestTurn({ chatId, initiator: "automation", funderUserId: stranger, automationDepth: 1 })).rejects.toMatchObject({
      name: "ChatNotFoundError",
    });
    expect(await loadCanonHistory(db, chatId)).toHaveLength(0);
  });

  test("WALL 4 (consent, D17): a by-proxy hosted (max-pro-sub) turn without owner consent is refused fail-closed", async () => {
    const { chatId, names } = await seedRoom("natural", ["aria"]);
    // A present MEMBER funds the turn (funder ≠ host ⇒ by-proxy); the host box is a hosted credential + consent OFF
    // (the harness default policy). The engine's assertMaxProSubConsent belt refuses it — requestTurn re-routes it,
    // never bypasses it.
    const member = await seedUser(db, "member");
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const h = harness(db, names, { connectionSource: "max-pro-sub" });

    await expect(h.requestTurn({ chatId, initiator: "automation", funderUserId: member, automationDepth: 1 })).rejects.toMatchObject({
      code: "consent_required",
    });
    expect(await loadCanonHistory(db, chatId)).toHaveLength(0);
  });

  test("a 'plugin' initiator is accepted + stamped (the membrane seam); a 'human' initiator is refused (no forged human turn)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);

    // The plugin membrane calls this exact shape (installer as funder, cascade depth from the invocation).
    const outcome = await h.requestTurn({ chatId, initiator: "plugin", funderUserId: host, automationDepth: 1 });
    const replyId = outcome.messages[0]?.id;
    expect(replyId !== undefined ? await loadTurnOrigin(db, chatId, replyId) : null).toEqual({ initiator: "plugin", automationDepth: 1 });

    await expect(h.requestTurn({ chatId, initiator: "human", funderUserId: host, automationDepth: 0 })).rejects.toMatchObject({
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
  // FABRICATION-OK: minimal ChatRpgOps stub — the turn path reaches only these ops (the `foldedRpg` precedent).
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
const TOOLS_CONNECTION: ResolvedConnection = {
  ...testConnection("vllm"),
  capability: { ...TEST_CAPABILITY, tools: { parallel: true } } as unknown as ModelCapability,
};

/** A minimal `ctx.rpg` whose GATHER contributes terminal tools (a `folded` game), recording what the FLUSH
 *  was handed back. FABRICATION-OK: the turn path reaches only these ops. */
function foldedRpg(): { flushes: (readonly { name: string; arguments: string }[] | null)[]; rpg: NonNullable<ChatContext["rpg"]> } {
  const flushes: (readonly { name: string; arguments: string }[] | null)[] = [];
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
  const host = await seedUser(db, "r1host");
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

  // The gather's tools reached the WIRE — `auto`, so the prose is never at risk.
  const req = requests[0] as { tools?: { name: string }[]; toolChoice?: unknown };
  expect(req.tools?.map((t) => t.name)).toEqual(["update_scene"]);
  expect(req.toolChoice).toEqual({ mode: "auto" });
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
  const host = await seedUser(db, "r1host2");
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

// VER-1b — the REGEN SLOT reaches the rpg gather. A swipe regenerates an EXISTING slot whose currently-selected
// variant is the one being abandoned, so rpg must read its tracked state as of BEFORE that slot (else the
// reminder describes the very prose the model is being asked to rewrite). Chat owns slot mechanics and is the
// only side that knows which slot this is — this pins the thread, so the rpg-side fix can never be dead wire.

/** A minimal `ctx.rpg` recording the `regenSlotMessageId` each gather args object was handed. */
function gatherSpyRpg(): { slots: (MessageId | undefined)[]; rpg: NonNullable<ChatContext["rpg"]> } {
  const slots: (MessageId | undefined)[] = [];
  // FABRICATION-OK: the turn path reaches only these ops (the `foldedRpg` stub above's precedent).
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
  const host = await seedUser(db, "ver1bhost");
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
