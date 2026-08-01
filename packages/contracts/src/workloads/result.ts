// `@orb/contracts/workloads` — per-kind RESULT vocabulary: the terminal projection a contribution returns,
// stored verbatim in the `workloads.result` JSON column and read back by the client.
//
// A result is a domain↔domain wire shape, so it homes in `contracts` beside its params (the
// `IngestRunResult` precedent — databank's ingest result always lived in `@orb/contracts/databank` and the
// workloads contract referenced it rather than re-spelling a twin; that exception is now the rule). Kinds
// whose owner has its own contracts module are promoted there stage by stage; this module carries the ones
// still awaiting their owner + assembles the exhaustive map.

import type { CatalogRefreshResult } from "#connection";
import type { IngestRunResult } from "#databank";
import type { AnalyticsResult } from "#discovery";
import type { EmbedPassResult } from "#embeddings";
import type { ReconcileStatsWorkloadResult } from "#stats";

/** A maintenance pass's counts + the `dryRun` echo (assets backfill/gc, import-st). */
export interface MaintenanceResult {
  readonly scanned: number;
  readonly changed: number;
  readonly dryRun: boolean;
}

/** A portability bundle import's per-entity tallies. */
export interface BundleImportWorkloadResult {
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
}

/** The asset-store integrity report (`assets-fsck`) — the three fault counts ARE the product of the run. */
export interface FsckReport {
  readonly danglingRows: number;
  readonly corruptBlobs: number;
  readonly orphanBlobs: number;
}

/** `deferred:true` distinguishes an inert v2-stub run from a real zero-work pass. */
export interface DeferredResult {
  readonly deferred: true;
}

/** A backfill sweep's scan/change counts. */
export interface BackfillPassResult {
  readonly scanned: number;
  readonly changed: number;
}

export interface MemoryBackfillResult {
  readonly segments: BackfillPassResult;
  readonly digests: BackfillPassResult;
  /** Chats whose per-chat build threw an UNEXPECTED error and were isolated-and-skipped (structural twin of
   *  chat's `MemoryBackfillCounts.failed`, #41). A non-silent skip: the sweep survives one bad chat, but the
   *  failure lands in the durable result JSON (and an `error`-level log), never vanishing without a trace. */
  readonly failed: number;
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
  "import-bundle": BundleImportWorkloadResult;
  "reconcile-stats": ReconcileStatsWorkloadResult;
  "refresh-model-catalog": CatalogRefreshResult;
  "reconcile-world-state": DeferredResult;
  "databank-ingest": IngestRunResult;
  "databank-reindex": IngestRunResult;
}
