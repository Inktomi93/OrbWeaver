import type { MemoryDigestInput, StoreSegmentParams } from "@orb/contracts/chat";
import type { EmbeddingsPruneBlocksOp, MemoryEmbedSpace, ResolveMemoryEmbedSpaceOp } from "@orb/contracts/embeddings";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { EmbeddingsService } from "./service.ts";

export interface MemoryEmbeddingDeps {
  readonly embeddings: Pick<EmbeddingsService, "resolveGeneration" | "store" | "storeSegments" | "pruneMemoryBlocks">;
  readonly resolveChatHostUserId: (chatId: ChatId) => Promise<UserId | null>;
}
export interface MemoryEmbeddingOps {
  readonly resolveMemoryEmbedSpace: ResolveMemoryEmbedSpaceOp;
  readonly embeddingsStore: (params: MemoryDigestInput & { readonly signal?: AbortSignal | undefined }) => Promise<MemoryEmbedSpace>;
  readonly embeddingsStoreSegments: (params: readonly StoreSegmentParams[], signal?: AbortSignal) => Promise<readonly MemoryEmbedSpace[]>;
  readonly embeddingsPruneBlocks: EmbeddingsPruneBlocksOp;
}
