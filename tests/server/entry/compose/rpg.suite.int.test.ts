import "../../../support/composed-real.ts";
import assert from "node:assert/strict";
import type { Principal } from "@orb/contracts/identity";
import type { ChatApi } from "@orb/contracts/inference";
import { generationUsageLegSchema } from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import { characterStats, chatGenerationObservations, messages, messageVariants, ownerStats, userConnections } from "@orb/db";
import type { ChatResult, ProviderExecutor, Resolved } from "@orb/inference";
import { GenerationObservationPersistenceError, ProviderError } from "@orb/inference";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createResolveViewerVisibility } from "@orb/server/domain/chat";
import { reconcileStats } from "@orb/server/domain/stats";
import type { ServicesResult } from "@orb/server/entry/compose";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import { observeChatResult } from "../../../../packages/inference/src/backends/kit/generation-observation.ts";
import { buildRpg } from "../../../../packages/server/src/entry/compose/rpg.ts";
import { makeGenerationUsage } from "../../../support/factories/generation-usage.ts";
import { makeCapability, makeGenerationCapability, makeResolved } from "../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { FROZEN_AT, seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "../../domain/chat/_support.ts";

function principalOf(userId: UserId): Principal {
  return { userId, role: "user", handle: castId("host"), externalId: null, via: "header" };
}

function connectionFor(api: ChatApi, ownerId: UserId): Resolved<"chat"> {
  return makeResolved({
    api,
    ownerId,
    providerId: api === "agent-sdk" ? "claude-sub" : "custom-openai",
    capability: makeCapability(
      makeGenerationCapability({
        output: { maxTokens: { min: 1, max: 4096 }, structured: true, modalities: ["text"] },
        tools: { parallel: true },
      }),
    ),
  });
}

function failingRound(args: {
  readonly app: ServicesResult;
  readonly db: Db;
  readonly api: ChatApi;
  readonly hostId: UserId;
  readonly failure: Error;
  readonly called: () => void;
  readonly run?: ProviderExecutor["runChatTurn"];
}): ReturnType<typeof buildRpg> {
  return buildRpg({
    db: args.db,
    now: () => FROZEN_AT,
    rpgChatOps: args.app.chatRpgOps,
    resolveViewerVisibility: createResolveViewerVisibility({ db: args.db }),
    connection: { resolve: () => Promise.resolve({ resolved: connectionFor(args.api, args.hostId), warnings: [] }) },
    executor: {
      runChatTurn: (request) => {
        args.called();
        return args.run === undefined ? Promise.reject(args.failure) : args.run(request);
      },
    },
    resolveHostPrincipal: (userId) => Promise.resolve(principalOf(userId)),
    resolvePresetOwned: () => Promise.resolve(false),
    copyPresetToUser: () => Promise.resolve(null),
    toolUse: { register: () => undefined },
    character: {
      create: () => Promise.reject(new Error("unexpected character creation")),
      findByHandle: () => Promise.resolve(null),
      findByImportHash: () => Promise.resolve(null),
    },
    chat: { addCharacterToChat: () => Promise.reject(new Error("unexpected participant insertion")) },
  });
}

