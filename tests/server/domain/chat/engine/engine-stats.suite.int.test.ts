// engine/engine — the STATS-CORRECTNESS gate (.int: real libSQL). The drift suite
// (`stats/write/drift-gate.suite`) replays the MUTATOR builders over a HAND-SEEDED canon; it can never see
// the ENGINE choosing the wrong builder per persist mode. THIS is that missing gate (stickler slice-4 F1):
// drive REAL engine turns (new-slot assistant, a swipe, a continue, an impersonate) so the engine's own
// mode→builder dispatch persists the canon AND records the live deltas, then reconcile the four rollups from
// that engine-produced canon and assert the two writers agree column-for-column.
//
// Before the fix the engine emitted a full `assistantTurnDelta` for ALL THREE modes, so every swipe/continue
// inflated `assistantTurns` and no swipe ever counted (F1); gen-time was never stamped (F2); and
// `maxContextTokens` was dropped on the live path (F6). If any of those regress, `toEqual` drifts.

import type { AssembleContext, ChatBusEvent } from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { StatsDelta } from "@orb/contracts/stats";
import type { BatchStmt, Db } from "@orb/db";
import { batchMany, characterStats, dailyStats, modelStats, ownerStats } from "@orb/db";
import type { CharacterId, ChatId, ModelId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/context";
import type { TurnPrep, TurnStreamChunk } from "../../../../../packages/server/src/domain/chat/contract/results";
import { createTurnEngine } from "../../../../../packages/server/src/domain/chat/engine/engine";
import { loadWitnessHorizons } from "../../../../../packages/server/src/domain/chat/memory/persistence/queries";
import { recallMemory } from "../../../../../packages/server/src/domain/chat/memory/recall/recall";
import { chatCreatedDelta } from "../../../../../packages/server/src/domain/chat/substrate/stats-delta";
import { applyStatsDelta } from "../../../../../packages/server/src/domain/stats/write/apply-delta";
import { reconcileStats } from "../../../../../packages/server/src/domain/stats/write/rebuild-from-canon";
import { createFrozenClock } from "../../../../support/clock";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { FROZEN_AT, makeChatContext, seedCharacter, seedChat, seedParticipant, seedPersona, seedUser, stubRunCompaction, TEST_CAPABILITY } from "../_support";

const HOST = castId<UserId>("user_host");

const CONNECTION: ResolvedConnection = {
  api: "chat-completions",
  model: castId<ModelId>("gpt"),
  // FABRICATION-OK: a stub ResolvedCredential — the engine reads only credential.source for the §9 belt.
  credential: { source: "vllm", credentialId: null } as unknown as ResolvedCredential,
  capability: TEST_CAPABILITY,
};

const ASSEMBLE_CTX: AssembleContext = {
  character: { name: "Aria", description: "a bold knight" },
  promptConfig: DEFAULT_PROMPT_CONFIG,
  activePersona: { name: "Nate", description: "the user" },
  recentMessages: [],
};

type RunChatTurn = ChatContext["runChatTurn"];

/** One scripted role turn — full economics (tokens/cost/cache/contextWindow) so every rollup column is
 *  exercised; NO reasoning (keeps the drift focused on the F1 turn-count / F2 gen-time / F6 window surface). */
function scripted(final: TurnStreamChunk & { kind: "final" }): RunChatTurn {
  const chunks: TurnStreamChunk[] = [{ kind: "text", text: final.economics.content }, final];
  return () =>
    (async function* (): AsyncGenerator<TurnStreamChunk> {
      await Promise.resolve();
      for (const c of chunks) {
        yield c;
      }
    })();
}

const REPLY = scripted({
  kind: "final",
  economics: {
    content: "the first reply here",
    tokensIn: 10,
    tokensOut: 20,
    costUsd: 0.5,
    cacheReadTokens: 5,
    cacheWriteTokens: 3,
    contextWindow: 1000,
    model: "gpt",
    provider: "openrouter",
  },
});
const SWIPE = scripted({
  kind: "final",
  economics: {
    content: "an alternative and longer take",
    tokensIn: 12,
    tokensOut: 25,
    costUsd: 0.25,
    cacheReadTokens: 6,
    cacheWriteTokens: 4,
    contextWindow: 1000,
    model: "gpt",
    provider: "openrouter",
  },
});
const CONTINUE = scripted({
  kind: "final",
  economics: {
    content: " and even more",
    tokensIn: 3,
    tokensOut: 8,
    costUsd: 0.125,
    cacheReadTokens: 1,
    cacheWriteTokens: 1,
    contextWindow: 1000,
    model: "gpt",
    provider: "openrouter",
  },
});
const IMPERSONATE = scripted({
  kind: "final",
  economics: {
    content: "the user speaks next",
    tokensIn: 4,
    tokensOut: 6,
    costUsd: 0.0625,
    contextWindow: 1000,
    model: "gpt",
    provider: "openrouter",
  },
});
// A new-slot assistant turn WITH a non-empty reasoning trace — the engine folds `reasoning` onto the
// variant, so a reconcile counts a reasoningGeneration on the owner/char/MODEL grains. The live
// `assistantTurnDelta` must credit `model_stats.reasoningGenerations` too (via `modelReasoningGenerations`),
// or the model row drifts 0-vs-1 against a rebuild.
const REASONING_REPLY = scripted({
  kind: "final",
  economics: {
    content: "a considered reply",
    reasoning: "let me weigh the options",
    tokensIn: 10,
    tokensOut: 20,
    costUsd: 0.5,
    cacheReadTokens: 5,
    cacheWriteTokens: 3,
    contextWindow: 1000,
    model: "gpt",
    provider: "openrouter",
  },
});

/** An engine over ONE ctx (ONE id-minter counter across all turns — a fresh ctx per turn would re-mint the
 *  same `message_1` and collide) whose `runChatTurn` pulls the next scripted response off `queue`, recording
 *  every emitted delta (the LIVE writer). The canon commits via the real db.batch; only the rollup upserts are
 *  captured so the test replays them into a clean table for the comparison. */
function engineFor(database: Db, deltas: StatsDelta[], queue: readonly RunChatTurn[]): ReturnType<typeof createTurnEngine> {
  let idx = 0;
  const ctx = makeChatContext(database, {
    runChatTurn: (request) => {
      const next = queue[idx] ?? queue[0];
      idx += 1;
      if (next === undefined) {
        throw new Error("engine-stats: no scripted turn");
      }
      return next(request);
    },
    applyStatsDelta: (_batch: unknown, _db: Db, delta: StatsDelta): void => {
      deltas.push(delta);
    },
  });
  return createTurnEngine(ctx, {
    emit: (_event: ChatBusEvent): Promise<void> => Promise.resolve(),
    debitBudget: (): Promise<void> => Promise.resolve(),
    resolveTurnPolicy: (): Promise<{ budget: number | null; allowNonOwnerMaxProSub: boolean }> =>
      Promise.resolve({ budget: null, allowNonOwnerMaxProSub: false }),
    holder: "replica-1",
    lockTtlMs: 60_000,
    generateSegments: async () => ({ written: 0, skipped: 0 }),
    generateDigests: async () => ({ written: 0, skipped: 0 }),
    loadWitnessHorizons,
    recallMemory,
    runCompaction: stubRunCompaction,
  });
}

function prepOf(chat: ChatId, over: Partial<TurnPrep>): TurnPrep {
  return {
    chatId: chat,
    assembleContext: ASSEMBLE_CTX,
    connection: CONNECTION,
    triggeredBy: HOST,
    runAsUserId: HOST,
    kind: "send",
    intent: {},
    speakerCharacterId: null,
    // Skip the fire-and-forget memory build (no summarizer/embed needed for a stats turn).
    memoryConfig: { mode: "off" },
    ...over,
  };
}

/** Drop the two legitimately non-deterministic columns (minted `id`, injected-clock `computedAt`). */
function strip(row: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k !== "id" && k !== "computedAt") {
      out[k] = v;
    }
  }
  return out;
}

