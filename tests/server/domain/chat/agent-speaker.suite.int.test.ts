// The AP3-2 seated-agent VOICING chain (D60; agent-principal-design/04). Proves, end-to-end on real libSQL:
//   • loadRoom includes a seated agent in the arbitration pool + soul-resolves it into the cast (RESOLVE
//     substitution — the agent speaks with its OWN soul, self-attributed: authorUserId=agent, characterId null);
//   • the present-predicate ENABLED arm drops a principal-disabled agent from the cast (it never speaks);
//   • the engine's canAgent('speak') gate refuses a force-injected / mid-turn-disabled agent BEFORE dispatch,
//     even past selection (the containment belt), and a vanished principal fails closed.
// A pure-character room is unaffected (the byte-identity suite is solo-byte-identical.suite.int.test.ts).

import type { AgentSpeakerIdentity, AssembleContext, ChatBusEvent } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { chatParticipants } from "@orb/db";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { ChatId, ChatParticipantId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { createActiveTurns } from "../../../../packages/server/src/domain/chat/active-turns";
import type { ChatContext } from "../../../../packages/server/src/domain/chat/context";
import { ChatOperationError } from "../../../../packages/server/src/domain/chat/contract/errors";
import type { TurnPrep, TurnStreamChunk } from "../../../../packages/server/src/domain/chat/contract/results";
import { createTurnEngine } from "../../../../packages/server/src/domain/chat/engine/engine";
import { loadWitnessHorizons } from "../../../../packages/server/src/domain/chat/memory/persistence/queries";
import { recallMemory } from "../../../../packages/server/src/domain/chat/memory/recall/recall";
import { loadCanonHistory } from "../../../../packages/server/src/domain/chat/persistence/queries";
import { createRoster } from "../../../../packages/server/src/domain/chat/verbs/roster";
import { createTurn } from "../../../../packages/server/src/domain/chat/verbs/turn";
import { freshDb } from "../../../support/db";
import { principal as makePrincipal } from "../../../support/factories/principal.ts";
import { expect, test } from "../../../support/fixtures";
import { FROZEN_AT, makeChatContext, seedAgent, seedCharacter, seedChat, seedParticipant, seedUser, testConnection } from "./_support";

const HOST = castId<UserId>("user_host");
const AGENT = castId<UserId>("user_agent");
const SOUL: AgentSpeakerIdentity = { displayName: "Pip", systemPrompt: "SOUL-MARKER: You are Pip, a small curious companion.", avatarAssetId: null };

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

function scripted(content: string): ChatContext["runChatTurn"] {
  return () =>
    (async function* (): AsyncGenerator<TurnStreamChunk> {
      await Promise.resolve();
      yield { kind: "text", text: content };
      yield { kind: "final", economics: { content, tokensIn: 4, tokensOut: 2, model: "test-model" } };
    })();
}

function seededPrng(seed = 1): () => number {
  let s = seed;
  return (): number => {
    s = (s * 16_807) % 2_147_483_647;
    return s / 2_147_483_647;
  };
}

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

/** Seat a `kind:'agent'` participant directly (seatAgent is exercised in verbs/roster.int.test.ts). */
async function seatAgentRow(chatId: ChatId, agentUserId: UserId, over: { disabled?: boolean } = {}): Promise<void> {
  await db.insert(chatParticipants).values({
    id: castId<ChatParticipantId>(`chat_participant_agent_${agentUserId}`),
    chatId,
    kind: "agent",
    userId: agentUserId,
    role: "member",
    joinedAt: FROZEN_AT,
    joinSeq: 0,
    disabled: over.disabled ?? false,
  });
}

/** Host user + a group chat + the host participant + a seated agent (owned by the host). Returns the chat id. */
async function seedAgentRoom(): Promise<ChatId> {
  await seedUser(db, "host");
  const chatId = await seedChat(db, "room", { metadata: { group: { output: "per-speaker", policy: "natural" } } });
  await seedParticipant(db, { chatId, key: "h", userId: HOST, role: "host" });
  await seedAgent(db, HOST, "agent");
  await seatAgentRow(chatId, AGENT);
  return chatId;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// The SEND path — loadRoom inclusion, RESOLVE substitution, present-predicate exclusion.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────

interface SendHarness {
  turn: ReturnType<typeof createTurn>;
  prompts: string[];
}

/** `enabled` drives the kill-switch; `soul` absent ⇒ the default soul, explicit `null` ⇒ an unhatched source
 *  (both distinct from the enabled flag). */
interface SendHarnessOpts {
  readonly enabled?: boolean;
  readonly soul?: AgentSpeakerIdentity | null;
}

/** A send-capable harness with the agent ops wired. */
function sendHarness({ enabled = true, soul = SOUL as AgentSpeakerIdentity | null }: SendHarnessOpts = {}): SendHarness {
  const prompts: string[] = [];
  const events: ChatBusEvent[] = [];
  const deltas: StatsDelta[] = [];
  const ctx = makeChatContext(db, {
    runChatTurn: (request) => {
      prompts.push(`${request.prompt.static}\n${request.prompt.dynamic}`);
      return scripted("Hi there")(request);
    },
    applyStatsDelta: (_b: unknown, _d: Db, delta: StatsDelta): void => {
      deltas.push(delta);
    },
    resolveAgentActor: (id) => Promise.resolve({ kind: "agent", userId: id, ownerUserId: HOST, enabled }),
    resolveAgentSpeaker: () => Promise.resolve(soul),
  });
  const emit = (event: ChatBusEvent): Promise<void> => {
    events.push(event);
    return Promise.resolve();
  };
  const engine = createTurnEngine(ctx, {
    emit,
    debitBudget: () => Promise.resolve(),
    resolveTurnPolicy: () => Promise.resolve({ budget: null, allowNonOwnerMaxProSub: false }),
    holder: "replica-1",
    lockTtlMs: 60_000,
    generateSegments: async () => ({ written: 0, skipped: 0 }),
    generateDigests: async () => ({ written: 0, skipped: 0 }),
    loadWitnessHorizons,
    recallMemory,
  });
  const turn = createTurn(ctx, {
    engine,
    activeTurns: createActiveTurns(),
    emit,
    prng: seededPrng(),
    delay: () => Promise.resolve(),
    resolveConnection: () => Promise.resolve(testConnection()),
    resolveForeignInputs: () =>
      Promise.resolve({
        promptConfig: DEFAULT_PROMPT_CONFIG,
        personas: { anchor: { name: "Alex", description: "the user" }, active: { name: "Alex", description: "the user" } },
        globalRegexScripts: [],
        scanDepth: 6,
        injectionTokenBudget: 0,
      }),
  });
  return { turn, prompts };
}

describe("send — a seated agent speaks with its soul, self-attributed", () => {
  test("loadRoom includes the agent; it is arbiter-selected; the reply is self-attributed with the soul as its card", async () => {
    const chatId = await seedAgentRoom();
    const h = sendHarness();

    const outcome = await h.turn.send({ principal: principal(HOST), chatId, content: "hello" });

    const assistants = outcome.messages.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(1);
    // Self-attribution (agent-principal-design/02 §2): authorUserId = the agent, characterId null.
    expect(assistants[0]?.authorUserId).toBe(AGENT);
    expect(assistants[0]?.characterId).toBeNull();
    // RESOLVE substitution: the agent's soul filled the character section (not a character card).
    expect(h.prompts.some((p) => p.includes("SOUL-MARKER"))).toBe(true);

    // Persisted canon agrees.
    const canon = await loadCanonHistory(db, chatId);
    const assistant = canon.find((m) => m.role === "assistant");
    expect(assistant?.authorUserId).toBe(AGENT);
    expect(assistant?.characterId).toBeNull();
  });

  test("present-predicate ENABLED arm: a principal-disabled agent is dropped from the cast — it never speaks", async () => {
    const chatId = await seedAgentRoom();
    const h = sendHarness({ enabled: false });

    const outcome = await h.turn.send({ principal: principal(HOST), chatId, content: "hello" });

    // Only the user row commits — arbitration had no eligible AI speaker (the agent was excluded from the cast).
    expect(outcome.messages.filter((m) => m.role === "assistant")).toHaveLength(0);
    expect(outcome.messages.map((m) => m.role)).toEqual(["user"]);
  });

  test("an unhatched soul (resolveAgentSpeaker → null) drops the agent from the cast too", async () => {
    const chatId = await seedAgentRoom();
    const h = sendHarness({ soul: null });

    const outcome = await h.turn.send({ principal: principal(HOST), chatId, content: "hello" });

    expect(outcome.messages.filter((m) => m.role === "assistant")).toHaveLength(0);
  });

  // Per-room MUTE (D60, doc 03 §5 rung 1; D80): `setSeatKnobs({disabled})` flips the seat's `disabled` bit —
  // the SAME bit `isArbiterEligible` filters on. This proves the participantId-keyed knob VERB reaches the turn
  // consumer (verbs/turn.ts loadRoom → agentCandidates.disabled → arbitration), exactly like a muted character.
  test("a muted agent seat is skipped by arbitration — the mute verb reaches the turn consumer (no turn)", async () => {
    const chatId = await seedAgentRoom();
    const h = sendHarness();

    // Control: an enabled, unmuted agent is arbiter-selected and speaks.
    const spoke = await h.turn.send({ principal: principal(HOST), chatId, content: "hello" });
    expect(spoke.messages.filter((m) => m.role === "assistant")).toHaveLength(1);

    // Mute the seated agent through the real host verb (the ONE participantId-keyed AI-seat knob write, D80).
    // The verb return resolves the agent's display name (R10); unhatched here → the sourceKind label.
    const roster = createRoster(
      makeChatContext(db, { resolveAgentCardView: () => Promise.resolve(null), resolveAgentSourceKind: () => Promise.resolve("buddy") }),
      { emit: () => Promise.resolve() },
    );
    // The agent seat rides the deterministic id `seedAgentRoom` stamps (chat_participant_agent_<userId>).
    const agentSeatId = castId<ChatParticipantId>(`chat_participant_agent_${AGENT}`);
    const view = await roster.setSeatKnobs({ principal: principal(HOST), chatId, participantId: agentSeatId, patch: { disabled: true } });
    expect(view.disabled).toBe(true);

    // Now the muted agent is the only AI candidate but is filtered from selection — the round voices no one.
    const silent = await h.turn.send({ principal: principal(HOST), chatId, content: "again" });
    expect(silent.messages.filter((m) => m.role === "assistant")).toHaveLength(0);
    expect(silent.messages.map((m) => m.role)).toEqual(["user"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// The ENGINE GATE — canAgent('speak') refuses a force-injected / disabled agent BEFORE dispatch.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const OK_TURN = scripted("Hi there");

function engineWith(resolveAgentActor: ChatContext["resolveAgentActor"]): ReturnType<typeof createTurnEngine> {
  const ctx = makeChatContext(db, { runChatTurn: OK_TURN, resolveAgentActor });
  return createTurnEngine(ctx, {
    emit: () => Promise.resolve(),
    debitBudget: () => Promise.resolve(),
    resolveTurnPolicy: () => Promise.resolve({ budget: null, allowNonOwnerMaxProSub: false }),
    holder: "replica-1",
    lockTtlMs: 60_000,
    generateSegments: async () => ({ written: 0, skipped: 0 }),
    generateDigests: async () => ({ written: 0, skipped: 0 }),
    loadWitnessHorizons,
    recallMemory,
  });
}

const ASSEMBLE_CTX: AssembleContext = {
  character: { name: "Pip", description: "" },
  promptConfig: DEFAULT_PROMPT_CONFIG,
  activePersona: { name: "Alex", description: "the user" },
  recentMessages: [],
};

/** A force-injected AGENT-speaker prep (self-attributed new-slot assistant) — the selection never vetted it. */
function agentPrep(chatId: ChatId): TurnPrep {
  return {
    chatId,
    assembleContext: ASSEMBLE_CTX,
    connection: testConnection(),
    triggeredBy: HOST,
    runAsUserId: HOST,
    kind: "send",
    intent: {},
    speakerCharacterId: null,
    persist: { mode: "new-slot", role: "assistant", authorUserId: AGENT },
  };
}

describe("engine gate — canAgent('speak') before dispatch (the containment belt)", () => {
  beforeEach(async () => {
    // The force-injected author must exist as a users row (messages.authorUserId FK), even to be refused.
    await seedUser(db, "host");
    await seedAgent(db, HOST, "agent");
  });

  test("refuses a force-injected DISABLED agent (the kill-switch throws — nothing is voiced)", async () => {
    const chatId = await seedChat(db, "gate");
    const engine = engineWith((id) => Promise.resolve({ kind: "agent", userId: id, ownerUserId: HOST, enabled: false }));

    await expect(engine.runTurn(agentPrep(chatId))).rejects.toBeInstanceOf(DomainForbiddenError);
    // No assistant row was written — the refusal is a pre-start, side-effect-free belt.
    expect(await loadCanonHistory(db, chatId)).toHaveLength(0);
  });

  test("fails CLOSED when the principal has vanished (resolveAgentActor → null)", async () => {
    const chatId = await seedChat(db, "gate");
    const engine = engineWith(() => Promise.resolve(null));

    await expect(engine.runTurn(agentPrep(chatId))).rejects.toBeInstanceOf(ChatOperationError);
    expect(await loadCanonHistory(db, chatId)).toHaveLength(0);
  });

  test("an ENABLED agent passes the gate, runs, and self-attributes", async () => {
    const chatId = await seedChat(db, "gate");
    const engine = engineWith((id) => Promise.resolve({ kind: "agent", userId: id, ownerUserId: HOST, enabled: true }));

    const outcome = await engine.runTurn(agentPrep(chatId));

    expect(outcome.messages).toHaveLength(1);
    expect(outcome.messages[0]?.authorUserId).toBe(AGENT);
    expect(outcome.messages[0]?.characterId).toBeNull();
  });

  test("a plain CHARACTER turn never touches the agent gate (resolveAgentActor is never called)", async () => {
    const chatId = await seedChat(db, "gate");
    const characterId = await seedCharacter(db, HOST, "aria");
    let called = false;
    const engine = engineWith(() => {
      called = true;
      return Promise.resolve(null);
    });

    // No persist.authorUserId ⇒ a character new-slot; the gate short-circuits before any agent read.
    await engine.runTurn({
      chatId,
      assembleContext: ASSEMBLE_CTX,
      connection: testConnection(),
      triggeredBy: HOST,
      runAsUserId: HOST,
      kind: "send",
      intent: {},
      speakerCharacterId: characterId,
    });
    expect(called).toBe(false);
  });
});
