import assert from "node:assert/strict";
import type { GenerationUsageLeg } from "@orb/contracts/inference";
import { generationUsageLegSchema } from "@orb/contracts/inference";
import {
  characters,
  chatGenerationObservations,
  chatParticipants,
  chats,
  dailyStats,
  messages,
  messageVariants,
  modelStats,
  ownerStats,
  userConnections,
  users,
} from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import type { ChatResult } from "@orb/inference";
import { GenerationObservationPersistenceError } from "@orb/inference";
import type { CharacterId, ChatTurnId, HandleKey, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, newId } from "@orb/kit/ids";
import { statsBucketStart } from "@orb/kit/stats-tally";
import { eq, inArray, sql } from "drizzle-orm";
import { vi } from "vitest";
import { observeChatResult } from "../../../../../packages/inference/src/backends/kit/generation-observation.ts";
import { runSideGen } from "../../../../../packages/inference/src/roles/side-gen.ts";
import { createActiveTurns } from "../../../../../packages/server/src/domain/chat/active-turns.ts";
import { CHAT_OP_CODES, ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors.ts";
import type { GenerationObservationParent } from "../../../../../packages/server/src/domain/chat/contract/generation-observation.ts";
import { smartArbitrate } from "../../../../../packages/server/src/domain/chat/engine/smart-arbitrate.ts";
import {
  appendGenerationObservation,
  createGenerationObservationSession,
  generationObservationFenceStatement,
  generationObservationTransferStatements,
  loadGenerationObservations,
} from "../../../../../packages/server/src/domain/chat/persistence/generation-observation.ts";
import { createChatLifecycle } from "../../../../../packages/server/src/domain/chat/verbs/chat-lifecycle.ts";
import { createClaimChat } from "../../../../../packages/server/src/domain/chat/verbs/claim-chat.ts";
import { applyStatsDelta, bumpStatsCanonVersion, reconcileStats } from "../../../../../packages/server/src/domain/stats/index.ts";
import { freshHeldDb } from "../../../../support/db.ts";
import { seedCharacter } from "../../../../support/factories/character.ts";
import { seedChat } from "../../../../support/factories/chat.ts";
import { makeGenerationUsage } from "../../../../support/factories/generation-usage.ts";
import { seedMessage } from "../../../../support/factories/message.ts";
import { principal } from "../../../../support/factories/principal.ts";
import { makeResolved } from "../../../../support/factories/resolved-connection.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId, testProviderId } from "../../../../support/inference-identities.ts";
import { makeChatContext, noClaim } from "../_support.ts";

const OBSERVED_AT = 1_700_000_000_000;

test.for([
  "cohort-replacement",
  "voice-owner",
  "target-edit",
  "database-failure",
] as const)("postcommit transfer refuses %s atomically without losing completed facts or changing a surviving money home", async (race, { ids }) => {
  const held = await freshHeldDb();
  const db = held.db;
  const owner = await seedUser(db);
  const other = await seedUser(db);
  const funder = await seedUser(db);
  const room = await seedChat(db);
  const voice = await seedCharacter(db, { ownerId: owner.id });
  await db.insert(chatParticipants).values({
    id: castId(ids.next(ID_PREFIX.chatParticipant)),
    chatId: room.id,
    kind: "character",
    characterId: voice.id,
    role: "member",
    joinedAt: OBSERVED_AT,
    joinSeq: 0,
  });
  if (race === "voice-owner") {
    for (const ownerId of [owner.id, other.id]) {
      const card = await seedCharacter(db, { ownerId });
      await db.insert(chatParticipants).values({
        id: castId(ids.next(ID_PREFIX.chatParticipant)),
        chatId: room.id,
        kind: "character",
        characterId: card.id,
        role: "member",
        joinedAt: OBSERVED_AT,
        joinSeq: 1,
      });
    }
  }
  const source = await seedMessage(db, { chatId: room.id, characterId: voice.id, content: "Retained reply." });
  const base = paidLegOf(OBSERVED_AT, 0.25);
  await db
    .update(messageVariants)
    .set({
      ...makeGenerationUsage(0.25, { tokensIn: base.tokensIn, tokensOut: base.tokensOut }),
      tokenProvenance: "measured",
      model: base.model,
      provider: base.provider,
      metadata: { usageLegs: [base] },
    })
    .where(eq(messageVariants.id, source.variantId));
  const ctx = makeChatContext(db, {
    now: () => OBSERVED_AT,
    applyStatsDelta: (batch, opDb, delta) => applyStatsDelta(batch as BatchStmt[], opDb, delta),
    bumpStatsCanonVersion: (batch, opDb, ownerId) => bumpStatsCanonVersion(batch as BatchStmt[], opDb, ownerId),
  });
  const parent: GenerationObservationParent = {
    chatId: room.id,
    turnId: castId<ChatTurnId>(ids.next(ID_PREFIX.chatTurn)),
    sourceMessageId: source.id,
    sourceVariantId: source.variantId,
  };
  const session = createGenerationObservationSession({ db, now: ctx.now, applyStatsDelta }, parent, ctx);
  const connection = makeResolved({ task: "chat", ownerId: funder.id, providerId: "google" });
  await db
    .insert(userConnections)
    .values({ id: connection.connectionId, ownerId: funder.id, providerId: connection.providerId, model: connection.model, label: "Chat" });
  const result: ChatResult = {
    reply: "",
    reasoning: "",
    reasoningRedacted: false,
    stopReason: "STOP",
    terminalReason: null,
    finishReason: "stop",
    ttftMs: null,
    durationApiMs: 1,
    apiErrorStatus: null,
    numTurns: 1,
    appliedEffort: null,
    usage: { ...makeGenerationUsage(0.125, { tokensIn: 12, tokensOut: 17 }), model: connection.model, contextWindow: null, maxOutputTokens: null },
    events: [],
    rateLimit: null,
  };
  await reconcileStats(db, { now: ctx.now });
  const gate = held.hold(/insert into "chats"/i);
  const completing = session.onObservedResult(result, connection).catch((error: unknown) => error);
  let before: (typeof ownerStats.$inferSelect)[] = [];
  try {
    await gate.reached;
    if (race === "cohort-replacement" || race === "voice-owner") {
      await db.update(characters).set({ ownerId: other.id }).where(eq(characters.id, voice.id));
    }
    if (race === "target-edit") {
      await db.update(messageVariants).set({ content: "Changed retained reply." }).where(eq(messageVariants.id, source.variantId));
    }
    if (race === "database-failure") {
      await db.run(sql`CREATE TRIGGER fixture_attach_failure BEFORE UPDATE ON message_variants BEGIN SELECT RAISE(ABORT, 'fixture attach write failed'); END`);
    }
    await reconcileStats(db, { now: ctx.now });
    before = await db.select().from(ownerStats).orderBy(ownerStats.ownerId);
  } finally {
    gate.release();
  }
  const failure = await completing;
  assert(failure instanceof GenerationObservationPersistenceError);
  expect(failure.cause instanceof ChatOperationError).toBe(race !== "database-failure");
  expect(await db.select().from(ownerStats).orderBy(ownerStats.ownerId)).toEqual(before);
  expect((await db.select().from(messageVariants).where(eq(messageVariants.id, source.variantId)))[0]?.metadata?.usageLegs).toEqual([base]);
  expect(await db.select().from(chatGenerationObservations)).toMatchObject([
    { chatId: room.id, sourceMessageId: source.id, sourceVariantId: source.variantId, funderUserId: funder.id, costUsd: 0.125, tokensIn: 12, tokensOut: 17 },
  ]);
  await reconcileStats(db, { now: ctx.now });
  expect(await db.select().from(ownerStats).orderBy(ownerStats.ownerId)).toEqual(before);
});

test.for([
  "append",
  "normalization",
] as const)("a completed Smart call's durable %s failure keeps its cause and cannot degrade or purchase a correction", async (phase, { db, ids }) => {
  const owner = await seedUser(db);
  const room = await seedChat(db, { withHost: true });
  const connection = makeResolved({ task: "structured", ownerId: owner.id, providerId: "google" });
  await db
    .insert(userConnections)
    .values({ id: connection.connectionId, ownerId: owner.id, providerId: connection.providerId, model: connection.model, label: "Utility" });
  const cause = new Error(`fixture durable ${phase} failed`);
  const session = createGenerationObservationSession(
    {
      db,
      now: () => {
        if (phase === "normalization") {
          throw cause;
        }
        return OBSERVED_AT;
      },
      applyStatsDelta: () => {
        throw cause;
      },
    },
    {
      chatId: room.id,
      turnId: castId<ChatTurnId>(ids.next(ID_PREFIX.chatTurn)),
      sourceMessageId: null,
      sourceVariantId: null,
    },
  );
  let calls = 0;
  const result: ChatResult = {
    reply: '{"responders":["Aria"]}',
    reasoning: "",
    reasoningRedacted: false,
    stopReason: "STOP",
    terminalReason: null,
    finishReason: "stop",
    ttftMs: null,
    durationApiMs: 1,
    apiErrorStatus: null,
    numTurns: 1,
    appliedEffort: null,
    usage: { ...makeGenerationUsage(0.125, { tokensIn: 10, tokensOut: 20 }), model: connection.model, contextWindow: null, maxOutputTokens: null },
    events: [],
    rateLimit: null,
  };
  const refs = ["Aria", "Bran"].map((name) => ({ name, ref: { kind: "character" as const, characterId: castId<CharacterId>(ids.next(ID_PREFIX.character)) } }));
  const attempt = smartArbitrate({
    arbiter: () =>
      Promise.resolve({
        contextTokens: 16_384,
        structured: (inputs, opts) =>
          runSideGen(
            {
              connection,
              inputs,
              responseFormat: opts.responseFormat,
              onObservedResult: session.onObservedResult,
            },
            {
              concurrency: 1,
              now: () => OBSERVED_AT,
              normalize: () => Promise.reject(new Error("unexpected image normalization")),
              log: { info: () => undefined, warn: () => undefined, debug: () => undefined, error: () => undefined },
              runChatTurn: async (request) => {
                calls += 1;
                await observeChatResult(request, result);
                return result;
              },
            },
          ),
      }),
    candidates: refs.map(({ ref }) => ({ ref, talkativeness: 0.5, disabled: false, leftSeq: null })),
    speakerCandidates: refs,
    characterLines: new Map<CharacterId, string>(),
    transcript: [{ speakerName: "Player", text: "What happens next?", characterId: null }],
    humanNames: ["Player"],
    room: {},
    lastSpeaker: null,
    rng: () => 0.5,
    prose: {},
    sampling: {},
  });
  const failure = await attempt.catch((error: unknown) => error);
  assert(failure instanceof GenerationObservationPersistenceError);
  expect(failure.cause).toBe(cause);
  expect(calls).toBe(1);
  expect(await db.select().from(chatGenerationObservations)).toEqual([]);
});

function paidLegOf(at: number, cost: number): GenerationUsageLeg {
  return generationUsageLegSchema.parse({
    ...makeGenerationUsage(cost, { tokensIn: 70, tokensOut: 2048 }),
    model: testModelId("gemini-3.1-pro-preview"),
    provider: testProviderId("google"),
    wire: "google-generative-ai",
    observedAt: at,
    contextWindow: null,
    maxOutputTokens: null,
    modelCalls: 1,
    durationApiMs: null,
    ttftMs: null,
    finishReason: "length",
    stopReason: "MAX_TOKENS",
    terminalReason: null,
    generationId: null,
  });
}

test("a later room database failure preserves its paid facts while the earlier committed death is already fanned", async ({ db, ids }) => {
  const funder = await seedUser(db);
  const expired = OBSERVED_AT - 2 * 86_400_000;
  const a = await seedChat(db, { withHost: true, startedAt: null, createdAt: expired });
  const b = await seedChat(db, { withHost: true, startedAt: null, createdAt: expired });
  const hostId = a.hostUserId;
  if (hostId === undefined) {
    throw new Error("The owned-room fixture requires a host");
  }
  await db.update(chatParticipants).set({ userId: hostId }).where(eq(chatParticipants.chatId, b.id));
  const [first, second] = [a, b].sort((left, right) => left.id.localeCompare(right.id));
  if (first === undefined || second === undefined) {
    throw new Error("The failure control requires two independently eligible rooms");
  }
  const ctx = { db, now: () => OBSERVED_AT, applyStatsDelta };
  for (const room of [first, second]) {
    const parent: GenerationObservationParent = {
      chatId: room.id,
      turnId: castId<ChatTurnId>(ids.next(ID_PREFIX.chatTurn)),
      sourceMessageId: null,
      sourceVariantId: null,
    };
    const base = paidLegOf(OBSERVED_AT, room.id === first.id ? 0.125 : 0.25);
    const leg =
      room.id === first.id
        ? generationUsageLegSchema.parse({ ...base, provider: "claude-sub", wire: "agent-sdk", costProvenance: "estimated", costDetails: null })
        : base;
    expect(await appendGenerationObservation(ctx, parent, { ordinal: 0, funderUserId: funder.id, connectionId: null, leg })).toBe(true);
  }
  await db.run(sql`CREATE TABLE fixture_reap_blocker (chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE RESTRICT)`);
  await db.run(sql`INSERT INTO fixture_reap_blocker (chat_id) VALUES (${second.id})`);
  const deaths: string[] = [];
  const life = createChatLifecycle(
    makeChatContext(db, {
      now: ctx.now,
      applyStatsDelta: (batch, opDb, delta) => applyStatsDelta(batch as BatchStmt[], opDb, delta),
    }),
    {
      emit: () => Promise.resolve(),
      emitLive: (event): void => {
        deaths.push(event.chatId);
      },
      activeTurns: createActiveTurns(),
      claimChat: noClaim,
    },
  );
  await expect(life.reapTemporaryChats({ principal: principal(hostId) })).rejects.toThrow(/FOREIGN KEY constraint failed/);
  expect(deaths).toEqual([first.id]);
  expect((await db.select().from(chats)).map((room) => room.id)).toEqual([second.id]);
  expect((await db.select().from(chatGenerationObservations)).map((fact) => fact.chatId)).toEqual([second.id]);
  expect(await db.select().from(ownerStats).where(eq(ownerStats.ownerId, funder.id))).toMatchObject([
    { costUsd: 0.25, costSamples: 1, notionalCostSamples: 0, tokensIn: 70, tokensOut: 2048 },
  ]);
  expect(await db.select().from(dailyStats).where(eq(dailyStats.ownerId, funder.id))).toMatchObject([
    { costUsd: 0.25, costSamples: 1, notionalCostSamples: 0 },
  ]);
});

test("paid TTL cleanup skips a claimed room, deletes another independently and excludes a newly qualifying room", async ({ ids }) => {
  const held = await freshHeldDb();
  const db = held.db;
  const funder = await seedUser(db);
  const expired = OBSERVED_AT - 2 * 86_400_000;
  const rescued = await seedChat(db, { withHost: true, startedAt: null, createdAt: expired });
  const hostId = rescued.hostUserId;
  if (hostId === undefined) {
    throw new Error("The owned-room fixture requires a host");
  }
  const doomed = await seedChat(db, { withHost: true, startedAt: null, createdAt: expired });
  const newEligible = await seedChat(db, { withHost: true, createdAt: expired });
  await db
    .update(chatParticipants)
    .set({ userId: hostId })
    .where(inArray(chatParticipants.chatId, [doomed.id, newEligible.id]));
  const observationCtx = { db, now: () => OBSERVED_AT, applyStatsDelta };
  const parents: GenerationObservationParent[] = [rescued, doomed, newEligible].map((room) => ({
    chatId: room.id,
    turnId: castId<ChatTurnId>(ids.next(ID_PREFIX.chatTurn)),
    sourceMessageId: null,
    sourceVariantId: null,
  }));
  for (const [index, parent] of parents.entries()) {
    const cost = [0.125, 0.25, 0.5][index];
    if (cost === undefined) {
      throw new Error("Every paid room has a configured fixture cost");
    }
    expect(
      await appendGenerationObservation(observationCtx, parent, { ordinal: 0, funderUserId: funder.id, connectionId: null, leg: paidLegOf(OBSERVED_AT, cost) }),
    ).toBe(true);
  }
  const deaths: string[] = [];
  const repaints: string[] = [];
  const life = createChatLifecycle(
    makeChatContext(db, {
      now: () => OBSERVED_AT,
      applyStatsDelta: (batch, opDb, delta) => applyStatsDelta(batch as BatchStmt[], opDb, delta),
      emitChatChanged: (chatId): Promise<void> => {
        repaints.push(chatId);
        return Promise.resolve();
      },
    }),
    {
      emit: () => Promise.resolve(),
      emitLive: (event): void => {
        deaths.push(event.chatId);
      },
      activeTurns: createActiveTurns(),
      claimChat: noClaim,
    },
  );
  const gate = held.hold(/delete from "chats"/i);
  const sweeping = life.reapTemporaryChats({ principal: principal(hostId) });
  await gate.reached;
  await createClaimChat(makeChatContext(db))(rescued.id);
  await db.update(chats).set({ temporary: true }).where(eq(chats.id, newEligible.id));
  gate.release();
  expect(await sweeping).toEqual({ reaped: 1 });
  expect(deaths).toEqual([doomed.id]);
  expect(repaints).toEqual([rescued.id]);
  expect((await db.select().from(chats)).map((room) => room.id)).toEqual([rescued.id, newEligible.id]);
  expect((await db.select().from(chatGenerationObservations)).map((row) => row.chatId)).toEqual([rescued.id, newEligible.id]);
  expect(await db.select().from(ownerStats).where(eq(ownerStats.ownerId, funder.id))).toMatchObject([
    { tokensIn: 140, tokensOut: 4096, costUsd: 0.625, costSamples: 2 },
  ]);
});

test("a completion appended after the deletion read refuses the stale empty snapshot without refund or orphaning", async ({ ids }) => {
  const held = await freshHeldDb();
  const db = held.db;
  const funder = await seedUser(db);
  const room = await seedChat(db, { withHost: true });
  const hostId = room.hostUserId;
  if (hostId === undefined) {
    throw new Error("The owned-room fixture requires a host");
  }
  const liveEvents: string[] = [];
  const ctx = { db, now: () => OBSERVED_AT, applyStatsDelta };
  const life = createChatLifecycle(makeChatContext(db, { applyStatsDelta: (batch, opDb, delta) => applyStatsDelta(batch as BatchStmt[], opDb, delta) }), {
    emit: () => Promise.resolve(),
    emitLive: (event): void => {
      liveEvents.push(event.type);
    },
    activeTurns: createActiveTurns(),
    claimChat: noClaim,
  });
  const gate = held.hold(/delete from "chats"/i);
  const deleting = life.delete({ principal: principal(hostId), chatId: room.id }).catch((error: unknown) => error);
  await gate.reached;
  const parent: GenerationObservationParent = {
    chatId: room.id,
    turnId: castId<ChatTurnId>(ids.next(ID_PREFIX.chatTurn)),
    sourceMessageId: null,
    sourceVariantId: null,
  };
  const leg = generationUsageLegSchema.parse({
    ...makeGenerationUsage(0.125, { tokensIn: 70, tokensOut: 2048 }),
    model: testModelId("gemini-3.1-pro-preview"),
    provider: testProviderId("google"),
    wire: "google-generative-ai",
    observedAt: OBSERVED_AT,
    contextWindow: null,
    maxOutputTokens: null,
    modelCalls: 1,
    durationApiMs: null,
    ttftMs: null,
    finishReason: "length",
    stopReason: "MAX_TOKENS",
    terminalReason: null,
    generationId: null,
  });
  expect(await appendGenerationObservation(ctx, parent, { ordinal: 0, funderUserId: funder.id, connectionId: null, leg })).toBe(true);
  gate.release();
  const failure = await deleting;
  expect(failure).toBeInstanceOf(ChatOperationError);
  expect(failure).toMatchObject({ code: CHAT_OP_CODES.aborted });
  expect(await db.select().from(chats).where(eq(chats.id, room.id))).toHaveLength(1);
  expect(await db.select().from(chatGenerationObservations)).toHaveLength(1);
  expect(await db.select().from(ownerStats).where(eq(ownerStats.ownerId, funder.id))).toMatchObject([
    { tokensIn: 70, tokensOut: 2048, costUsd: 0.125, costSamples: 1 },
  ]);
  expect(liveEvents).toEqual([]);
});

test("actual chat deletion reverses every pending funder in its original bucket without retaining deleted execution history", async ({ db, ids }) => {
  const funder = await seedUser(db);
  const secondFunder = await seedUser(db);
  const room = await seedChat(db, { withHost: true });
  const hostId = room.hostUserId;
  if (hostId === undefined) {
    throw new Error("The owned-room fixture requires a host");
  }
  const ctx = { db, now: () => OBSERVED_AT + 2 * 86_400_000, applyStatsDelta };
  const parent: GenerationObservationParent = {
    chatId: room.id,
    turnId: castId<ChatTurnId>(ids.next(ID_PREFIX.chatTurn)),
    sourceMessageId: null,
    sourceVariantId: null,
  };
  const common = {
    model: testModelId("gemini-3.1-pro-preview"),
    provider: testProviderId("google"),
    wire: "google-generative-ai",
    contextWindow: null,
    maxOutputTokens: null,
    modelCalls: 1,
    durationApiMs: null,
    ttftMs: null,
    finishReason: "length",
    stopReason: "MAX_TOKENS",
    terminalReason: null,
    generationId: null,
  };
  const first = generationUsageLegSchema.parse({ ...common, ...makeGenerationUsage(0.125, { tokensIn: 70, tokensOut: 2048 }), observedAt: OBSERVED_AT });
  const second = generationUsageLegSchema.parse({
    ...common,
    ...makeGenerationUsage(0.25, { tokensIn: 30, tokensOut: null }),
    observedAt: OBSERVED_AT + 86_400_000,
  });
  expect(await appendGenerationObservation(ctx, parent, { ordinal: 0, funderUserId: funder.id, connectionId: null, leg: first })).toBe(true);
  expect(await appendGenerationObservation(ctx, parent, { ordinal: 1, funderUserId: secondFunder.id, connectionId: null, leg: second })).toBe(true);
  const liveEvents: string[] = [];
  const life = createChatLifecycle(
    makeChatContext(db, {
      now: ctx.now,
      applyStatsDelta: (batch, opDb, delta) => applyStatsDelta(batch as BatchStmt[], opDb, delta),
    }),
    {
      emit: () => Promise.resolve(),
      emitLive: (event): void => {
        liveEvents.push(event.type);
      },
      activeTurns: createActiveTurns(),
      claimChat: noClaim,
    },
  );
  await life.delete({ principal: principal(hostId), chatId: room.id });
  expect(liveEvents).toEqual(["chatDeleted"]);
  expect(await db.select().from(chatGenerationObservations)).toEqual([]);
  expect(await db.select().from(ownerStats).where(eq(ownerStats.ownerId, funder.id))).toMatchObject([
    { tokensIn: 0, tokensOut: 0, costUsd: 0, costSamples: 0, assistantTurns: 0 },
  ]);
  expect(await db.select().from(ownerStats).where(eq(ownerStats.ownerId, secondFunder.id))).toMatchObject([
    { tokensIn: 0, tokensOut: 0, costUsd: 0, costSamples: 0, assistantTurns: 0 },
  ]);
  expect(await db.select().from(dailyStats).where(eq(dailyStats.ownerId, funder.id))).toMatchObject([
    { bucketStart: statsBucketStart(OBSERVED_AT), tokensIn: 0, tokensOut: 0, costUsd: 0, costSamples: 0 },
  ]);
  expect(await db.select().from(dailyStats).where(eq(dailyStats.ownerId, secondFunder.id))).toMatchObject([
    { bucketStart: statsBucketStart(OBSERVED_AT + 86_400_000), tokensIn: 0, tokensOut: 0, costUsd: 0, costSamples: 0 },
  ]);
});

test("a retained refused completion rebuilds actual funding usage without inventing a transcript generation", async ({ db, ids }) => {
  const funder = await seedUser(db);
  const room = await seedChat(db, { withHost: true });
  await db.insert(chatGenerationObservations).values({
    chatId: room.id,
    turnId: castId<ChatTurnId>(ids.next(ID_PREFIX.chatTurn)),
    ordinal: 0,
    funderUserId: funder.id,
    connectionAttributionProvenance: "unrecorded",
    model: testModelId("gemini-3.1-pro-preview"),
    servedModel: "gemini-3.1-pro-preview-served",
    provider: testProviderId("google"),
    wire: "google-generative-ai",
    tokensIn: 70,
    tokensOut: 2048,
    reasoningTokens: 2048,
    cacheReadTokens: null,
    cacheWriteTokens: 0,
    costUsd: 0.125,
    costProvenance: "estimated",
    costDetails: { totalUsd: 0.125 },
    finishReason: "length",
    stopReason: "MAX_TOKENS",
    modelCalls: 1,
    observedAt: OBSERVED_AT,
  });
  await reconcileStats(db, { now: () => OBSERVED_AT + 86_400_000 });
  expect(await db.select().from(ownerStats).where(eq(ownerStats.ownerId, funder.id))).toMatchObject([
    { tokensIn: 70, tokensOut: 2048, costUsd: 0.125, costSamples: 1, assistantTurns: 0, assistantWords: 0, genSamples: 0 },
  ]);
  expect(await db.select().from(modelStats).where(eq(modelStats.ownerId, funder.id))).toMatchObject([
    { generations: 0, genSamples: 0, tokensIn: 70, tokensOut: 2048, costUsd: 0.125, tokensOutMeasuredSamples: 1 },
  ]);
  await db.delete(chats).where(eq(chats.id, room.id));
  expect(await db.select().from(chatGenerationObservations)).toEqual([]);
  await reconcileStats(db, { now: () => OBSERVED_AT + 86_400_000 });
  expect(await db.select().from(ownerStats).where(eq(ownerStats.ownerId, funder.id))).toMatchObject([{ tokensIn: 0, tokensOut: 0, costUsd: 0 }]);
});

test("append fences a deleted source and a foreign source without orphan facts or counters", async ({ db, ids }) => {
  const funder = await seedUser(db);
  const room = await seedChat(db);
  const foreign = await seedMessage(db);
  const source = await seedMessage(db, { chatId: room.id });
  const ctx = { db, now: () => OBSERVED_AT, applyStatsDelta };
  const parent: GenerationObservationParent = {
    chatId: room.id,
    turnId: castId<ChatTurnId>(ids.next(ID_PREFIX.chatTurn)),
    sourceMessageId: source.id,
    sourceVariantId: source.variantId,
  };
  const leg = generationUsageLegSchema.parse({
    ...makeGenerationUsage(0.125),
    model: testModelId("gemini-3.1-pro-preview"),
    provider: testProviderId("google"),
    wire: "google-generative-ai",
    observedAt: OBSERVED_AT,
    contextWindow: null,
    maxOutputTokens: null,
    modelCalls: 1,
    durationApiMs: null,
    ttftMs: null,
    finishReason: "length",
    stopReason: "MAX_TOKENS",
    terminalReason: null,
    generationId: null,
  });
  const fact = { ordinal: 0, funderUserId: funder.id, connectionId: null, leg };
  expect(await appendGenerationObservation(ctx, { ...parent, sourceMessageId: foreign.id, sourceVariantId: foreign.variantId }, fact)).toBe(false);
  await db.delete(messages).where(eq(messages.id, source.id));
  expect(await appendGenerationObservation(ctx, parent, fact)).toBe(false);
  expect(await db.select().from(chatGenerationObservations)).toEqual([]);
  expect(await db.select().from(ownerStats).where(eq(ownerStats.ownerId, funder.id))).toEqual([]);
});

test("already transferred facts refuse a stale batch before all economic inverses and later writes", async ({ db, ids }) => {
  const funder = await seedUser(db);
  const room = await seedChat(db);
  const ctx = { db, now: () => OBSERVED_AT + 86_400_000, applyStatsDelta };
  const parent: GenerationObservationParent = {
    chatId: room.id,
    turnId: castId<ChatTurnId>(ids.next(ID_PREFIX.chatTurn)),
    sourceMessageId: null,
    sourceVariantId: null,
  };
  const leg = generationUsageLegSchema.parse({
    ...makeGenerationUsage(0.125, { tokensIn: 70, tokensOut: 2048 }),
    model: testModelId("gemini-3.1-pro-preview"),
    provider: testProviderId("google"),
    wire: "google-generative-ai",
    observedAt: OBSERVED_AT,
    contextWindow: null,
    maxOutputTokens: null,
    modelCalls: 1,
    durationApiMs: null,
    ttftMs: null,
    finishReason: "length",
    stopReason: "MAX_TOKENS",
    terminalReason: null,
    generationId: null,
  });
  expect(await appendGenerationObservation(ctx, parent, { ordinal: 0, funderUserId: funder.id, connectionId: null, leg })).toBe(true);
  const facts = await loadGenerationObservations(ctx, parent);
  await db.batch(batchMany(generationObservationTransferStatements(ctx, parent, facts)));
  const afterFirst = await db.select().from(ownerStats).where(eq(ownerStats.ownerId, funder.id));
  expect(afterFirst).toMatchObject([{ tokensIn: 0, tokensOut: 0, costUsd: 0, costSamples: 0 }]);
  await expect(
    db.batch(
      batchMany([
        ...generationObservationTransferStatements(ctx, parent, facts),
        batchStmt(db.update(chats).set({ title: "must not land" }).where(eq(chats.id, room.id))),
      ]),
    ),
  ).rejects.toThrow();
  expect(await db.select().from(ownerStats).where(eq(ownerStats.ownerId, funder.id))).toEqual(afterFirst);
  expect(await db.select().from(chats)).toMatchObject([{ id: room.id, title: null, createdAt: room.createdAt, updatedAt: room.updatedAt }]);
  expect(await db.select().from(chatGenerationObservations)).toEqual([]);
});

test("an unrelated later NOTNULL remains the original failure even when the source predicate changes after rollback", async ({ db, ids }) => {
  const funder = await seedUser(db);
  const room = await seedChat(db);
  const source = await seedMessage(db, { chatId: room.id, seq: 1, role: "assistant", content: "Before" });
  const [variant] = await db.select().from(messageVariants).where(eq(messageVariants.messageId, source.id));
  assert(variant !== undefined);
  const parent = { chatId: room.id, turnId: castId<ChatTurnId>(ids.next(ID_PREFIX.chatTurn)), sourceMessageId: source.id, sourceVariantId: variant.id };
  const ctx = { db, now: () => OBSERVED_AT, applyStatsDelta };
  await appendGenerationObservation(ctx, parent, { ordinal: 0, funderUserId: funder.id, connectionId: null, leg: paidLegOf(OBSERVED_AT, 0.125) });
  const session = createGenerationObservationSession(ctx, parent);
  const facts = await session.load();
  const predicate = sql`exists (select 1 from ${messageVariants} where ${messageVariants.id} = ${variant.id} and ${messageVariants.content} = 'Before')`;
  const statements = [
    generationObservationFenceStatement(ctx, parent, facts, predicate),
    batchStmt(db.insert(users).values({ id: newId<UserId>(), handle: sql`null`, handleKey: castId<HandleKey>("late_constraint") })),
  ];
  const batch = db.batch.bind(db);
  let original: unknown;
  const race = vi.spyOn(db, "batch").mockImplementationOnce(async (items): Promise<Awaited<ReturnType<typeof db.batch>>> => {
    try {
      return await batch(items);
    } catch (error) {
      original = error;
      await db.update(messageVariants).set({ content: "After" }).where(eq(messageVariants.id, variant.id));
      throw error;
    }
  });
  try {
    const failure = await session.commit(statements, facts, predicate).catch((error: unknown) => error);
    expect(failure).toBe(original);
    expect(await session.load()).toEqual(facts);
    expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, funder.id)))[0]?.costUsd).toBe(0.125);
  } finally {
    race.mockRestore();
  }
});