const byKey =
  (k: string) =>
  (a: Record<string, unknown>, b: Record<string, unknown>): number =>
    String(a[k]).localeCompare(String(b[k]));

interface RollupSnapshot {
  owner: Record<string, unknown> | null;
  chars: Record<string, unknown>[];
  days: Record<string, unknown>[];
  models: Record<string, unknown>[];
}

async function snapshotRollups(database: Db, owner: UserId): Promise<RollupSnapshot> {
  const ownerRow = (await database.select().from(ownerStats).where(eq(ownerStats.ownerId, owner)))[0];
  const chars = await database.select().from(characterStats);
  const days = await database.select().from(dailyStats).where(eq(dailyStats.ownerId, owner));
  const models = await database.select().from(modelStats).where(eq(modelStats.ownerId, owner));
  return {
    owner: ownerRow ? strip(ownerRow) : null,
    chars: chars.map(strip).sort(byKey("characterId")),
    days: days.map(strip).sort(byKey("day")),
    models: models.map(strip).sort(byKey("model")),
  };
}

async function wipeRollups(database: Db): Promise<void> {
  await database.delete(characterStats);
  await database.delete(ownerStats);
  await database.delete(dailyStats);
  await database.delete(modelStats);
}

let db: Db;
let charId: CharacterId;
let chatId: ChatId;
let personaId: PersonaId;