test.for(["agent-sdk", "chat-completions"] as const)("postcommit %s refuses a durable observation failure without another model purchase", async (api, {
  app,
  db,
}) => {
  const hostId = await seedUser(db, castId<Handle>(`failure_${api}`));
  const chatId = await seedChat(db, `failure_${api}`);
  await seedParticipant(db, { chatId, key: `host_${api}`, userId: hostId, role: "host", joinSeq: 0 });
  const cause = new Error("durable append failed");
  const failure = new GenerationObservationPersistenceError("The completed generation could not be retained.", { cause });
  let calls = 0;
  const rpg = failingRound({
    app,
    db,
    api,
    hostId,
    failure,
    called: () => {
      calls++;
    },
  });
  await rpg.service.createGame({ principal: principalOf(hostId), chatId, mode: "lite" });
  await rpg.service.updateConfig({ principal: principalOf(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They reach the tower." });
  await expect(
    rpg.chatOps.onTurnCompleted(chatId, messageId, variantId, mintTypeId(ID_PREFIX.chatTurn), {
      kind: "send",
      connection: connectionFor(api, hostId),
      transcript: [],
      terminalToolCalls: null,
      terminalToolsCollided: [],
      triggeredBy: hostId,
      signal: undefined,
      prose: {},
    }),
  ).rejects.toBe(failure);
  expect(failure.cause).toBe(cause);
  expect(calls).toBe(1);
});

test("resync completed usage reaches the actual chat-owned sink without inventing a transcript generation", async ({ app, db }) => {
  const hostId = await seedUser(db, castId<Handle>("resync_observed"));
  const chatId = await seedChat(db, "resync_observed");
  await seedParticipant(db, { chatId, key: "resync_observed_host", userId: hostId, role: "host", joinSeq: 0 });
  const characterId = await seedCharacter(db, hostId, "resync_observed_actor");
  await seedParticipant(db, { chatId, key: "resync_observed_actor", characterId, role: "member", joinSeq: 1 });
  await seedMessage(db, chatId, 1, { role: "assistant", characterId, content: "They reach the tower." });
  const connection = connectionFor("chat-completions", hostId);
  await db
    .insert(userConnections)
    .values({ id: connection.connectionId, ownerId: hostId, providerId: connection.providerId, model: connection.model, label: "Chat" });
  let calls = 0;
  const usage = makeGenerationUsage(0.125, { tokensIn: 12, tokensOut: 17 });
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
    usage: { ...usage, model: connection.model, contextWindow: null, maxOutputTokens: null },
    toolCalls: [{ toolCallId: "quiet", name: "no_changes", arguments: "{}" }],
    events: [],
    rateLimit: null,
  };
  const rpg = failingRound({
    app,
    db,
    api: "chat-completions",
    hostId,
    failure: new Error("unexpected failed executor"),
    called: () => {
      calls++;
    },
    run: async (request) => {
      await observeChatResult(request, result);
      return result;
    },
  });
  await rpg.service.createGame({ principal: principalOf(hostId), chatId, mode: "lite" });
  await reconcileStats(db, { ownerId: hostId, now: () => FROZEN_AT });
  await expect(rpg.service.resyncFromStory({ principal: principalOf(hostId), chatId })).resolves.toEqual({ ok: true, rebuilt: false });
  expect(calls).toBe(1);
  const facts = await db.select().from(chatGenerationObservations).where(eq(chatGenerationObservations.chatId, chatId));
  expect(facts).toHaveLength(1);
  expect(facts[0]).toMatchObject({
    ...usage,
    chatId,
    sourceMessageId: null,
    sourceVariantId: null,
    funderUserId: hostId,
    connectionId: connection.connectionId,
    model: connection.model,
    provider: connection.providerId,
    wire: connection.wire,
    modelCalls: 1,
  });
  const live = await db.select().from(ownerStats).where(eq(ownerStats.ownerId, hostId));
  expect(live[0]).toMatchObject({ ownerId: hostId, costUsd: 0.125, costSamples: 1, notionalCostSamples: 0, tokensIn: 12, tokensOut: 17, assistantTurns: 1 });
  await reconcileStats(db, { ownerId: hostId, now: () => FROZEN_AT });
  expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, hostId)))[0]).toMatchObject({
    ownerId: hostId,
    costUsd: 0.125,
    costSamples: 1,
    notionalCostSamples: 0,
    tokensIn: 12,
    tokensOut: 17,
    assistantTurns: 1,
  });
});

