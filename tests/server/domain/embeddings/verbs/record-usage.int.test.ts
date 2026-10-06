// Batch economics survives invocation failure and vector lifetime. Live and rebuilt counters must agree
// without counting embedding input as generated prose or multiplying a batch by its vector count.

import type { EmbeddingBatchObservation } from "@orb/contracts/embeddings";
import { EMBEDDING_FLOOR } from "@orb/contracts/inference";
import { embeddingCalls, modelStats, ownerStats, userConnections } from "@orb/db";
import type { EmbeddingCallId, EmbeddingInvocationId, UserConnectionId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { runOpenAiCompatEmbed } from "../../../../../packages/inference/src/backends/openai-compat/embed.ts";
import { createRecordUsage } from "../../../../../packages/server/src/domain/embeddings/index.ts";
import { applyStatsDelta, reconcileStats } from "../../../../../packages/server/src/domain/stats/index.ts";
import { fakeApiKeySecret, fakeDeps, fakeResolved } from "../../../../inference/_support.ts";
import { makeResolved } from "../../../../support/factories/resolved-connection.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId } from "../../../../support/inference-identities.ts";

const NOW = 1_700_000_000_000;
const COST = 0.000_034;
const BATCH: EmbeddingBatchObservation = {
  inputCount: 3,
  inputModalities: ["text"],
  servedModel: null,
  usage: { promptTokens: 34, totalTokens: null },
  tokenDetails: null,
  cost: { costUsd: COST, costProvenance: "estimated", costDetails: { totalUsd: COST, promptUsd: COST, pricing: { inputPerMTok: 1, outputPerMTok: 0 } } },
};

test.for([
  { reportedPrice: null, sourceId: "source-fixture", expectedSource: "source-fixture" },
  { reportedPrice: 0, sourceId: "source-fixture", expectedSource: "source-fixture" },
  { reportedPrice: 0.125, sourceId: "source-fixture", expectedSource: "source-fixture" },
  { reportedPrice: 0.125, sourceId: "fixture-key", expectedSource: null },
])("actual OpenRouter embedding HIT price $reportedPrice/source $sourceId preserves canon without credential bytes", async ({
  reportedPrice,
  sourceId,
  expectedSource,
}, { db, ids }) => {
  const owner = await seedUser(db);
  const connection = fakeResolved({
    task: "embed",
    providerId: "openrouter",
    model: "google/gemini-embedding-2",
    ownerId: owner.id,
    capability: { kind: "embedding", embedding: { ...EMBEDDING_FLOOR, dims: 2, mrl: true } },
    secret: fakeApiKeySecret("fixture-key"),
    declaredFeatures: { pricing: { inputPerMTok: 1, outputPerMTok: 0 } },
  });
  await db
    .insert(userConnections)
    .values({ id: connection.connectionId, ownerId: owner.id, providerId: connection.providerId, model: connection.model, label: "Embedding" });
  const begin = createRecordUsage({
    db,
    now: () => NOW,
    newCallId: () => castId<EmbeddingCallId>(ids.next(ID_PREFIX.embeddingCall)),
    newInvocationId: () => castId<EmbeddingInvocationId>(ids.next(ID_PREFIX.embeddingInvocation)),
    applyStatsDelta,
  });
  const accounting = begin({
    ownerId: owner.id,
    connectionId: connection.connectionId,
    providerId: connection.providerId,
    model: connection.model,
    wire: connection.wire,
    task: "embed",
  });
  const posts: string[] = [];
  const deps = fakeDeps();
  const result = await runOpenAiCompatEmbed(
    { connection, input: "Retained cached embedding.", dimensions: 2, embeddingAccounting: accounting },
    {
      log: deps.log,
      transport: {
        app: deps.app,
        fetch: (input) => {
          posts.push(new URL(String(input)).pathname);
          return Promise.resolve(
            Response.json(
              {
                object: "list",
                model: "served-embedding-model",
                data: [{ object: "embedding", index: 0, embedding: [1, 0] }],
                usage: { ["prompt_tokens"]: 0, ["total_tokens"]: 0, ...(reportedPrice === null ? {} : { cost: reportedPrice }) },
              },
              {
                headers: {
                  "x-openrouter-cache-status": "HIT",
                  "x-openrouter-cache-age": "0",
                  "x-openrouter-cache-ttl": "240",
                  "x-openrouter-cache-source-id": sourceId,
                },
              },
            ),
          );
        },
      },
    },
  );
  await accounting.finish(true);
  expect(posts).toEqual(["/api/v1/embeddings"]);
  const responseCache = { status: "hit", ageSeconds: 0, ttlSeconds: 240, sourceGenerationId: expectedSource };
  expect(result.usage).toEqual({ promptTokens: 0, totalTokens: 0, responseCache });
  const rows = await db.select().from(embeddingCalls);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    ownerId: owner.id,
    inputCount: 1,
    servedModel: "served-embedding-model",
    promptTokens: 0,
    totalTokens: 0,
    responseCache,
    costUsd: reportedPrice ?? 0,
    costProvenance: "measured",
    outcome: "completed",
  });
  const live = await db.select().from(ownerStats).where(eq(ownerStats.ownerId, owner.id));
  expect(live[0]).toMatchObject({ costUsd: reportedPrice ?? 0, costSamples: 1, tokensIn: 0, tokensInMeasuredSamples: 1, assistantTurns: 0, genSamples: 0 });
  await reconcileStats(db, { now: () => NOW });
  expect(await db.select().from(ownerStats).where(eq(ownerStats.ownerId, owner.id))).toEqual(live);
});