beforeEach(async () => {
  db = await freshDb();
  await seedUser(db, "host");
  charId = await seedCharacter(db, HOST, "aria");
  personaId = await seedPersona(db, HOST, "nate");
  chatId = await seedChat(db, "a");
  // The character participant scopes the chat to the owner (reconcile's `ownerChatIds` — D18 membership).
  await seedParticipant(db, { chatId, key: "aria", characterId: charId, role: "member" });
  await seedParticipant(db, { chatId, key: "host", userId: HOST, role: "host" });
});

describe("engine stats dispatch — live deltas equal a canon rebuild across every persist mode (F1/F2/F6)", () => {
  test("new-slot + swipe + continue + impersonate: no drift vs reconcileStats", async () => {
    const deltas: StatsDelta[] = [];
    const engine = engineFor(db, deltas, [REPLY, SWIPE, CONTINUE, IMPERSONATE]);

    // Turn 1 — new-slot assistant (send): a fresh slot at seq 1.
    const o1 = await engine.runTurn(prepOf(chatId, { kind: "send", speakerCharacterId: charId }));
    const slotId = o1.messages[0]?.id;
    if (slotId === undefined) {
      throw new Error("turn 1 committed no message");
    }

    // Turn 2 — swipe (append-variant): the old variant demotes to a swipe, the new one is selected.
    await engine.runTurn(
      prepOf(chatId, {
        kind: "swipe",
        speakerCharacterId: charId,
        persist: { mode: "append-variant", targetMessageId: slotId },
      }),
    );

    // Turn 3 — continue: extend the selected variant in place.
    await engine.runTurn(
      prepOf(chatId, {
        kind: "continue",
        appendUserTurn: "[continue]",
        persist: { mode: "continue", targetMessageId: slotId },
      }),
    );

    // Turn 4 — impersonate: a role:"user" slot (the model writes the user's line). Must count as a USER turn,
    // NEVER an assistant turn (the old unconditional assistantTurnDelta miscounted it).
    await engine.runTurn(
      prepOf(chatId, {
        kind: "impersonate",
        persist: { mode: "new-slot", role: "user", authorUserId: HOST, personaId },
      }),
    );

    // Writer A — reconcile the four rollups from the engine-produced canon.
    await reconcileStats(db, { ownerId: HOST, now: createFrozenClock(FROZEN_AT + 5000).now });
    const reconciled = await snapshotRollups(db, HOST);

    // Writer B — replay the deltas the engine recorded (+ the chat-creation counts reconcile derives from the
    // chat/character tables, which the turn deltas don't own — the drift suite does the same).
    await wipeRollups(db);
    const batch: BatchStmt[] = [];
    applyStatsDelta(
      batch,
      db,
      chatCreatedDelta({
        ownerId: HOST,
        characterId: charId,
        forked: false,
        newCharacter: true,
        now: FROZEN_AT,
      }),
    );
    for (const delta of deltas) {
      applyStatsDelta(batch, db, delta);
    }
    await db.batch(batchMany(batch));
    const live = await snapshotRollups(db, HOST);

    // THE GATE: the live writer (the engine's mode→builder dispatch) equals a rebuild over the same canon.
    expect(live).toEqual(reconciled);

    // Guard against a false green from two identical empties: pin the actual turn shape.
    // assistantTurns 1 (the ONE selected variant of the assistant slot — the swipe is a swipe, not a turn),
    // swipes 1 (the demoted original), userTurns 1 (the impersonate), variantMessages 1 (the settled slot).
    expect(live.owner).toMatchObject({
      assistantTurns: 1,
      swipes: 1,
      userTurns: 1,
      variantMessages: 1,
      maxContextTokens: 1000,
    });
  });
});