test.for([
  { handoff: false, multiOwner: false, copy: false },
  { handoff: true, multiOwner: false, copy: false },
  { handoff: true, multiOwner: true, copy: false },
  { handoff: true, multiOwner: false, copy: true },
])("postcommit completion preserves canon ownership across handoff $handoff/multi-owner $multiOwner/copy $copy and removes its pending money home", async ({
  handoff,
  multiOwner,
  copy,
}, { app, db }) => {
  const incomingHasCanon = copy || multiOwner;
  const hostId = await seedUser(db, castId<Handle>("post_observed"));
  const incomingId = await seedUser(db, castId<Handle>("post_incoming"));
  const chatId = await seedChat(db, "post_observed", { id: mintTypeId(ID_PREFIX.chat) });
  await seedParticipant(db, { chatId, key: "post_observed_host", userId: hostId, role: "host", joinSeq: 0 });
  await seedParticipant(db, { chatId, key: "post_incoming", userId: incomingId, role: "member", joinSeq: 2 });
  const characterId = await seedCharacter(db, hostId, "post_observed_actor", { id: mintTypeId(ID_PREFIX.character) });
  await seedParticipant(db, { chatId, key: "post_observed_actor", characterId, role: "member", joinSeq: 1 });
  if (multiOwner) {
    const other = await seedCharacter(db, incomingId, "post_incoming_actor");
    const duplicate = await seedCharacter(db, hostId, "post_duplicate_actor");
    await seedParticipant(db, { chatId, key: "post_incoming_actor", characterId: other, role: "member", joinSeq: 3 });
    await seedParticipant(db, { chatId, key: "post_duplicate_actor", characterId: duplicate, role: "member", joinSeq: 4 });
  }
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", characterId, content: "They reach the tower." });
  const baseUsage = makeGenerationUsage(0.25, { tokensIn: 10, tokensOut: 20, costProvenance: "estimated", costDetails: null });
  const baseLeg = generationUsageLegSchema.parse({
    ...baseUsage,
    model: "sdk-model",
    provider: "claude-sub",
    wire: "agent-sdk",
    observedAt: FROZEN_AT,
    contextWindow: null,
    maxOutputTokens: null,
    modelCalls: 2,
    durationApiMs: 10,
    ttftMs: null,
    finishReason: "stop",
    stopReason: "end_turn",
    terminalReason: null,
    generationId: null,
  });
  await db
    .update(messageVariants)
    .set({ ...baseUsage, tokenProvenance: "measured", model: baseLeg.model, provider: baseLeg.provider, metadata: { usageLegs: [baseLeg] } })
    .where(eq(messageVariants.id, variantId));
  const connection = connectionFor("chat-completions", hostId);
  await db
    .insert(userConnections)
    .values({ id: connection.connectionId, ownerId: hostId, providerId: connection.providerId, model: connection.model, label: "Chat" });
  const usage = makeGenerationUsage(0.125, { tokensIn: 12, tokensOut: 17 });
  let calls = 0;
  const entered = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  const rpg = failingRound({
    app,
    db,
    api: "chat-completions",
    hostId,
    failure: new Error("unexpected failed executor"),
    called: () => {
      calls++;
    },
    run: async (request) => {
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
        usage: { ...usage, model: connection.model, contextWindow: null, maxOutputTokens: null },
        toolCalls: [{ toolCallId: "quiet", name: "no_changes", arguments: "{}" }],
        events: [],
        rateLimit: null,
      };
      entered.resolve();
      await released.promise;
      await observeChatResult(request, result);
      return result;
    },
  });
  await rpg.service.createGame({ principal: principalOf(hostId), chatId, mode: "lite" });
  await rpg.service.updateConfig({ principal: principalOf(hostId), chatId, extractionMode: "cheap" });
  await reconcileStats(db, { ownerId: hostId, now: () => FROZEN_AT });
  if (multiOwner) {
    await reconcileStats(db, { ownerId: incomingId, now: () => FROZEN_AT });
  }
  const completion = rpg.chatOps.onTurnCompleted(chatId, messageId, variantId, mintTypeId(ID_PREFIX.chatTurn), {
    kind: "send",
    connection,
    transcript: [],
    terminalToolCalls: null,
    terminalToolsCollided: [],
    triggeredBy: hostId,
    signal: undefined,
    prose: {},
  });
  await entered.promise;
  try {
    if (handoff) {
      await app.services.chat.nominateHostHandoff({
        principal: principalOf(hostId),
        chatId,
        userId: incomingId,
        offer: { copyCharacters: copy, copyGmPreset: false },
      });
      await app.services.chat.acceptHostHandoff({ principal: principalOf(incomingId), chatId });
    }
    const beforeCompletion = await db.select().from(ownerStats);
    expect(beforeCompletion.find((row) => row.ownerId === hostId)?.costUsd ?? 0).toBe(copy ? 0 : 0.25);
    expect(beforeCompletion.find((row) => row.ownerId === incomingId)?.costUsd ?? 0).toBe(incomingHasCanon ? 0.25 : 0);
  } finally {
    released.resolve();
    await completion;
  }
  expect(calls).toBe(1);
  const target = (await db.select().from(messageVariants).where(eq(messageVariants.id, variantId)))[0];
  expect(target?.metadata?.usageLegs).toHaveLength(2);
  expect(target?.metadata?.usageLegs?.[0]).toEqual(baseLeg);
  expect(target?.metadata?.usageLegs?.[1]).toMatchObject({ ...usage, model: connection.model, provider: connection.providerId, wire: connection.wire });
  expect(target).toMatchObject({ tokensIn: 22, tokensOut: 37, costUsd: null, costProvenance: "unrecorded", costDetails: null });
  expect(await db.select().from(chatGenerationObservations).where(eq(chatGenerationObservations.chatId, chatId))).toEqual([]);
  const economicOwnerId = copy ? incomingId : hostId;
  const voiceId = (await db.select().from(messages).where(eq(messages.id, messageId)))[0]?.characterId;
  expect(voiceId).not.toBeNull();
  const expected = { ownerId: economicOwnerId, costUsd: 0.375, costSamples: 2, notionalCostSamples: 1, tokensIn: 22, tokensOut: 37, assistantTurns: 1 };
  expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, economicOwnerId)))[0]).toMatchObject(expected);
  await reconcileStats(db, { ownerId: hostId, now: () => FROZEN_AT });
  expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, economicOwnerId)))[0]).toMatchObject(expected);
  expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, incomingId)))[0]?.costUsd ?? 0).toBe(incomingHasCanon ? 0.375 : 0);
  expect(
    (
      await db
        .select()
        .from(characterStats)
        .where(eq(characterStats.characterId, voiceId ?? characterId))
    )[0],
  ).toMatchObject({
    costUsd: 0.375,
    costSamples: 2,
    tokensIn: 22,
    tokensOut: 37,
    assistantTurns: 1,
  });
  await reconcileStats(db, { ownerId: incomingId, now: () => FROZEN_AT });
  expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, incomingId)))[0]?.costUsd).toBe(incomingHasCanon ? 0.375 : 0);
  expect(
    (
      await db
        .select()
        .from(characterStats)
        .where(eq(characterStats.characterId, voiceId ?? characterId))
    )[0],
  ).toMatchObject({
    costUsd: 0.375,
    costSamples: 2,
    tokensIn: 22,
    tokensOut: 37,
    assistantTurns: 1,
  });
});