test("physical batches retain rates, partial failure and owner scope independently of vectors", async ({ db, ids }) => {
  const owner = await seedUser(db);
  const other = await seedUser(db);
  const connectionId = castId<UserConnectionId>(ids.next(ID_PREFIX.userConnection));
  const model = testModelId("gemini-embedding-2");
  const resolved = makeResolved({
    task: "embed",
    providerId: "google",
    ownerId: owner.id,
    connectionId,
    model,
    capability: { kind: "embedding", embedding: EMBEDDING_FLOOR },
  });
  await db.insert(userConnections).values({ id: connectionId, ownerId: owner.id, providerId: resolved.providerId, model, label: "accounting control" });
  const begin = createRecordUsage({
    db,
    now: () => NOW,
    newCallId: () => castId<EmbeddingCallId>(ids.next(ID_PREFIX.embeddingCall)),
    newInvocationId: () => castId<EmbeddingInvocationId>(ids.next(ID_PREFIX.embeddingInvocation)),
    applyStatsDelta,
  });
  const accounting = begin({ ownerId: owner.id, connectionId, providerId: resolved.providerId, model, wire: resolved.wire, task: "embed" });
  await accounting.recordBatch(BATCH);
  await accounting.recordBatch({
    ...BATCH,
    inputCount: 1,
    usage: { promptTokens: 0, totalTokens: null },
    cost: { costUsd: 0, costDetails: { totalUsd: 0 }, costProvenance: "measured" },
  });
  await accounting.finish(false);
  const rows = await db.select().from(embeddingCalls).where(eq(embeddingCalls.ownerId, owner.id));
  expect(rows).toHaveLength(2);
  expect(new Set(rows.map((row) => row.invocationId)).size).toBe(1);
  expect(rows.map((row) => row.outcome)).toEqual(["failed", "failed"]);
  expect(rows[0]?.costDetails).toEqual(BATCH.cost.costDetails);
  expect(rows.map((row) => row.totalTokens)).toEqual([null, null]);
  expect(await db.select().from(embeddingCalls).where(eq(embeddingCalls.ownerId, other.id))).toEqual([]);
  expect(await db.select().from(ownerStats).where(eq(ownerStats.ownerId, owner.id))).toMatchObject([
    { tokensIn: 34, tokensInMeasuredSamples: 2, costUsd: COST, costSamples: 2, assistantTurns: 0, assistantWords: 0, genSamples: 0 },
  ]);
  expect(await db.select().from(modelStats).where(eq(modelStats.ownerId, owner.id))).toMatchObject([
    { generations: 0, genSamples: 0, tokensIn: 34, tokensInMeasuredSamples: 2, tokensOutMeasuredSamples: 0, costSamples: 2 },
  ]);
  await db.delete(userConnections).where(eq(userConnections.id, connectionId));
  expect((await db.select().from(embeddingCalls)).every((row) => row.connectionId === null)).toBe(true);
  await reconcileStats(db, { now: () => NOW });
  expect(await db.select().from(ownerStats).where(eq(ownerStats.ownerId, owner.id))).toMatchObject([
    { tokensIn: 34, tokensInMeasuredSamples: 2, costUsd: COST, costSamples: 2, assistantTurns: 0, genSamples: 0 },
  ]);
  expect(await db.select().from(modelStats).where(eq(modelStats.ownerId, owner.id))).toMatchObject([
    { generations: 0, genSamples: 0, tokensIn: 34, tokensInMeasuredSamples: 2, tokensOutMeasuredSamples: 0, costSamples: 2 },
  ]);
});

test("deleted attribution and unmetered local execution retain unknowns, not billed zeros", async ({ db, ids }) => {
  const owner = await seedUser(db);
  const resolved = makeResolved({ task: "embed", providerId: "local-light", ownerId: owner.id });
  const begin = createRecordUsage({
    db,
    now: () => NOW,
    newCallId: () => castId<EmbeddingCallId>(ids.next(ID_PREFIX.embeddingCall)),
    newInvocationId: () => castId<EmbeddingInvocationId>(ids.next(ID_PREFIX.embeddingInvocation)),
    applyStatsDelta,
  });
  const accounting = begin({
    ownerId: owner.id,
    connectionId: resolved.connectionId,
    providerId: resolved.providerId,
    model: resolved.model,
    wire: resolved.wire,
    task: "embed",
  });
  await accounting.recordBatch({
    ...BATCH,
    usage: { promptTokens: null, totalTokens: null },
    cost: { costUsd: null, costDetails: null, costProvenance: "unrecorded" },
  });
  await accounting.finish(true);
  expect(await db.select().from(embeddingCalls)).toMatchObject([
    { connectionId: null, promptTokens: null, totalTokens: null, costUsd: null, costProvenance: "unrecorded", outcome: "completed" },
  ]);
  expect(await db.select().from(modelStats)).toMatchObject([{ generations: 0, genSamples: 0, tokensInMeasuredSamples: 0, costSamples: 0 }]);
});
