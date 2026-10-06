import type { GenerationUsageLeg } from "@orb/contracts/inference";
import { generationUsageLegSchema } from "@orb/contracts/inference";
import type { CharacterId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { statsBucketStart } from "@orb/kit/stats-tally";
import type { MessageRow } from "../../../../../packages/server/src/domain/stats/contract/rebuild-from-canon.ts";
import {
  buildChatMeta,
  buildOwnerRows,
  createOwnerAccums,
  foldCanonMessage,
  foldCanonSwipe,
  ownerExtrema,
} from "../../../../../packages/server/src/domain/stats/substrate/rebuild-rollups.ts";
import { makeUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId, testProviderId } from "../../../../support/inference-identities.ts";

function message(cid: string, now: number, mid: string): MessageRow {
  return {
    mid,
    cid,
    role: "assistant",
    createdAt: now,
    chatCreatedAt: now,
    content: "kept reply",
    ti: 999,
    tout: 999,
    tokenProvenance: "measured",
    gs: now,
    gf: now + 100,
    model: "second-model",
    provider: "google",
    reasoning: null,
    reasoningDur: null,
    cost: 999,
    cacheR: 999,
    cacheW: 999,
    ctx: 2000,
    selectedIdx: 1,
    variantCount: 2,
    usageLegs: null,
    metadata: null,
  };
}

function leg(model: string, now: number, overrides: Partial<GenerationUsageLeg> = {}): GenerationUsageLeg {
  return generationUsageLegSchema.parse({
    model: testModelId(model),
    provider: testProviderId("google"),
    wire: "google-generative-ai",
    observedAt: now,
    contextWindow: null,
    maxOutputTokens: null,
    modelCalls: 1,
    durationApiMs: 100,
    ttftMs: null,
    finishReason: "stop",
    stopReason: "STOP",
    terminalReason: null,
    generationId: null,
    tokensIn: 10,
    tokensOut: 20,
    cacheReadTokens: 5,
    cacheWriteTokens: 3,
    reasoningTokens: null,
    servedModel: null,
    tokenDetails: null,
    costUsd: 0.5,
    costDetails: null,
    costProvenance: "measured",
    ...overrides,
  });
}

test("retained selected legs replace legacy totals, while swipe legs retain tokens without selected spend", ({ clock, ids }) => {
  const ownerId = makeUser().id;
  const characterId = castId<CharacterId>(ids.next(ID_PREFIX.character));
  const now = clock.now();
  const later = now + 86_400_000;
  const a = createOwnerAccums();
  const legs = [
    leg("first-model", now, { provider: testProviderId("claude-sub"), wire: "agent-sdk", costProvenance: "estimated" }),
    leg("second-model", later, { tokensIn: 2, tokensOut: 4, cacheReadTokens: null, cacheWriteTokens: null, costUsd: 0 }),
  ];
  const row = { ...message(characterId, now, ids.next(ID_PREFIX.message)), usageLegs: JSON.stringify(legs) };
  foldCanonMessage(ownerId, row, a);
  foldCanonSwipe(
    ownerId,
    {
      svid: ids.next(ID_PREFIX.messageVariant),
      cid: characterId,
      msgCreatedAt: now,
      content: "another take",
      ti: 999,
      tout: 999,
      tokenProvenance: "measured",
      gs: null,
      gf: null,
      model: "first-model",
      provider: "claude-sub",
      reasoning: null,
      reasoningDur: null,
      usageLegs: JSON.stringify([legs[0]]),
    },
    a,
  );
  const meta = buildChatMeta([], [], { characters: 1, chats: 1, forkedChats: 0 });
  const rows = buildOwnerRows({ ownerId, ownedCharacterIds: [characterId] }, a, meta, now);
  expect(rows.ownerRow).toMatchObject({
    assistantTurns: 1,
    swipes: 1,
    tokensIn: 22,
    tokensOut: 44,
    tokensInMeasuredSamples: 3,
    costUsd: 0.5,
    costSamples: 2,
    notionalCostSamples: 1,
    cacheReadTokens: 5,
    cacheWriteTokens: 3,
    genTimeMs: 100,
    genSamples: 1,
    activeIdxSum: 1,
    variantMessages: 1,
    maxContextTokens: 2000,
  });
  expect(rows.charRows[0]).toMatchObject({ characterId, tokensIn: 22, tokensOut: 44, costUsd: 0.5, costSamples: 2, notionalCostSamples: 1 });
  expect(rows.bucketRows.map((bucket) => [bucket.bucketStart, bucket.tokensIn, bucket.tokensOut, bucket.costUsd, bucket.costSamples])).toEqual([
    [statsBucketStart(now), 10, 20, 0.5, 1],
    [statsBucketStart(later), 2, 4, 0, 1],
  ]);
  expect(rows.modelRows.find((model) => model.model === "first-model")).toMatchObject({
    provider: "claude-sub",
    generations: 1,
    tokensIn: 20,
    tokensOut: 40,
    costUsd: 0.5,
    costSamples: 1,
    notionalCostSamples: 1,
  });
  expect(rows.modelRows.find((model) => model.model === "second-model")).toMatchObject({
    provider: "google",
    generations: 1,
    tokensIn: 2,
    tokensOut: 4,
    costUsd: 0,
    costSamples: 1,
    notionalCostSamples: 0,
  });
});

test("census retains silent seats and departed authorship but character rows never inherit room-cohort ownership", ({ clock, ids }) => {
  const ownerId = makeUser().id;
  const silent = castId<CharacterId>(ids.next(ID_PREFIX.character));
  const departed = castId<CharacterId>(ids.next(ID_PREFIX.character));
  const foreign = castId<CharacterId>(ids.next(ID_PREFIX.character));
  const now = clock.now();
  const a = createOwnerAccums();
  foldCanonMessage(ownerId, message(departed, now, ids.next(ID_PREFIX.message)), a);
  foldCanonMessage(ownerId, message(foreign, now, ids.next(ID_PREFIX.message)), a);
  const meta = buildChatMeta(
    [{ cid: silent, chats: 2, forkedChats: 1, firstChatAt: now - 1000, maxChatUpdated: now + 2000 }],
    [{ bucketStart: statsBucketStart(now - 86_400_000), n: 1 }],
    { characters: 2, chats: 2, forkedChats: 1 },
  );
  ownerExtrema(a.owner, meta);
  const rows = buildOwnerRows({ ownerId, ownedCharacterIds: [silent, departed] }, a, meta, now);
  expect(rows.charRows.map((row) => row.characterId)).toEqual([silent, departed].sort());
  expect(rows.charRows.find((row) => row.characterId === silent)).toMatchObject({
    chats: 2,
    assistantTurns: 0,
    costUsd: 0,
    firstChatAt: now - 1000,
    lastActivityAt: now + 2000,
  });
  expect(rows.charRows.find((row) => row.characterId === departed)).toMatchObject({
    chats: 0,
    assistantTurns: 1,
    costUsd: 999,
    firstChatAt: null,
    lastActivityAt: now,
  });
  expect(rows.ownerRow).toMatchObject({ ownerId, characters: 2, chats: 2, assistantTurns: 2, firstChatAt: now - 1000, lastActivityAt: now + 2000 });
  expect(rows.bucketRows.find((row) => row.bucketStart === statsBucketStart(now - 86_400_000))).toMatchObject({
    chatsCreated: 1,
    assistantTurns: 0,
    tokensIn: 0,
    costUsd: 0,
  });
  expect(createOwnerAccums().charMap.size).toBe(0);
});