test.for(["agent-sdk", "chat-completions"] as const)("resync %s still returns an ordinary provider failure as data", async (api, { app, db }) => {
  const hostId = await seedUser(db, castId<Handle>(`provider_failure_${api}`));
  const chatId = await seedChat(db, `provider_failure_${api}`);
  await seedParticipant(db, { chatId, key: `provider_host_${api}`, userId: hostId, role: "host", joinSeq: 0 });
  const failure = new ProviderError({ kind: "refused", retryable: false, message: "fixture provider refusal" });
  let calls = 0;
  const rpg = failingRound({
    app,
    db,
    api,
    hostId,
    failure,
    called: () => {
      calls++;
    },
  });
  await rpg.service.createGame({ principal: principalOf(hostId), chatId, mode: "lite" });
  await seedMessage(db, chatId, 1, { role: "assistant", content: "They reach the tower." });
  await expect(rpg.service.resyncFromStory({ principal: principalOf(hostId), chatId })).resolves.toEqual({
    ok: false,
    reason: "the model call failed, so nothing was rebuilt: fixture provider refusal",
  });
  expect(calls).toBe(1);
});

test.for([
  "agent-sdk",
  "chat-completions",
] as const)("resync %s refuses a durable observation failure instead of errors-as-data or a second purchase", async (api, { app, db }) => {
  const hostId = await seedUser(db, castId<Handle>(`resync_failure_${api}`));
  const chatId = await seedChat(db, `resync_failure_${api}`);
  await seedParticipant(db, { chatId, key: `resync_host_${api}`, userId: hostId, role: "host", joinSeq: 0 });
  const cause = new Error("durable append failed");
  const failure = new GenerationObservationPersistenceError("The completed generation could not be retained.", { cause });
  let calls = 0;
  const rpg = failingRound({
    app,
    db,
    api,
    hostId,
    failure,
    called: () => {
      calls++;
    },
  });
  await rpg.service.createGame({ principal: principalOf(hostId), chatId, mode: "lite" });
  await seedMessage(db, chatId, 1, { role: "assistant", content: "They reach the tower." });
  await expect(rpg.service.resyncFromStory({ principal: principalOf(hostId), chatId })).rejects.toBe(failure);
  expect(failure.cause).toBe(cause);
  expect(calls).toBe(1);
});

