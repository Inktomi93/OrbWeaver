// The Embedding and memory row and result shapes; the reads that return them live in the rows tier (`rows/embedding-generation.ts`).

import type {
  characterEmbeddings,
  chatDigestSpeakers,
  chatDigests,
  chatSegments,
  documentChunks,
  embeddingCalls,
  embedGenerations,
  embedGenerationTargets,
  embedSpaceState,
  imageAnalyses,
  imageEmbeddings,
  imageIndexSkips,
} from "@orb/db";
import type { EmbeddingsService } from "@orb/server/domain/embeddings";

type EmbedGenerationRow = typeof embedGenerations.$inferSelect;
type EmbedGenerationTargetRow = typeof embedGenerationTargets.$inferSelect;
type EmbeddingCallRow = typeof embeddingCalls.$inferSelect;
type CharacterEmbeddingRow = typeof characterEmbeddings.$inferSelect;
type EmbedSpaceStateRow = typeof embedSpaceState.$inferSelect;
type ImageEmbeddingRow = typeof imageEmbeddings.$inferSelect;
type ImageAnalysisRow = typeof imageAnalyses.$inferSelect;
type ImageIndexSkipRow = typeof imageIndexSkips.$inferSelect;
type ChatDigestRow = typeof chatDigests.$inferSelect;
type ChatSegmentRow = typeof chatSegments.$inferSelect;
type ChatDigestSpeakerRow = typeof chatDigestSpeakers.$inferSelect;
export type DocumentChunkRow = typeof documentChunks.$inferSelect;

export interface CapturedChatMemoryRows {
  readonly digests: readonly ChatDigestRow[];
  readonly segments: readonly ChatSegmentRow[];
  readonly speakers: readonly ChatDigestSpeakerRow[];
}

export interface SeededEmbeddingGeneration {
  readonly generation: EmbedGenerationRow;
  readonly target: EmbedGenerationTargetRow;
}

export interface SeededEmbeddedCorpus {
  readonly result: Awaited<ReturnType<EmbeddingsService["embedCorpus"]>>;
  readonly vectors: readonly CharacterEmbeddingRow[];
  readonly calls: readonly EmbeddingCallRow[];
  readonly states: readonly EmbedSpaceStateRow[];
}

export interface SeededIndexedAsset {
  readonly result: Awaited<ReturnType<EmbeddingsService["indexAsset"]>>;
  readonly vectors: readonly ImageEmbeddingRow[];
  readonly analysis: ImageAnalysisRow | undefined;
  readonly skip: ImageIndexSkipRow | undefined;
}
