// domain/embeddings — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). The
// `EmbeddingsContext` is assembled at the entry root (db + the bound `roleClients` + the injected clock/id
// determinism seam + the enumeration/canon re-read ops + the declared space dims) and passed in; the
// indexer is a separate subsystem wired via `createEmbeddingsIndexer`. The bulk passes receive the
// bound `store` verb + the indexer's caption generator as EXPLICIT deps here (domain-no-cross-verb /
// domain-substrate-mediates-subsystems — the composition point is this file, never a verb-to-verb import).

import type { EmbeddingsContext } from "./context.ts";
import type { AvatarAnalysis } from "./contract/results.ts";
import type { EmbeddingsService } from "./contract/service.ts";
import { analyzeAvatarImage } from "./indexer/caption.ts";
import { resolveTargetGeneration } from "./substrate/generation.ts";
import { createClearTable } from "./verbs/clear-table.ts";
import { createCountDocumentChunks } from "./verbs/count-document-chunks.ts";
import { createCountDocumentChunksByOwner } from "./verbs/count-document-chunks-by-owner.ts";
import { createEmbedAssets } from "./verbs/embed-assets.ts";
import { createEmbedCorpus } from "./verbs/embed-corpus.ts";
import { createPruneDocumentChunks } from "./verbs/prune-document-chunks.ts";
import { createPruneMemoryBlocks } from "./verbs/prune-memory-blocks.ts";
import { createPurgeDocumentVectors } from "./verbs/purge-document-vectors.ts";
import { createPurgeMemoryVectors } from "./verbs/purge-memory-vectors.ts";
import { createStore } from "./verbs/store.ts";
import { createStoreSegments } from "./verbs/store-segments.ts";
import { createWriteHubScores } from "./verbs/write-hub-scores.ts";

export function createEmbeddingsService(ctx: EmbeddingsContext): EmbeddingsService {
  const store = createStore(ctx);
  return {
    resolveGeneration: (ownerId, task, via) => resolveTargetGeneration(ctx, ownerId, task, via),
    store,
    storeSegments: createStoreSegments(ctx),
    writeHubScores: createWriteHubScores(ctx),
    clearTable: createClearTable(ctx),
    embedCorpus: createEmbedCorpus(ctx, { store }),
    embedAssets: createEmbedAssets(ctx, {
      store,
      analyze: async (ownerId, bytes): Promise<AvatarAnalysis> => analyzeAvatarImage(await ctx.roleClientsFor(ownerId), bytes),
    }),
    purgeMemoryVectors: createPurgeMemoryVectors(ctx),
    pruneDocumentChunks: createPruneDocumentChunks(ctx),
    pruneMemoryBlocks: createPruneMemoryBlocks(ctx),
    purgeDocumentVectors: createPurgeDocumentVectors(ctx),
    countDocumentChunks: createCountDocumentChunks(ctx),
    countDocumentChunksByOwner: createCountDocumentChunksByOwner(ctx),
  };
}
