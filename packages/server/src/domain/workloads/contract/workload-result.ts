// domain/workloads/contract/workload-result — per-kind result vocabulary: workload-owned projections, not
// re-exports of the wrapped verb's return (the runner translates the wrapped op's stats into these shapes,
// so the contract stays stable as wrapped verbs evolve). ResultByKind is the exhaustive map — a kind
// without a result entry fails tsc at Runner<K>'s return.

export interface EmbedPassResult {
  readonly embedded: number;
  readonly skipped: number;
}

export interface AnalyticsResult {
  readonly scanned: number;
  readonly written: number;
}

export interface MaintenanceResult {
  readonly scanned: number;
  readonly changed: number;
  readonly dryRun: boolean;
}

export interface BundleImportWorkloadResult {
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
}

export interface FsckReport {
  readonly danglingRows: number;
  readonly corruptBlobs: number;
  readonly orphanBlobs: number;
}

export interface ReconcileStatsWorkloadResult {
  readonly owners: number;
  readonly characters: number;
}

/** Each lane (OR models, agent-sdk models) is best-effort and independent; a failed lane reports null
 *  (distinct from 0, a real empty catalog). The run only fails when both lanes fail. */
export interface CatalogRefreshResult {
  readonly models: number | null;
  readonly agentSdkModels: number | null;
}

/** deferred:true distinguishes an inert P5/v2-stub run from a real zero-work pass. */
export interface DeferredResult {
  readonly deferred: true;
}

export interface BackfillPassResult {
  readonly scanned: number;
  readonly changed: number;
}

export interface MemoryBackfillResult {
  readonly segments: BackfillPassResult;
  readonly digests: BackfillPassResult;
}

export interface ResultByKind {
  index: EmbedPassResult;
  "distill-characters": AnalyticsResult;
  "compute-themes": AnalyticsResult;
  "memory-backfill": MemoryBackfillResult;
  "group-character-backfill": BackfillPassResult;
  "compute-cooccurrence": AnalyticsResult;
  "find-duplicates": AnalyticsResult;
  csls: AnalyticsResult;
  "assets-backfill": MaintenanceResult;
  "assets-gc": MaintenanceResult;
  "assets-fsck": FsckReport;
  "import-st": MaintenanceResult;
  "import-bundle": BundleImportWorkloadResult;
  "reconcile-stats": ReconcileStatsWorkloadResult;
  "refresh-model-catalog": CatalogRefreshResult;
  "reconcile-world-state": DeferredResult;
  "crew-lorebook-keeper": DeferredResult;
  "crew-card-evolution": DeferredResult;
  "crew-director": DeferredResult;
  "crew-prose-audit": DeferredResult;
  "expressions-sprite-sheet": DeferredResult;
  "databank-ingest": DeferredResult;
  "databank-reindex": DeferredResult;
  "rpg-world-gen": DeferredResult;
  "rpg-recap": DeferredResult;
  "rpg-session-distill": DeferredResult;
  "rpg-director": DeferredResult;
  "rpg-lorebook-upkeep": DeferredResult;
  "rpg-illustration": DeferredResult;
  "rpg-npc-portrait": DeferredResult;
  "rpg-scene-plan": DeferredResult;
  "rpg-scene-distill": DeferredResult;
  "rpg-recruit-card": DeferredResult;
}
