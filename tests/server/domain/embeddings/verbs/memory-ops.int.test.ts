// A mixed-owner batch consults the production present-host query for every row before admitting any vector write.

import type { StoreSegmentParams } from "@orb/contracts/chat";
import { chatParticipants } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { loadPresentHostUserId } from "@orb/server/domain/chat";
import { createMemoryEmbeddingOps } from "@orb/server/domain/embeddings";
import { seedChat } from "@orb/testkit/node/factories/chat.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { vi } from "vitest";

test("a later foreign-owner segment refuses the entire flood; a departed host refuses before the store", async ({ db }): Promise<void> => {
  const own = await seedChat(db, { withHost: true });
  const neighbor = await seedChat(db, { withHost: true });
  if (own.hostUserId === undefined || neighbor.hostUserId === undefined) {
    throw new Error("requested host fixture did not seed a host");
  }
  const storeSegments = vi.fn(async () => []);
  const ops = createMemoryEmbeddingOps({
    resolveChatHostUserId: (id) => loadPresentHostUserId(db, id),
    embeddings: { resolveGeneration: async () => null, store: vi.fn(), storeSegments, pruneMemoryBlocks: vi.fn() },
  });
  const base: StoreSegmentParams = {
    lens: "segment",
    ownerId: own.hostUserId,
    model: "controlled-space",
    generationId: mintTypeId(ID_PREFIX.embedGeneration),
    generationEpoch: 1,
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
