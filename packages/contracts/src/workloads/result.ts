// `@orb/contracts/workloads` — per-kind RESULT vocabulary: the terminal projection a contribution returns,
// stored verbatim in the `workloads.result` JSON column and read back by the client.
//
// A result is a domain↔domain wire shape, so it homes in `contracts` beside its params (the
// `IngestRunResult` precedent — databank's ingest result always lived in `@orb/contracts/databank` and the
// workloads contract referenced it rather than re-spelling a twin; that exception is now the rule). Kinds
// whose owner has its own contracts module are promoted there stage by stage; this module carries the ones
// still awaiting their owner + assembles the exhaustive map.

import { z } from "zod";
import type { FsckReport } from "#assets";
import type { BackfillPassResult, ImportWindow, MemoryBackfillResult } from "#chat";
import type { IngestRunResult } from "#databank";
import type { AnalyticsResult } from "#discovery";
import type { EmbedPassResult } from "#embeddings";
import type { CatalogRefreshResult } from "#inference";
import type { RefineryScoreSweepResult } from "#refinery";
import type { ReconcileStatsWorkloadResult } from "#stats";
import { importWindowSchema } from "../chat/backfill.ts";

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
  /** import-st only: see {@link BundleImportWorkloadResult.memoryScope}. Absent on a dry run. */
  readonly memoryScope?: ImportWindow | null;
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
  /** The span in which this import wrote real conversations, or null when it wrote none (a deduped re-import
   *  writes none). The import enqueues only the free segment pass over it; the client offers "Build memory for
   *  imported chats" over it behind the model-run confirm, as a `memory-backfill` scoped by `importWindow`. */
  readonly memoryScope: ImportWindow | null;
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

export const maintenanceResultSchema = z
  .strictObject({
    scanned: z.number(),
    changed: z.number(),
    dryRun: z.boolean(),
    failed: z.number().optional(),
    reportPath: z.string().optional(),
    memoryScope: importWindowSchema.nullable().optional(),
  })
  .transform(({ failed, reportPath, memoryScope, ...view }) => ({
    ...view,
    ...(failed !== undefined ? { failed } : {}),
    ...(reportPath !== undefined ? { reportPath } : {}),
    ...(memoryScope !== undefined ? { memoryScope } : {}),
  })) satisfies z.ZodType<MaintenanceResult>;

export const bundleImportWorkloadResultSchema = z.strictObject({
  imported: z.number(),
  skipped: z.number(),
  failed: z.number(),
  notes: z.array(z.string()).readonly(),
  // A row stored before imports carried a scope reads as having none: it offers nothing, and still lists.
  memoryScope: importWindowSchema.nullable().default(null),
}) satisfies z.ZodType<BundleImportWorkloadResult>;

export const importTokenUsageBackfillResultSchema = z.strictObject({
  scanned: z.number(),
  exactRecovered: z.number(),
  legacyPromoted: z.number(),
  estimated: z.number(),
  alreadyMeasured: z.number(),
  alreadyEstimated: z.number(),
  compareAndSetSkipped: z.number(),
  ownersScanned: z.number(),
  ownersReconciled: z.number(),
  dryRun: z.boolean(),
}) satisfies z.ZodType<ImportTokenUsageBackfillResult>;

export const deferredResultSchema = z.strictObject({ deferred: z.literal(true) }) satisfies z.ZodType<DeferredResult>;