describe("engine stats — a reasoning-bearing assistant turn credits model_stats.reasoningGenerations", () => {
  test("new-slot assistant WITH reasoning: the live model reasoning column equals a canon rebuild", async () => {
    const deltas: StatsDelta[] = [];
    const engine = engineFor(db, deltas, [REASONING_REPLY]);

    // One real new-slot assistant turn — the engine folds the reasoning trace onto the committed variant.
    await engine.runTurn(prepOf(chatId, { kind: "send", speakerCharacterId: charId }));

    // Writer A — reconcile the four rollups from the engine-produced canon (which carries the reasoning text).
    await reconcileStats(db, { ownerId: HOST, now: createFrozenClock(FROZEN_AT + 5000).now });
    const reconciled = await snapshotRollups(db, HOST);

    // Writer B — replay the engine's recorded live deltas (+ the chat-creation counts reconcile derives).
    await wipeRollups(db);
    const batch: BatchStmt[] = [];
    applyStatsDelta(
      batch,
      db,
      chatCreatedDelta({
        ownerId: HOST,
        characterId: charId,
        forked: false,
        newCharacter: true,
        now: FROZEN_AT,
      }),
    );
    for (const delta of deltas) {
      applyStatsDelta(batch, db, delta);
    }
    await db.batch(batchMany(batch));
    const live = await snapshotRollups(db, HOST);

    // THE GATE: no drift on ANY column — the model reasoning column included. Before the fix the live
    // `assistantTurnDelta` omitted `modelReasoningGenerations`, so `model_stats.reasoningGenerations` stayed 0
    // live while a rebuild folded 1 → drift.
    expect(live).toEqual(reconciled);
    // Pin the reasoning contribution is actually present on every grain (guard against a false green from two
    // identical zeros).
    expect(live.owner).toMatchObject({ reasoningGenerations: 1 });
    expect(live.models[0]).toMatchObject({ reasoningGenerations: 1 });
    expect(live.chars[0]).toMatchObject({ reasoningGenerations: 1 });
  });
});

describe("engine stats — gen-time is populated on the live path (F2)", () => {
  test("a real turn stamps gen bounds → owner/model gen-time > 0", async () => {
    // An ADVANCING clock so the pipeline window (gen_finished − gen_started) is non-zero.
    let t = FROZEN_AT;
    const deltas: StatsDelta[] = [];
    const ctx = makeChatContext(db, {
      now: () => {
        const v = t;
        t += 1000;
        return v;
      },
      runChatTurn: REPLY as never,
      applyStatsDelta: (_batch: unknown, _db: Db, delta: StatsDelta): void => {
        deltas.push(delta);
      },
    });
    const engine = createTurnEngine(ctx, {
      emit: (): Promise<void> => Promise.resolve(),
      debitBudget: (): Promise<void> => Promise.resolve(),
      resolveTurnPolicy: () => Promise.resolve({ budget: null, allowNonOwnerMaxProSub: false }),
      holder: "replica-1",
      lockTtlMs: 60_000,
      generateSegments: async () => ({ written: 0, skipped: 0 }),
      generateDigests: async () => ({ written: 0, skipped: 0 }),
      loadWitnessHorizons,
      recallMemory,
      runCompaction: stubRunCompaction,
    });

    await engine.runTurn(prepOf(chatId, { kind: "send", speakerCharacterId: charId }));

    const batch: BatchStmt[] = [];
    for (const delta of deltas) {
      applyStatsDelta(batch, db, delta);
    }
    await db.batch(batchMany(batch));

    const owner = (await db.select().from(ownerStats).where(eq(ownerStats.ownerId, HOST)))[0];
    const model = (await db.select().from(modelStats).where(eq(modelStats.ownerId, HOST)))[0];
    // Before F2 nothing stamped gen_started_at/gen_finished_at, so this stayed 0/null forever.
    expect(owner?.genTimeMs).toBeGreaterThan(0);
    expect(owner?.genSamples).toBe(1);
    expect(model?.genTimeMs).toBeGreaterThan(0);
  });
});
