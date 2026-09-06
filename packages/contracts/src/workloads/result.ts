// `@orb/contracts/workloads` — per-kind RESULT vocabulary: the terminal projection a contribution returns,
// stored verbatim in the `workloads.result` JSON column and read back by the client.
//
// A result is a domain↔domain wire shape, so it homes in `contracts` beside its params (the
// `IngestRunResult` precedent — databank's ingest result always lived in `@orb/contracts/databank` and the
// workloads contract referenced it rather than re-spelling a twin; that exception is now the rule). Kinds
// whose owner has its own contracts module are promoted there stage by stage; this module carries the ones
// still awaiting their owner + assembles the exhaustive map.

import type { FsckReport } from "#assets";
import type { BackfillPassResult, MemoryBackfillResult } from "#chat";
import type { CatalogRefreshResult } from "#connection";
import type { IngestRunResult } from "#databank";
import type { AnalyticsResult } from "#discovery";
import type { EmbedPassResult } from "#embeddings";
import type { RefineryScoreSweepResult } from "#refinery";
import type { ReconcileStatsWorkloadResult } from "#stats";

/** A maintenance pass's counts + the `dryRun` echo (assets backfill/gc, import-st). */
export interface MaintenanceResult {
  readonly scanned: number;
  readonly changed: number;
  readonly dryRun: boolean;
  /** import-st only: cards skipped by per-card isolation (a single card's defect never aborts the batch).
   *  Optional — other maintenance kinds have no per-item failure plane. */
  readonly failed?: number;
  /** import-st only: path to the written import report (what landed / what didn't). Absent on a dry run. */
  readonly reportPath?: string;
}

/** A portability bundle import's per-entity tallies. `notes` (#1710) is what a file that DID import still
 *  left behind (a kept edited lorebook, a dropped overlay) — the same operator-facing notes the sync
 *  descriptor-level report already carried (#1688), now surfaced on the BACKGROUND workload's own result so
 *  a run driven off-request is not silently cleaner than the same import run through the sync door. */
export interface BundleImportWorkloadResult {
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
  readonly notes: readonly string[];
}

/** The auditable terminal census for import's variant token catch-up. Every non-write has a named bucket. */
export interface ImportTokenUsageBackfillResult {
  readonly scanned: number;
  readonly exactRecovered: number;
  readonly legacyPromoted: number;
  readonly estimated: number;
  readonly alreadyMeasured: number;
  readonly alreadyEstimated: number;
  readonly compareAndSetSkipped: number;
  readonly ownersScanned: number;
  readonly ownersReconciled: number;
  readonly dryRun: boolean;
}

/** `deferred:true` distinguishes an inert v2-stub run from a real zero-work pass. */
export interface DeferredResult {
  readonly deferred: true;
}

/**
 * kind → its terminal result TYPE. A kind missing an entry here is a tsc error at `WorkloadContributions`
 * (the mapped-type registry indexes this map for every member).
 */
export interface WorkloadResultByKind {
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
  "import-token-usage-backfill": ImportTokenUsageBackfillResult;
  "import-bundle": BundleImportWorkloadResult;
  "reconcile-stats": ReconcileStatsWorkloadResult;
  "refresh-model-catalog": CatalogRefreshResult;
  "reconcile-world-state": DeferredResult;
  "databank-ingest": IngestRunResult;
  "databank-reindex": IngestRunResult;
  "refine-score-sweep": RefineryScoreSweepResult;
}
