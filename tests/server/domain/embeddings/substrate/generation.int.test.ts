import type { Db } from "@orb/db";
import { documentChunks, embedGenerationTargets, embedSpaceState, userConnections } from "@orb/db";
import type { DocumentChunkId, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import type { EmbeddingConnectionSnapshot } from "../../../../../packages/server/src/domain/embeddings/contract/service.ts";
import { markGenerationComplete } from "../../../../../packages/server/src/domain/embeddings/persistence/space-state.ts";
import { resolveTargetGeneration } from "../../../../../packages/server/src/domain/embeddings/substrate/generation.ts";
import { freshDb } from "../../../../support/db.ts";
import { makeFakeRoleClients } from "../../../../support/factories/role-clients.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedDocument, seedUser } from "../_support.ts";

async function seedConnection(db: Db, ownerId: UserId, key: string): Promise<EmbeddingConnectionSnapshot> {
  const connectionId = castId<UserConnectionId>(`user_connection_generation_${key}`);
  const clients = makeFakeRoleClients({ embedDim: 8, embedModel: `embed-${key}` });
  const resolved = await clients.resolved("embed");
  if (resolved === null) {
    throw new Error("the embed test connection must resolve");
  }
  await db.insert(userConnections).values({
    id: connectionId,
    ownerId,
    label: `Generation ${key}`,
    providerId: resolved.providerId,
    model: resolved.model,
    createdAt: 1,
    updatedAt: 1,
  });
  return {
    ...resolved,
    connectionId,
    api: "test",
    wire: "test",
    baseUrl: null,
    features: {},
    extras: null,
    transport: null,
    embed: clients.embed,
    imageEmbed: clients.imageEmbed,
  };
}

test("a slow stale resolution cannot reset a newer target or promote its generation", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_generation_target_race" });
  const oldConnection = await seedConnection(db, ownerId, "old");
  const newConnection = await seedConnection(db, ownerId, "new");
  const now = (): number => 1;

  const oldGeneration = await resolveTargetGeneration({ db, now, resolveEmbeddingConnection: () => Promise.resolve(oldConnection) }, ownerId, "embed");
  if (oldGeneration === null) {
    throw new Error("the old generation must resolve");
  }
  expect(oldGeneration.epoch).toBe(1);
  expect(await markGenerationComplete(db, { ownerId, scope: "cards", generation: oldGeneration, now: 2 })).toBe(false);
  expect(await markGenerationComplete(db, { ownerId, scope: "memory", generation: oldGeneration, now: 3 })).toBe(false);
  expect(await markGenerationComplete(db, { ownerId, scope: "documents", generation: oldGeneration, now: 4 })).toBe(true);

  const documentId = await seedDocument(db, ownerId, { id: "document_generation_shrink", text: "kept retired" });
  const oldKeptId = castId<DocumentChunkId>("document_chunk_generation_old_kept");
  const oldExtraId = castId<DocumentChunkId>("document_chunk_generation_old_extra");
  const newKeptId = castId<DocumentChunkId>("document_chunk_generation_new_kept");
  await db.insert(documentChunks).values([
    {
      id: oldKeptId,
      documentId,
      chunkIdx: 0,
      content: "kept",
      charStart: 0,
      charEnd: 4,
      embedding: new Float32Array(1024),
      contentHash: "old-kept",
      model: oldConnection.model,
      generationId: oldGeneration.id,
      dim: 1024,
    },
    {
      id: oldExtraId,
      documentId,
      chunkIdx: 1,
      content: "retired",
      charStart: 5,
      charEnd: 12,
      embedding: new Float32Array(1024),
      contentHash: "old-extra",
      model: oldConnection.model,
      generationId: oldGeneration.id,
      dim: 1024,
    },
  ]);

  const staleStarted = Promise.withResolvers<void>();
  const releaseStale = Promise.withResolvers<EmbeddingConnectionSnapshot>();
  let staleReads = 0;
  const staleResolution = resolveTargetGeneration(
    {
      db,
      now,
      resolveEmbeddingConnection: () => {
        staleReads += 1;
        if (staleReads === 1) {
          staleStarted.resolve();
          return releaseStale.promise;
        }
        return Promise.resolve(newConnection);
      },
    },
    ownerId,
    "embed",
  );
  await staleStarted.promise;

  const newGeneration = await resolveTargetGeneration({ db, now, resolveEmbeddingConnection: () => Promise.resolve(newConnection) }, ownerId, "embed");
  if (newGeneration === null) {
    throw new Error("the new generation must resolve");
  }
  expect(newGeneration.epoch).toBe(2);
  await db.insert(documentChunks).values({
    id: newKeptId,
    documentId,
    chunkIdx: 0,
    content: "kept",
    charStart: 0,
    charEnd: 4,
    embedding: new Float32Array(1024),
    contentHash: "new-kept",
    model: newConnection.model,
    generationId: newGeneration.id,
    dim: 1024,
  });

  releaseStale.resolve(oldConnection);
  await expect(staleResolution).resolves.toMatchObject({ id: newGeneration.id, epoch: 2 });

  const target = await db
    .select({ generationId: embedGenerationTargets.generationId, epoch: embedGenerationTargets.epoch })
    .from(embedGenerationTargets)
    .where(and(eq(embedGenerationTargets.ownerId, ownerId), eq(embedGenerationTargets.task, "embed")));
  expect(target).toEqual([{ generationId: newGeneration.id, epoch: 2 }]);

  expect(await markGenerationComplete(db, { ownerId, scope: "cards", generation: newGeneration, now: 2 })).toBe(false);
  expect(await markGenerationComplete(db, { ownerId, scope: "cards", generation: oldGeneration, now: 3 })).toBe(false);

  const cardCandidate = await db
    .select({ generationId: embedSpaceState.candidateGenerationId, epoch: embedSpaceState.candidateEpoch })
    .from(embedSpaceState)
    .where(and(eq(embedSpaceState.ownerId, ownerId), eq(embedSpaceState.scope, "cards")));
  expect(cardCandidate).toEqual([{ generationId: newGeneration.id, epoch: 2 }]);

  expect(await markGenerationComplete(db, { ownerId, scope: "memory", generation: newGeneration, now: 4 })).toBe(false);
  const beforePromotion = await db.select({ id: documentChunks.id }).from(documentChunks).where(eq(documentChunks.documentId, documentId));
  expect(beforePromotion).toEqual(expect.arrayContaining([{ id: oldKeptId }, { id: oldExtraId }, { id: newKeptId }]));
  expect(beforePromotion).toHaveLength(3);
  expect(await markGenerationComplete(db, { ownerId, scope: "documents", generation: newGeneration, now: 5 })).toBe(true);

  expect(await db.select({ id: documentChunks.id }).from(documentChunks).where(eq(documentChunks.documentId, documentId))).toEqual([{ id: newKeptId }]);

  const promoted = await db
    .select({
      scope: embedSpaceState.scope,
      activeGenerationId: embedSpaceState.activeGenerationId,
      candidateGenerationId: embedSpaceState.candidateGenerationId,
      candidateEpoch: embedSpaceState.candidateEpoch,
    })
    .from(embedSpaceState)
    .where(eq(embedSpaceState.ownerId, ownerId));
  expect(promoted).toHaveLength(3);
  expect(promoted).toEqual(
    expect.arrayContaining(
      ["cards", "memory", "documents"].map((scope) => ({
        scope,
        activeGenerationId: newGeneration.id,
        candidateGenerationId: null,
        candidateEpoch: null,
      })),
    ),
  );
});