test.for(["agent-sdk", "chat-completions"] as const)("postcommit %s preserves a producer normalization failure and cannot buy a fallback", async (api, {
  app,
  db,
}) => {
  const hostId = await seedUser(db, castId<Handle>(`invalid_normalization_${api}`));
  const chatId = await seedChat(db, `invalid_normalization_${api}`);
  await seedParticipant(db, { chatId, key: `normalization_host_${api}`, userId: hostId, role: "host" });
  const connection = connectionFor(api, hostId);
  await db
    .insert(userConnections)
    .values({ id: connection.connectionId, ownerId: hostId, providerId: connection.providerId, model: connection.model, label: "Fixture" });
  let calls = 0;
  let captured: unknown;
  const rpg = failingRound({
    app,
    db,
    api,
    hostId,
    failure: new Error("unexpected provider failure"),
    called: () => {
      calls += 1;
    },
    run: async (request) => {
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
        events: [],
        rateLimit: null,
        usage: {
          ...makeGenerationUsage(null, { tokensIn: 12, tokensOut: 17 }),
          costUsd: -1,
          costProvenance: "measured",
          model: connection.model,
          contextWindow: null,
          maxOutputTokens: null,
        },
      };
      try {
        await observeChatResult(request, result);
      } catch (error) {
        captured = error;
        throw error;
      }
      return result;
    },
  });
  await rpg.service.createGame({ principal: principalOf(hostId), chatId, mode: "lite" });
  await rpg.service.updateConfig({ principal: principalOf(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They reach the tower." });
  const attempt = rpg.chatOps.onTurnCompleted(chatId, messageId, variantId, mintTypeId(ID_PREFIX.chatTurn), {
    kind: "send",
    connection,
    transcript: [],
    terminalToolCalls: null,
    terminalToolsCollided: [],
    triggeredBy: hostId,
    signal: undefined,
    prose: {},
  });
  const failure = await attempt.catch((error: unknown) => error);
  assert(failure instanceof GenerationObservationPersistenceError);
  expect(failure).toBe(captured);
  assert(failure.cause instanceof ZodError);
  expect(failure.cause.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: ["costUsd"], code: "too_small" })]));
  expect(calls).toBe(1);
  expect(await db.select().from(chatGenerationObservations).where(eq(chatGenerationObservations.chatId, chatId))).toEqual([]);
});
