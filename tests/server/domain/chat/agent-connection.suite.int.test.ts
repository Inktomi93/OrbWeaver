// The AP3-3 per-agent CONNECTION (D60; agent-principal-design/04 §5 + 02 §3). Proves, end-to-end on real
// libSQL, that a seated agent voices through its OWN host-funded brain (`resolveRole('agent')`), replacing
// the round chat connection for AGENT speakers ONLY:
//   • an agent speaker's role request carries the AGENT connection (not the round connection);
//   • a CHARACTER speaker keeps the round connection byte-identically (resolveAgentConnection is never called);
//   • the fallback arm — a null agent-connection resolution degrades to the round connection (host-funded);
//   • funding attribution is UNCHANGED — the turn economics attribute to the HOST (runAsUserId), never the
//     agent/owner, even though the agent ran on its own connection (the AP2 twin-path, re-pinned for AP3-3).

import type { AgentSpeakerIdentity, ChatBusEvent } from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import type { Principal } from "@orb/contracts/identity";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { chatParticipants } from "@orb/db";
import type { ChatId, ChatParticipantId, Handle, ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { createActiveTurns } from "../../../../packages/server/src/domain/chat/active-turns";
import type { TurnRequest, TurnStreamChunk } from "../../../../packages/server/src/domain/chat/contract/results";
import { createTurnEngine } from "../../../../packages/server/src/domain/chat/engine/engine";
import { loadWitnessHorizons } from "../../../../packages/server/src/domain/chat/memory/persistence/queries";
import { recallMemory } from "../../../../packages/server/src/domain/chat/memory/recall/recall";
import { createTurn } from "../../../../packages/server/src/domain/chat/verbs/turn";
import { freshDb } from "../../../support/db";
import { principal as makePrincipal } from "../../../support/factories/principal.ts";
import { expect, test } from "../../../support/fixtures";
import { FROZEN_AT, makeChatContext, seedAgent, seedCharacter, seedChat, seedParticipant, seedUser, testConnection } from "./_support";

const HOST = castId<UserId>("user_host");
const AGENT = castId<UserId>("user_agent");
const SOUL: AgentSpeakerIdentity = { displayName: "Pip", systemPrompt: "SOUL-MARKER: You are Pip.", avatarAssetId: null };

/** A distinct host-funded agent connection — a different source + model than the round connection (vllm/
 *  test-model), so a captured request unambiguously proves which connection dispatched. */
function agentBrain(): ResolvedConnection {
  return { ...testConnection("max-pro-sub"), model: castId<ModelId>("claude-agent-brain") };
}

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
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

async function seatAgentRow(chatId: ChatId, agentUserId: UserId): Promise<void> {
  await db.insert(chatParticipants).values({
    id: castId<ChatParticipantId>(`chat_participant_agent_${agentUserId}`),
    chatId,
    kind: "agent",
    userId: agentUserId,
    role: "member",
    joinedAt: FROZEN_AT,
    joinSeq: 0,
    disabled: false,
  });
}

/** Host + a per-speaker group chat + host participant + a seated agent (owned by the host). */
async function seedAgentRoom(): Promise<ChatId> {
  await seedUser(db, "host");
  const chatId = await seedChat(db, "room", { metadata: { group: { output: "per-speaker", policy: "natural" } } });
  await seedParticipant(db, { chatId, key: "h", userId: HOST, role: "host" });
  await seedAgent(db, HOST, "agent");
  await seatAgentRow(chatId, AGENT);
  return chatId;
}

interface Harness {
  turn: ReturnType<typeof createTurn>;
  requests: TurnRequest[];
  deltas: StatsDelta[];
  agentConnCalls: UserId[];
  /** The SPEAKING agent's id passed to `resolveAgentConnection` — proves the per-agent-connection seam is fed (D67 amendment). */
  agentIdCalls: UserId[];
}

/** A send-capable harness. `agentConnection` overrides `resolveAgentConnection` (null ⇒ the fallback arm). */
function harness(agentConnection: ResolvedConnection | null): Harness {
  const requests: TurnRequest[] = [];
  const deltas: StatsDelta[] = [];
  const agentConnCalls: UserId[] = [];
  const agentIdCalls: UserId[] = [];
  const events: ChatBusEvent[] = [];
  const ctx = makeChatContext(db, {
    runChatTurn: (request) => {
      requests.push(request);
      return (async function* (): AsyncGenerator<TurnStreamChunk> {
        await Promise.resolve();
        yield { kind: "text", text: "Hi" };
        yield { kind: "final", economics: { content: "Hi", tokensIn: 4, tokensOut: 2, model: request.connection.model } };
      })();
    },
    applyStatsDelta: (_b: unknown, _d: Db, delta: StatsDelta): void => {
      deltas.push(delta);
    },
    resolveAgentActor: (id) => Promise.resolve({ kind: "agent", userId: id, ownerUserId: HOST, enabled: true }),
    resolveAgentSpeaker: () => Promise.resolve(SOUL as AgentSpeakerIdentity | null),
    resolveAgentConnection: (runAsUserId, agentUserId) => {
      agentConnCalls.push(runAsUserId);
      agentIdCalls.push(agentUserId);
      return Promise.resolve(agentConnection);
    },
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
    // The ROUND chat connection — vllm/test-model (distinct from the agent brain above).
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
  return { turn, requests, deltas, agentConnCalls, agentIdCalls };
}

describe("AP3-3 — a seated agent voices through its OWN host-funded connection", () => {
  test("the agent speaker's role request carries the AGENT connection, not the round connection", async () => {
    const chatId = await seedAgentRoom();
    const h = harness(agentBrain());

    await h.turn.send({ principal: principal(HOST), chatId, content: "hello" });

    // The one assistant request used the agent brain (max-pro-sub/claude-agent-brain), not the round vllm.
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0]?.connection.model).toBe("claude-agent-brain");
    expect(h.requests[0]?.connection.credential.source).toBe("max-pro-sub");
    // Resolved host-funded — under the frozen runAsUserId (the host), never the caller/owner axis.
    expect(h.agentConnCalls).toEqual([HOST]);
  });

  test("funding attribution is UNCHANGED — the agent's economics attribute to the HOST, characterId null", async () => {
    const chatId = await seedAgentRoom();
    const h = harness(agentBrain());

    await h.turn.send({ principal: principal(HOST), chatId, content: "hello" });

    // The assistant-turn economics delta: host-funded (ownerId = the host), self-attributed (no character
    // bucket) — the AP2 twin-path, re-pinned now that the agent runs on its OWN connection.
    const assistant = h.deltas.find((d) => (d.assistantTurns ?? 0) > 0);
    expect(assistant).toBeDefined();
    expect(assistant?.ownerId).toBe(HOST);
    expect(assistant?.characterId).toBeNull();
  });

  test("fallback arm: a null agent-connection resolution degrades to the round connection (host-funded)", async () => {
    const chatId = await seedAgentRoom();
    const h = harness(null);

    await h.turn.send({ principal: principal(HOST), chatId, content: "hello" });

    // resolveAgentConnection was consulted (the agent WAS the speaker) but returned null → the round
    // connection (vllm/test-model) voiced the agent — the AP3-2 interim posture, preserved.
    expect(h.agentConnCalls).toEqual([HOST]);
    // The SPEAKING agent's id is threaded to the resolve seam (feeds the per-agent connection cascade, D67 amendment).
    expect(h.agentIdCalls).toEqual([AGENT]);
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0]?.connection.model).toBe("test-model");
    expect(h.requests[0]?.connection.credential.source).toBe("vllm");
  });

  test("a CHARACTER speaker keeps the round connection — resolveAgentConnection is NEVER consulted", async () => {
    await seedUser(db, "host");
    const chatId = await seedChat(db, "charroom", { metadata: { group: { output: "per-speaker", policy: "natural" } } });
    await seedParticipant(db, { chatId, key: "h", userId: HOST, role: "host" });
    const characterId = await seedCharacter(db, HOST, "aria");
    await seedParticipant(db, { chatId, key: "c", characterId, role: "member" });
    const h = harness(agentBrain());

    await h.turn.send({ principal: principal(HOST), chatId, content: "hello" });

    // The character voiced on the round connection; the agent-connection seam was never touched.
    expect(h.agentConnCalls).toEqual([]);
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0]?.connection.model).toBe("test-model");
    expect(h.requests[0]?.connection.credential.source).toBe("vllm");
  });
});
