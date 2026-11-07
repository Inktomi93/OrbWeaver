// A mixed-owner batch consults the production present-host query for every row before admitting any vector write.

import type { StoreSegmentParams } from "@orb/contracts/chat";
import { createMemoryEmbeddingOps } from "@orb/server/domain/embeddings";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  presentHostOf,
  seedChat,
  seedCorpusActors,
} from "@orb/testkit/node/composed";
import { vi } from "vitest";

test("an own segment stores; a later foreign row refuses the flood by name; a departed host refuses before the store", async (): Promise<void> => {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ startJobs: false, providerFetch: provider.execute });
  const { owner: ownHost, secondUserId } = await seedCorpusActors(root);
  const neighborHost = await root.principalFor(secondUserId);
  const {
    view: { chat: own },
  } = await seedChat(root, { principal: ownHost, characterIds: [] });
  const {
    view: { chat: neighbor },
  } = await seedChat(root, { principal: neighborHost, characterIds: [] });
  const generation = await root.app.embeddings.resolveGeneration(ownHost.userId, "embed");
  if (generation === null) {
    throw new Error("the seeded owner has no embedding generation");
  }
  const storeSegments = vi.fn(root.app.embeddings.storeSegments);
  const ops = createMemoryEmbeddingOps({ resolveChatHostUserId: presentHostOf(root), embeddings: { ...root.app.embeddings, storeSegments } });
  const base: StoreSegmentParams = {
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
  await expect(ops.embeddingsStoreSegments([base])).resolves.toEqual([
    { ownerId: ownHost.userId, model: generation.space, generationId: generation.id, generationEpoch: generation.epoch },
  ]);
  expect(storeSegments).toHaveBeenCalledTimes(1);

  await expect(ops.embeddingsStoreSegments([base, { ...base, chatId: neighbor.id, text: "Foreign room" }])).rejects.toThrow(
    `memory segment owner changed during sweep for chat ${neighbor.id}`,
  );
  expect(storeSegments).toHaveBeenCalledTimes(1);

  await root.services.chat.selfLeave({ principal: ownHost, chatId: own.id });
  await expect(ops.embeddingsStoreSegments([base])).rejects.toThrow(`memory segment owner changed during sweep for chat ${own.id}`);
  expect(storeSegments).toHaveBeenCalledTimes(1);
});
