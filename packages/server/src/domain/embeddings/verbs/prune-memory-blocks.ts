// verb: pruneMemoryBlocks — the chat-memory SHRINK seam (stickler 2026-08-08 canon-message-identity, leg-2
// refutation). memory's build STORES every block that currently exists, then calls this to reclaim the ones
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

import { chatParticipants } from "@orb/db";
import { and, eq, isNull } from "drizzle-orm";
import type { EmbeddingsContext } from "../context.ts";
import type { PruneMemoryBlocksParams } from "../contract/params.ts";
import type { PruneMemoryBlocksResult } from "../contract/results.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import { dropChatDigestKeys, pruneChatDigests, pruneChatSegments } from "../persistence/clear.ts";
import { resolveTargetGeneration } from "../substrate/generation.ts";

function assertNever(value: never): never {
  throw new Error(`pruneMemoryBlocks: unhandled lens ${String(value)}`);
}

export function createPruneMemoryBlocks(ctx: EmbeddingsContext): EmbeddingsService["pruneMemoryBlocks"] {
  return async (params: PruneMemoryBlocksParams): Promise<PruneMemoryBlocksResult> => {
    const host = await ctx.db
      .select({ ownerId: chatParticipants.userId })
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, params.chatId), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq)))
      .limit(1);
    const generation = host[0]?.ownerId === null || host[0]?.ownerId === undefined ? null : await resolveTargetGeneration(ctx, host[0].ownerId, "embed");
    if (generation === null) {
      return { rowsDeleted: 0 };
    }
    switch (params.lens) {
      case "digest": {
        const rowsDeleted = await pruneChatDigests(ctx.db, params.chatId, params.scopedCharacterId, {
          keepPerTier: params.keepPerTier,
          generationId: generation.id,
        });
        return { rowsDeleted };
      }
      // #1395 — the KNOWN-stale reclaim (hash mismatch proved it stale, the re-summarize came back empty).
      case "digest-stale": {
        const rowsDeleted = await dropChatDigestKeys(ctx.db, params.chatId, params.scopedCharacterId, {
          keys: params.keys,
          generationId: generation.id,
        });
        return { rowsDeleted };
      }
      case "segment": {
        const rowsDeleted = await pruneChatSegments(ctx.db, params.chatId, {
          keepBlockCount: params.keepBlockCount,
          chunkCounts: params.chunkCounts,
          generationId: generation.id,
        });
        return { rowsDeleted };
      }
      default:
        return assertNever(params);
    }
  };
}
