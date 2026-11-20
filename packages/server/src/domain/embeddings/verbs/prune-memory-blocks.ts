// verb: pruneMemoryBlocks — the chat-memory SHRINK seam. memory's build STORES every block that currently exists, then calls this to reclaim the ones
// that no longer do.
//
// WHY IT HAS TO EXIST: blocks are sliced by POSITION and stored keyed `(tier, blockIdx)`, while the build's
// self-heal is CONTENT-HASH keyed — so the heal can only ever re-summarize a block that still EXISTS. When
// the ingest set SHRINKS (a host hides a trailing span, rows are deleted), the trailing block simply stops
// being produced: no hash changes, nothing re-summarizes, and until this verb nothing deleted it either. The
// digest summarized verbatim FROM the removed rows stayed in the recall pool, so `{{memory}}` could surface
// the very content the host had just hidden.
//
// The DELETE itself stays in embeddings/persistence — the ONE vector write path (D20); this verb only
// dispatches the two lens arms, exactly like `pruneDocumentChunks` (its direct idiom) and `writeHubScores`:
// a narrow, named, non-`store` write seam. Store-then-prune, never clear-then-store, so the build's no-op
// economy is untouched — an ordinary pass deletes nothing and re-embeds nothing.

import type { PruneMemoryBlocksParams } from "@orb/contracts/embeddings";
import type { EmbeddingsContext, EmbeddingsService } from "../contract/service.ts";
import { dropChatDigestKeys, pruneChatDigests, pruneChatSegments } from "../persistence/clear.ts";
import { resolveTargetGeneration } from "../persistence/generation.ts";

function assertNever(value: never): never {
  throw new Error(`pruneMemoryBlocks: unhandled lens ${String(value)}`);
}

export function createPruneMemoryBlocks(ctx: EmbeddingsContext): EmbeddingsService["pruneMemoryBlocks"] {
  return async (params: PruneMemoryBlocksParams): Promise<void> => {
    const ownerId = await ctx.loadChatHostUserId(params.chatId);
    if (ownerId === null) {
      return;
    }
    const generation = await resolveTargetGeneration(ctx, ownerId, "embed");
    switch (params.lens) {
      case "digest": {
        await pruneChatDigests(ctx.db, params.chatId, params.scopedCharacterId, {
          keepPerTier: params.keepPerTier,
          generationId: generation.id,
        });
        break;
      }
      // The KNOWN-stale reclaim (hash mismatch proved it stale, the re-summarize came back empty).
      case "digest-stale": {
        await dropChatDigestKeys(ctx.db, params.chatId, params.scopedCharacterId, {
          keys: params.keys,
          generationId: generation.id,
        });
        break;
      }
      case "segment": {
        await pruneChatSegments(ctx.db, params.chatId, {
          keepBlockCount: params.keepBlockCount,
          chunkCounts: params.chunkCounts,
          generationId: generation.id,
        });
        break;
      }
      default:
        return assertNever(params);
    }
  };
}
