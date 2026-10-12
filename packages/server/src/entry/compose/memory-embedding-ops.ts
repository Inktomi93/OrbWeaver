// Chat memory's vector seam onto the embeddings service: the host's embed space, the digest and segment stores
// with their owner-coherence guard, and the shrink reclaim. Kept apart from the chat seam so the memory suites run
// these exact ops instead of copies.

import { NoConnectionError } from "@orb/inference";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { ChatContext, MemoryEmbedSpace, MemoryStoreReceipt } from "#domain/chat";
import type { EmbeddingsService } from "#domain/embeddings";

type EmbeddingSegmentRow = Parameters<EmbeddingsService["storeSegments"]>[0][number];

function memorySegmentReceipts(rows: readonly EmbeddingSegmentRow[], results: Awaited<ReturnType<EmbeddingsService["storeSegments"]>>): MemoryStoreReceipt[] {
  const receipts: MemoryStoreReceipt[] = [];
  for (const [index, result] of results.entries()) {
    const row = rows[index];
    if (row === undefined) {
      throw new Error("embeddings.storeSegments returned more results than inputs");
    }
    if (result.generationId === undefined || result.generationEpoch === undefined) {
      throw new Error("embeddings store omitted its generation receipt");
    }
    receipts.push({ ownerId: row.ownerId, model: result.model, generationId: result.generationId, generationEpoch: result.generationEpoch });
  }
  if (receipts.length !== rows.length) {
    throw new Error("embeddings.storeSegments returned fewer results than inputs");
  }
  return receipts;
}

/**
 * A chat's digest/segment SPACE is its HOST's: vector tasks are owner-scoped (§7.5), and D18 chats have no owner
 * column, so the host is resolved per write. A store whose planned owner is no longer the room's present host
 * THROWS: the room changed hands mid-sweep, and writing on would put the old host's vectors in the new host's room.
 */
export function createMemoryEmbeddingOps(deps: {
  readonly embeddings: Pick<EmbeddingsService, "resolveGeneration" | "store" | "storeSegments" | "pruneMemoryBlocks">;
  readonly resolveChatHostUserId: (chatId: ChatId) => Promise<UserId | null>;
}): Pick<ChatContext, "resolveMemoryEmbedSpace" | "embeddingsStore" | "embeddingsStoreSegments" | "embeddingsPruneBlocks"> {
  const { embeddings, resolveChatHostUserId } = deps;
  return {
    // No binding is the honest `NoConnectionError`: a default would silently write into a space nobody reads.
    resolveMemoryEmbedSpace: async (hostUserId): Promise<MemoryEmbedSpace> => {
      const generation = await embeddings.resolveGeneration(hostUserId, "embed");
      if (generation === null) {
        throw new NoConnectionError("no embed connection is bound for this user — bind one in Connections");
      }
      return { ownerId: hostUserId, model: generation.space, generationId: generation.id, generationEpoch: generation.epoch };
    },
    embeddingsStore: async (params): Promise<MemoryStoreReceipt> => {
      const hostUserId = await resolveChatHostUserId(params.key.chatId);
      if (hostUserId !== params.ownerId) {
        throw new Error(`memory digest owner changed during sweep for chat ${params.key.chatId}`);
      }
      const result = await embeddings.store({
        kind: "chat-block",
        lens: "digest",
        ownerId: params.ownerId,
        chatId: params.key.chatId,
        scopedCharacterId: params.key.scopedCharacterId,
        isGroup: params.isGroup,
        tier: params.key.tier,
        blockIdx: params.key.blockIdx,
        text: params.text,
        topicAnchor: params.topicAnchor,
        keywords: params.keywords,
        speakerCharacterIds: params.speakerCharacterIds,
        contentHash: params.contentHash,
        model: params.model,
        signal: params.signal,
      });
      if (result.generationId === undefined || result.generationEpoch === undefined) {
        throw new Error("embeddings store omitted its generation receipt");
      }
      return { ownerId: params.ownerId, model: result.model, generationId: result.generationId, generationEpoch: result.generationEpoch };
    },
    // A BATCH op: memory hands over every pending chunk (one chat's on the live path, the whole corpus's on the
    // sweep) and embeddings submits them to the engine as one flood.
    embeddingsStoreSegments: async (params, signal): Promise<MemoryStoreReceipt[]> => {
      const rows: EmbeddingSegmentRow[] = [];
      for (const p of params) {
        const hostUserId = await resolveChatHostUserId(p.chatId);
        if (hostUserId !== p.ownerId) {
          throw new Error(`memory segment owner changed during sweep for chat ${p.chatId}`);
        }
        rows.push({
          kind: "chat-block" as const,
          lens: "segment" as const,
          ownerId: p.ownerId,
          chatId: p.chatId,
          blockIdx: p.blockIdx,
          chunkIdx: p.chunkIdx,
          seqStart: p.seqStart,
          seqEnd: p.seqEnd,
          text: p.text,
          contentHash: p.contentHash,
          model: p.model,
        });
      }
      const results = rows.length === 0 ? [] : await embeddings.storeSegments(rows, signal);
      return memorySegmentReceipts(rows, results);
    },
    // The SHRINK half: memory stores every block that exists, then reclaims the ones that stopped existing. The
    // DELETE lives in embeddings (the one vector write path, D20) and is scoped to the host's target generation.
    embeddingsPruneBlocks: async (params): Promise<void> => {
      if (params.lens === "digest") {
        await embeddings.pruneMemoryBlocks({
          lens: "digest",
          chatId: params.chatId,
          scopedCharacterId: params.scopedCharacterId,
          keepPerTier: params.keepPerTier,
        });
        return;
      }
      // The KNOWN-stale invalidation arm: a proven-stale row whose replacement came back empty.
      if (params.lens === "digest-stale") {
        await embeddings.pruneMemoryBlocks({
          lens: "digest-stale",
          chatId: params.chatId,
          scopedCharacterId: params.scopedCharacterId,
          keys: params.keys,
        });
        return;
      }
      await embeddings.pruneMemoryBlocks({
        lens: "segment",
        chatId: params.chatId,
        keepBlockCount: params.keepBlockCount,
        chunkCounts: params.chunkCounts,
      });
    },
  };
}
