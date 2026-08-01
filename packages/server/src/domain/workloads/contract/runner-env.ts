// domain/workloads/contract/runner-env — the RETIRING cross-feature hub (the junk-drawer exit).
//
// This file WAS "the one true cross-feature composition seam": the licensed backdoor that let any domain's
// capability be bolted onto workloads instead of built as a proper injected-op seam at the owning domain's
// door. It is being emptied one stage at a time — each sub-interface dies when its kinds re-home as
// `WorkloadContribution`s in their owning domain. What is left below is only what the not-yet-moved
// `runners/` still read. NOTHING may be added here.

import type { IngestRunResult, ReindexMode, ReindexScope } from "@orb/contracts/databank";
import type { ReconcileStatsWorkloadResult } from "@orb/contracts/stats";
import type { BundleImportWorkloadResult } from "@orb/contracts/workloads";
import type { DocumentId, UserId } from "@orb/kit/ids";

/** Counts a maintenance/backfill op returns BEFORE the runner adds the `dryRun` echo (→ MaintenanceResult). */
interface MaintenancePassCounts {
  readonly scanned: number;
  readonly changed: number;
}

// Every op a singular-capable kind drives carries an `ownerId: UserId | null` — `null` = the bulk
// all-owners pass, a `UserId` = scoped to that one owner. Bulk-only ops carry no `ownerId`.

/** embeddings.* — the old-document-embed-space reclaim the databank-reindex runner fires after a BULK
 *  sweep. (Every other embeddings op has MOVED to its owning domain's contribution factory.) */
export interface WorkloadEmbeddingsEnv {
  /** PD-139(c): reclaim the OLD document embed space (`document_chunks`) after a BULK databank-reindex
   *  re-embeds every chunk into the box's active space. The databank-reindex runner calls it only for the
   *  box-global (`ownerId === null`) pass, after the sweep, and never on abort — the same bulk-only +
   *  skip-on-abort guard. */
  readonly purgeDocumentVectors: () => Promise<void>;
}

/** databank.* — the document-RAG ingest passes (chunk→embed→prune), reached through the injected env so the
 *  runner never touches `document_chunks` or the databank tables directly. `ingest` handles ONE freshly
 *  uploaded document (the post-upload lane); `reindex` re-runs the derived layer for one document or every
 *  document of an owner (`ownerId === null` = the box-wide bulk sweep). Both report an {@link IngestRunResult}. */
export interface WorkloadDatabankEnv {
  readonly ingest: (args: { documentId: DocumentId; signal: AbortSignal }) => Promise<IngestRunResult>;
  readonly reindex: (args: { ownerId: UserId | null; scope: ReindexScope; mode: ReindexMode; signal: AbortSignal }) => Promise<IngestRunResult>;
}

/** import.* — the two import passes, both create-kind (`ownerId` is the target, never `null`). `importAll`
 *  is the ST bulk profile loop; `importBundle` reads one staged portability zip. */
export interface WorkloadImportEnv {
  readonly importAll: (args: {
    ownerId: UserId;
    dryRun: boolean;
    /** A staged folder-upload override (a token resolved under the staging root); absent ⇒ the env default
     *  ST profile dir. The folder-import route enqueues this for a picked ST profile/`data` tree. */
    stagedDir?: string;
    signal: AbortSignal;
  }) => Promise<MaintenancePassCounts>;
  readonly importBundle: (args: {
    ownerId: UserId;
    token: string;
    /** `"zip"` (default) reads the staged single archive; `"dir"` reads a staged folder-upload tree (the
     *  token names a directory under the staging root, consumed via `stageDirectory`). */
    source?: "zip" | "dir";
    signal: AbortSignal;
  }) => Promise<BundleImportWorkloadResult>;
}

/** stats.* — the rollup rebuild from canon (the `reconcile-stats` workload + the import post-settle). */
export interface WorkloadStatsEnv {
  readonly reconcileStats: (args: { ownerId: UserId | null; signal: AbortSignal }) => Promise<ReconcileStatsWorkloadResult>;
}

/** The full cross-feature op bundle the runner context closes over (`ctx.env`). */
export interface WorkloadRunnerEnv {
  readonly embeddings: WorkloadEmbeddingsEnv;
  readonly databank: WorkloadDatabankEnv;
  readonly import: WorkloadImportEnv;
  readonly stats: WorkloadStatsEnv;
}
