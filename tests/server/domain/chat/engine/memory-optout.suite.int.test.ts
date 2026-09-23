// The D36 memory opt-out on the BUILD side — a cross-cutting property suite spanning `engine/engine.ts` +
// `memory/generate/{digests,segments}.ts` + the `TurnPrep.memoryConfig` threading (hence `.suite.int` — it
// mirrors no single source module). .int: real libSQL + the REAL memory build wired as the composition root
// does. TASK #54: the engine's post-turn digest build was passing NO config → `resolveCfg(undefined)` →
// baked `mixC` ON, so a host who set `memory.enabled=false` still paid the summarizer + embed every turn
// (recall honored the opt-out; the build did not — D36 violated on the build side). This pins the fix:
// `prep.memoryConfig` is threaded from the one resolved source, and the engine SKIPS the whole §3a build when
// `mode:"off"` (no summarizer call, no digest rows) — while an enabled turn still builds. Drives the REAL
// engine + REAL `generateDigests`/`generateSegments` (not fixture twins).

import type { AssembleContext } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { chatDigests } from "@orb/db";
import type { CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe, vi } from "vitest";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/context.ts";
import type { MemoryConfig } from "../../../../../packages/server/src/domain/chat/contract/memory.ts";
import type { TurnPrep, TurnStreamChunk } from "../../../../../packages/server/src/domain/chat/contract/results.ts";
import { createTurnEngine } from "../../../../../packages/server/src/domain/chat/engine/engine.ts";
import { generateDigests } from "../../../../../packages/server/src/domain/chat/memory/generate/digests.ts";
import { generateSegments } from "../../../../../packages/server/src/domain/chat/memory/generate/segments.ts";
import { loadWitnessHorizons } from "../../../../../packages/server/src/domain/chat/memory/persistence/queries.ts";
import { recallMemory } from "../../../../../packages/server/src/domain/chat/memory/recall/recall.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId } from "../../../../support/inference-identities.ts";
import { makeChatContext, seedCharacter, seedChat, seedMessage, seedParticipant, seedUser, stubRunCompaction, testConnection } from "../_support.ts";
import { fakeEmbeddingsStore, fakeSummarize } from "../memory/_support.ts";

const HOST = castId<UserId>("user_host");

// blockSize 2 / verbatimWindow 0 → after the turn commits at seq 4, blocks [1-2],[3-4] are aged-out and digest.
const BUILD_CFG: MemoryConfig = { blockSize: 2, verbatimWindow: 0, mode: "mixC" };
const OFF_CFG: MemoryConfig = { blockSize: 2, verbatimWindow: 0, mode: "off" };

const ASSEMBLE_CTX: AssembleContext = {
  character: { name: "Aria", description: "a bold knight" },
  promptConfig: DEFAULT_PROMPT_CONFIG,
  activePersona: { name: "Nate", description: "the user" },
  recentMessages: [],
};

const OK_TURN: ChatContext["runChatTurn"] = () =>
  (async function* (): AsyncGenerator<TurnStreamChunk> {
    await Promise.resolve();
    yield { kind: "text", text: "Hi" };
    yield {
      kind: "final",
      economics: { content: "Hi there", tokensIn: 4, tokensOut: 2, model: testModelId("test-model") },
    };
  })();

function prepOf(chatId: ChatId, over: Partial<TurnPrep>): TurnPrep {
  return {
    chatId,
    assembleContext: ASSEMBLE_CTX,
    connection: testConnection(),
    triggeredBy: HOST,
    funderUserId: HOST,
    runAsUserId: HOST,
    kind: "send",
    intent: {},
    speakerCharacterId: null,
    ...over,
  };
}

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

/** Seed a two-character group chat with three aged-out canon rows + the synthetic group-as-character row, and
 *  build the REAL engine wired the way the composition root wires it (the real memory build injected, the
 *  summarize / embeddingsStore fakes recording the work). Returns the engine + the recorders. */
async function groupHarness(): Promise<{
  chatId: ChatId;
  synthetic: CharacterId;
  summarize: ReturnType<typeof fakeSummarize>;
  engine: ReturnType<typeof createTurnEngine>;
}> {
  const host = await seedUser(db, castId<Handle>("host"));
  const c1 = await seedCharacter(db, host, "aria");
  const c2 = await seedCharacter(db, host, "bram");
  const synthetic = await seedCharacter(db, host, "grp_synthetic");
  const chatId = await seedChat(db, "grp");
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: "c1", characterId: c1 });
  await seedParticipant(db, { chatId, key: "c2", characterId: c2 });
  // Three seeded turns → the engine's turn commits seq 4, aging out blocks [1-2],[3-4] under BUILD_CFG.
  for (let seq = 1; seq <= 3; seq += 1) {
    await seedMessage(db, chatId, seq, {
      characterId: seq % 2 === 0 ? c2 : c1,
      content: `group turn ${seq}`,
    });
  }

  const summarize = fakeSummarize();
  const store = fakeEmbeddingsStore(db);
  const ctx = makeChatContext(db, {
    runChatTurn: OK_TURN,
    mintSyntheticGroupCharacter: () => Promise.resolve({ characterId: synthetic }),
    findSyntheticGroupCharacter: () => Promise.resolve({ characterId: synthetic }),
    summarize: summarize.op,
    embeddingsStore: store.store,
    embeddingsStoreSegments: store.storeSegments,
  });
  const engine = createTurnEngine(ctx, {
    emit: (): Promise<void> => Promise.resolve(),

    holder: "replica-1",
    lockTtlMs: 60_000,
    // The REAL build front doors — exactly what the composition root injects (engine.ts §3a threads
    // `prep.memoryConfig` into these; the config is what decides whether they do any work).
    generateSegments,
    generateDigests,
    loadWitnessHorizons,
    recallMemory,
    runCompaction: stubRunCompaction,
  });
  return { chatId, synthetic, summarize, engine };
}

describe("createTurnEngine — D36 memory opt-out on the BUILD side (TASK #54)", () => {
  test("memory.enabled=false (mode:off) → a completed group turn does ZERO build work (no summarizer, no digest rows)", async () => {
    const h = await groupHarness();

    const outcome = await h.engine.runTurn(prepOf(h.chatId, { memoryConfig: OFF_CFG }));
    expect(outcome.aborted).toBe(false); // the turn itself still completes — only the build is skipped

    // The fire-and-forget build is GATED OUT entirely when mode:off — flush any pending microtasks and confirm
    // no summarizer call and no digest rows landed (both the gate AND the build's own mode:off no-op protect).
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(h.summarize.calls).toHaveLength(0);
    const rows = await db.select().from(chatDigests);
    expect(rows).toHaveLength(0);
  });

  test("memory enabled (mode:mixC) → the SAME completed group turn builds digests (summarizer runs, rows land)", async () => {
    const h = await groupHarness();

    const outcome = await h.engine.runTurn(prepOf(h.chatId, { memoryConfig: BUILD_CFG }));
    expect(outcome.aborted).toBe(false);

    // The post-turn build is fire-and-forget — poll until the digests it writes land (the control that proves
    // the disabled case above is a real skip, not a broken build).
    await vi.waitFor(async () => {
      const rows = await db.select().from(chatDigests);
      expect(rows.length).toBeGreaterThan(0);
    });
    expect(h.summarize.calls.length).toBeGreaterThan(0);
    // The digests keyed under the REAL synthetic group bucket (proves the group §3a path ran, not just per-char).
    const rows = await db.select().from(chatDigests);
    expect(rows.some((r) => r.scopedCharacterId === h.synthetic)).toBe(true);
  });
});
