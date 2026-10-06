import type { EmbeddingBatchObservation } from "@orb/contracts/embeddings";
import { embeddingCalls, ownerStats } from "@orb/db";
import type { EmbeddingCallId, EmbeddingInvocationId, UserConnectionId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { eq, sql } from "drizzle-orm";
import { appendEmbeddingBatch, settleEmbeddingInvocation } from "../../../../../packages/server/src/domain/embeddings/persistence/usage-write.ts";
import { applyStatsDelta } from "../../../../../packages/server/src/domain/stats/index.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId, testProviderId } from "../../../../support/inference-identities.ts";

test("settlement cannot cross an owner and missing connection attribution cannot discard measured zero", async ({ db, ids, clock }) => {
  const owner = await seedUser(db);
  const other = await seedUser(db);
  const invocationId = castId<EmbeddingInvocationId>(ids.next(ID_PREFIX.embeddingInvocation));
  const ctx = {
    db,
    now: clock.now,
    newCallId: () => castId<EmbeddingCallId>(ids.next(ID_PREFIX.embeddingCall)),
    newInvocationId: () => castId<EmbeddingInvocationId>(ids.next(ID_PREFIX.embeddingInvocation)),
    applyStatsDelta,
  };
  const invocation = {
    ownerId: owner.id,
    connectionId: castId<UserConnectionId>(ids.next(ID_PREFIX.userConnection)),
    providerId: testProviderId("google"),
    model: testModelId("encoder"),
    wire: "google-generative-ai",
    task: "embed",
  } as const;
  const batch: EmbeddingBatchObservation = {
    inputCount: 2,
    inputModalities: ["text"],
    servedModel: "served-encoder",
    usage: { promptTokens: 0, totalTokens: null },
    tokenDetails: null,
    cost: { costUsd: 0, costProvenance: "measured", costDetails: { totalUsd: 0 } },
  };
  await appendEmbeddingBatch(ctx, invocation, { invocationId, batch, outcome: null });
  await appendEmbeddingBatch(
    ctx,
    { ...invocation, ownerId: other.id },
    {
      invocationId,
      batch: { ...batch, usage: { promptTokens: null, totalTokens: null }, cost: { costUsd: null, costProvenance: "unrecorded", costDetails: null } },
      outcome: null,
    },
  );
  await settleEmbeddingInvocation(ctx, invocation, invocationId, "failed");
  expect(await db.select().from(embeddingCalls).where(eq(embeddingCalls.ownerId, owner.id))).toMatchObject([
    { connectionId: null, promptTokens: 0, totalTokens: null, costUsd: 0, outcome: "failed" },
  ]);
  expect(await db.select().from(embeddingCalls).where(eq(embeddingCalls.ownerId, other.id))).toMatchObject([{ costUsd: null, outcome: null }]);
  expect(await db.select().from(ownerStats).where(eq(ownerStats.ownerId, owner.id))).toMatchObject([
    { tokensInMeasuredSamples: 1, costSamples: 1, costUsd: 0, assistantTurns: 0 },
  ]);
});

test("a rollup failure rolls back the physical batch instead of orphaning spend canon", async ({ db, ids, clock }) => {
  const owner = await seedUser(db);
  const ctx = {
    db,
    now: clock.now,
    newCallId: () => castId<EmbeddingCallId>(ids.next(ID_PREFIX.embeddingCall)),
    newInvocationId: () => castId<EmbeddingInvocationId>(ids.next(ID_PREFIX.embeddingInvocation)),
    applyStatsDelta,
  };
  const invocation = {
    ownerId: owner.id,
    connectionId: castId<UserConnectionId>(ids.next(ID_PREFIX.userConnection)),
    providerId: testProviderId("google"),
    model: testModelId("encoder"),
    wire: "google-generative-ai",
    task: "embed",
  } as const;
  const batch: EmbeddingBatchObservation = {
    inputCount: 1,
    inputModalities: ["text"],
    servedModel: null,
    usage: { promptTokens: null, totalTokens: null },
    tokenDetails: null,
    cost: { costUsd: 0.125, costProvenance: "measured", costDetails: { totalUsd: 0.125 } },
  };
  await appendEmbeddingBatch(ctx, invocation, { invocationId: ctx.newInvocationId(), batch, outcome: "completed" });
  const before = await db.select().from(embeddingCalls);
  await db.run(sql`create trigger fixture_refuse_embedding_spend before update on owner_stats begin select raise(abort, 'fixture rollup refusal'); end`);
  await expect(appendEmbeddingBatch(ctx, invocation, { invocationId: ctx.newInvocationId(), batch, outcome: "completed" })).rejects.toThrow(
    "fixture rollup refusal",
  );
  expect(await db.select().from(embeddingCalls)).toEqual(before);
  expect(await db.select().from(ownerStats)).toMatchObject([{ costUsd: 0.125, costSamples: 1 }]);
});
