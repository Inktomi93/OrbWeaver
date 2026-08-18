import type { ImageCaptionMeta } from "@orb/contracts/embeddings";

/** noop = content_hash unchanged, no re-embed/write happened; written = a fresh insert or hash-changed update landed. */
export interface StoreResult {
  readonly outcome: "noop" | "written";
  readonly contentHash: string;
}

export interface WriteHubScoresResult {
  readonly rowsUpdated: number;
}

/** One avatar's VL analysis (issue #164), already in the two column shapes the store verb takes: the sentence
 *  for `caption`, and the provenance+facets blob for `caption_meta`. An EMPTY caption is the skip signal —
 *  the store verb writes nothing and the next sweep retries the asset — and always arrives with a facetless
 *  meta. It carries the STORED shapes rather than raw facets because the bulk sweep consumes this through an
 *  INJECTED dep (a verb may not import a named subsystem), so a meta-building helper exported from the
 *  indexer would be unreachable from the one place that needs it. */
export interface AvatarAnalysis {
  readonly caption: string;
  readonly captionMeta: ImageCaptionMeta;
}

/** What the catch-up sweep needs to decide whether an asset's CAPTIONED lens is current: the bytes' hash and
 *  whether the stored `caption_meta` carries an actual facet breakdown.
 *
 *  `hasFacets` is `false` for every row written before the 2026-08-18 VL breakdown landed — those carry
 *  `{model}` only, and that is the ONLY signal a backfill has for finding them (the bytes hash still matches,
 *  so a hash-only currency test declares them current and the facet columns stay empty forever). */
export interface ExistingCaptionedRow {
  readonly hash: string;
  readonly hasFacets: boolean;
}

/** Resumable: embedded = items with at least one fresh vector row this run; skipped = already embedded or vanished. */
export interface BulkEmbedResult {
  readonly embedded: number;
  readonly skipped: number;
}

/** PD-139(b): rows reclaimed from the OLD embed space by the chat-memory purge — one count per model-keyed
 *  chat-memory vector table. */
export interface PurgeMemoryVectorsResult {
  readonly segments: number;
  readonly digests: number;
}

/** Rows deleted by the chat-memory shrink prune — blocks that no longer exist in canon (and, for digests,
 *  the consolidations that folded them). Zero on every ordinary build; non-zero exactly when the ingest set
 *  shrank, which makes it the observability signal for a leak that used to be silent. */
export interface PruneMemoryBlocksResult {
  readonly rowsDeleted: number;
}

/** databank-design/05 §2.4 — rows deleted by the reindex-shrink prune (shrunk tail + retired-space rows). */
export interface PruneDocumentChunksResult {
  readonly rowsDeleted: number;
}

/** PD-139(c): rows reclaimed from the OLD embed space by the document-chunk purge — the databank arm of the
 *  PD-104 model-change reclaim, mirroring {@link PurgeMemoryVectorsResult}. */
export interface PurgeDocumentVectorsResult {
  readonly chunks: number;
}
