// `@orb/contracts/workloads` — per-kind RESULT vocabulary: the terminal projection a contribution returns,
// stored verbatim in the `workloads.result` JSON column and read back by the client.
//
// A result is a domain↔domain wire shape, so it homes in `contracts` beside its params (the
// `IngestRunResult` precedent — databank's ingest result always lived in `@orb/contracts/databank` and the
// workloads contract referenced it rather than re-spelling a twin; that exception is now the rule). Kinds
// whose owner has its own contracts module are promoted there stage by stage; this module carries the ones
// still awaiting their owner + assembles the exhaustive map.

import type { IngestRunResult } from "#databank";

/** An embed pass's counts (`index`). */
export interface EmbedPassResult {
  readonly embedded: number;
  readonly skipped: number;
}

/** A discovery analytics pass's counts. */
export interface AnalyticsResult {
  readonly scanned: number;
  readonly written: number;
}

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

/** The stats rollup rebuild's counts. */
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
