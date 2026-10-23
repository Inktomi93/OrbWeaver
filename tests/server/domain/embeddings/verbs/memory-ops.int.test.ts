// A mixed-owner batch consults the production present-host query for every row before admitting any vector write.

import type { StoreSegmentParams } from "@orb/contracts/chat";
import { chatParticipants } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import { loadPresentHostUserId } from "@orb/server/domain/chat";
import { createMemoryEmbeddingOps } from "@orb/server/domain/embeddings";
import { expect, test } from "@orb/testkit/node";
import { seedChat } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { vi } from "vitest";

test("a later foreign-owner segment refuses the entire flood; a departed host refuses before the store", async ({ harness, db, app }): Promise<void> => {
  const ownHost = await harness.principalFor((await harness.actor()).id);
  const neighborHost = await harness.principalFor((await harness.actor()).id);
  const { row: own } = await seedChat(harness, { principal: ownHost, characterIds: [] });
  const { row: neighbor } = await seedChat(harness, { principal: neighborHost, characterIds: [] });
  await app.seedUserConnections(ownHost.userId);
  const generation = await app.embeddings.resolveGeneration(ownHost.userId, "embed");
  if (generation === null) {
    throw new Error("the seeded owner has no embedding generation");
  }
  const storeSegments = vi.fn(async () => []);
  const ops = createMemoryEmbeddingOps({
    resolveChatHostUserId: (id) => loadPresentHostUserId(databaseHandle(db), id),
    embeddings: { resolveGeneration: async () => null, store: vi.fn(), storeSegments, pruneMemoryBlocks: vi.fn() },
  });
  const base: StoreSegmentParams = {
    lens: "segment",
    ownerId: ownHost.userId,
    model: generation.space,
    generationId: generation.id,
    generationEpoch: generation.epoch,
    chatId: own.id,
    blockIdx: 0,
    chunkIdx: 0,
    seqStart: 1,
    seqEnd: 2,
    text: "Own segment",
    contentHash: "own-hash",
  };
  await expect(ops.embeddingsStoreSegments([base, { ...base, chatId: neighbor.id, text: "Foreign room" }])).rejects.toThrow(
    "memory segment owner changed during sweep",
  );
  expect(storeSegments).not.toHaveBeenCalled();
  await db.update(chatParticipants).set({ leftSeq: 3 }).where(eq(chatParticipants.chatId, own.id));
  await expect(ops.embeddingsStoreSegments([base])).rejects.toThrow("memory segment owner changed during sweep");
  expect(storeSegments).not.toHaveBeenCalled();
});
