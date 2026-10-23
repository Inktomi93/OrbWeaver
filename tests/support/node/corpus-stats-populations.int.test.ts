// @subject tests/support/node/factories/stats.ts
// @subject packages/server/src/domain/stats/persistence/latency.ts
// @subject packages/server/src/domain/stats/persistence/messages-economics.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { parseVariantMetadata } from "@orb/contracts/chat";
import { characterStatsViewSchema, latencyStatsSchema, modelStatRowSchema, ownerStatsViewSchema } from "@orb/contracts/stats";
import { createFrozenClock } from "../iso/clock.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "./corpus-provider.ts";
import { seedCorpusActors } from "./corpus-seed.ts";
import { seedUserConnection } from "./factories/connection.ts";
import { captureStatsPopulations } from "./factories/stats.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

const PRICED_MODEL = "stats-priced-native";
const UNPRICED_MODEL = "stats-unpriced-native";

test("native selected latency and economics separate model populations, retained swipe tokens and unstarted greetings", async () => {
  const clock = createFrozenClock();
  let pricedRequests = 0;
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL, PRICED_MODEL, UNPRICED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    chatText: "The native accountant preserves the selected witness.",
    images: [],
    usage: { promptTokens: 40, completionTokens: 15 },
    completion: (request) => {
      if (request.includes(JSON.stringify(PRICED_MODEL))) {
        pricedRequests += 1;
        clock.advance(pricedRequests === 1 ? 11 : 37);
        return {
          text: "The priced keeper preserves this take.",
          toolCalls: [],
          usage: { promptTokens: 40 * pricedRequests, completionTokens: 15 * pricedRequests },
        };
      }
      if (request.includes(JSON.stringify(UNPRICED_MODEL))) {
        clock.advance(83);
        return { text: "The unpriced keeper preserves this take.", toolCalls: [], usage: { promptTokens: 9, completionTokens: 3 } };
      }
      throw new Error("unscripted stats population completion");
    },
  });
  await using root = await createServerHarness({ providerFetch: wire.execute, clock });
  await seedCorpusActors(root);
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const pricedConnection = await seedUserConnection(root, {
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: PRICED_MODEL,
    declared: {
      kind: "generation",
      generation: { input: ["text"], context: { window: 32_000 } },
      features: { detectServer: false, pricing: { inputPerMTok: 2, outputPerMTok: 4 } },
    },
  });
  const unpricedConnection = await seedUserConnection(root, {
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: UNPRICED_MODEL,
    declared: { kind: "generation", generation: { input: ["text"], context: { window: 32_000 } }, features: { detectServer: false } },
  });
  const priced = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "stats-priced", name: "Priced keeper", description: "The keeper retains priced observations." }),
  });
  const unpriced = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "stats-unpriced", name: "Unpriced keeper", description: "The keeper retains unpriced observations." }),
  });
  const husk = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "stats-unstarted",
      name: "Unstarted keeper",
      description: "The keeper has only a founding greeting.",
      greetings: [{ text: "This greeting was never claimed." }],
    }),
  });
  const pricedRoom = await caller.chat.startChat({ characterIds: [priced.id], opening: "none" });
  const unpricedRoom = await caller.chat.startChat({ characterIds: [unpriced.id], opening: "none" });
  const huskRoom = await caller.chat.startChat({ characterIds: [husk.id], opening: "first-message" });
  await caller.connection.setBinding({ task: "chat", connectionId: pricedConnection.id });
  const first = await root.services.chat.send({ principal, chatId: pricedRoom.chat.id, content: "Keep the priced observation." });
  const assistant = first.messages.find((message) => message.role === "assistant");
  expect(first.aborted).toBe(false);
  if (assistant === undefined) {
    throw new Error("native priced generation did not persist an assistant slot");
  }
  expect((await root.services.chat.swipe({ principal, chatId: pricedRoom.chat.id, messageId: assistant.id })).aborted).toBe(false);
  await caller.connection.setBinding({ task: "chat", connectionId: unpricedConnection.id });
  expect((await root.services.chat.send({ principal, chatId: unpricedRoom.chat.id, content: "Keep the unpriced observation." })).aborted).toBe(false);
  await root.settleBackground();
  const capture = await captureStatsPopulations(root, root.ownerId, {
    chatIds: [pricedRoom.chat.id, unpricedRoom.chat.id, huskRoom.chat.id],
    characterIds: [priced.id, unpriced.id, husk.id],
  });
  expect(ownerStatsViewSchema.parse(capture.overview)).toMatchObject({ chats: 2, userTurns: 2, assistantTurns: 2, swipes: 1 });
  const pricedVariants = capture.variants.filter((variant) => variant.model === PRICED_MODEL);
  expect(pricedVariants).toHaveLength(2);
  for (const variant of pricedVariants) {
    expect(variant.costProvenance).toBe("estimated");
    expect(variant.costUsd).toBeGreaterThan(0);
    expect(parseVariantMetadata(variant.metadata).usageLegs).toMatchObject([{ model: PRICED_MODEL, costProvenance: "estimated" }]);
  }
  const selected = capture.messages.find((message) => message.id === assistant.id)?.selectedVariantId;
  const pricedSelected = pricedVariants.find((variant) => variant.id === selected);
  const unpricedSelected = capture.variants.find((variant) => variant.model === UNPRICED_MODEL);
  if (pricedSelected === undefined || unpricedSelected === undefined) {
    throw new Error("native selected model witnesses are missing");
  }
  expect(unpricedSelected).toMatchObject({ costUsd: null, costProvenance: "unrecorded", tokensIn: 9, tokensOut: 3 });
  expect(capture.economics.find((row) => row.characterId === priced.id)).toMatchObject({
    generations: 1,
    tokensIn: 80,
    tokensOut: 30,
    costUsd: pricedSelected.costUsd,
  });
  expect(capture.economics.find((row) => row.characterId === unpriced.id)).toMatchObject({ generations: 1, costUsd: null });
  expect(capture.modelEconomics.find((row) => row.characterId === priced.id)).toMatchObject({
    model: PRICED_MODEL,
    generations: 1,
    costUsd: pricedSelected.costUsd,
  });
  expect(capture.modelEconomics.find((row) => row.characterId === unpriced.id)).toMatchObject({ model: UNPRICED_MODEL, generations: 1, costUsd: null });
  expect(pricedRequests).toBe(2);
  expect(pricedSelected).toMatchObject({ tokensIn: 80, tokensOut: 30 });
  expect(capture.overview).toMatchObject({ tokensIn: 129, tokensOut: 48 });
  expect(capture.overview?.costUsd).toBe(pricedSelected.costUsd);
  expect(capture.characters[0]?.costUsd).toBe(pricedSelected.costUsd);
  expect(capture.models.find((model) => model.model === PRICED_MODEL)).toMatchObject({
    generations: 2,
    charactersUsedWith: 1,
    tokensIn: 120,
    tokensOut: 45,
    costUsd: pricedSelected.costUsd,
  });
  expect(capture.models.find((model) => model.model === UNPRICED_MODEL)).toMatchObject({ generations: 1, charactersUsedWith: 1, costUsd: null });
  for (const [index, variant] of [pricedSelected, unpricedSelected].entries()) {
    if (variant.genStartedAt === null || variant.genFinishedAt === null || variant.ttftMs === null) {
      throw new Error("native selected generation did not record actual timing");
    }
    const duration = variant.genFinishedAt - variant.genStartedAt;
    expect(latencyStatsSchema.parse(capture.latency[index])).toEqual({
      avgGenMs: duration,
      p50GenMs: duration,
      p90GenMs: duration,
      avgTtftMs: variant.ttftMs,
      p50TtftMs: variant.ttftMs,
      p90TtftMs: variant.ttftMs,
    });
    expect(characterStatsViewSchema.parse(capture.characters[index])).toMatchObject({ avgGenMs: duration, avgTtftMs: variant.ttftMs });
    expect(modelStatRowSchema.parse(capture.models.find((model) => model.model === variant.model))).toMatchObject({
      avgGenMs: duration,
      avgTtftMs: variant.ttftMs,
    });
  }
  expect(capture.latency[0]?.avgGenMs).not.toBe(capture.latency[1]?.avgGenMs);
  expect(capture.ownerLatency.avgGenMs).toBe(((capture.latency[0]?.avgGenMs ?? 0) + (capture.latency[1]?.avgGenMs ?? 0)) / 2);
  expect(capture.ownerLatency.avgTtftMs).toBe(((capture.latency[0]?.avgTtftMs ?? 0) + (capture.latency[1]?.avgTtftMs ?? 0)) / 2);
  expect(capture.overview).toMatchObject({ avgGenMs: capture.ownerLatency.avgGenMs, avgTtftMs: capture.ownerLatency.avgTtftMs });
  const greeting = capture.messages.find((message) => message.chatId === huskRoom.chat.id);
  expect(huskRoom.opening?.messages).toHaveLength(1);
  expect(capture.chats.find((chat) => chat.id === huskRoom.chat.id)?.startedAt).toBeNull();
  expect(greeting?.role).toBe("assistant");
  expect(capture.variants.find((variant) => variant.id === greeting?.selectedVariantId)).toMatchObject({
    model: null,
    costUsd: null,
    genStartedAt: null,
    genFinishedAt: null,
    ttftMs: null,
  });
  expect(capture.characters[2]).toBeNull();
  expect(capture.rows.characters.map((row) => row.characterId)).not.toContain(husk.id);
  expect(Object.values(capture.latency[2] ?? {})).toEqual(Array.from({ length: 6 }, () => null));
  expect(capture.economics.map((row) => row.characterId)).not.toContain(husk.id);
  expect(capture.modelEconomics.map((row) => row.characterId)).not.toContain(husk.id);
  expect(capture.rows.daily.map((row) => row.assistantTurns)).toEqual([2]);
});
