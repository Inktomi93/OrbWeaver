// domain/workloads/contract/runner-env — the one true cross-feature composition seam. The typed bundle of
// every cross-feature op the runners depend on; the runtime value is built once at the `entry/` composition
// root and threaded through the worker into every dispatch. Runners reach in via `ctx.env.<feature>.<op>`,
// never a sideways import; each sub-interface is the minimal op subset that feature's runners use.


import type { IngestRunResult, ReindexMode, ReindexScope } from "@orb/contracts/databank";


import type { DocumentId, UserId } from "@orb/kit/ids";
import type { Cas } from "#infra/storage";
import type { ParamsByKind } from "./workload-params";
import type {
  AnalyticsResult,
  BackfillPassResult,
  BundleImportWorkloadResult,
  CatalogRefreshResult,
  EmbedPassResult,
  FsckReport,
  MemoryBackfillResult,
  ReconcileStatsWorkloadResult,

} from "./workload-result";
import type { ReportProgress } from "./workload-state";

/** Counts a maintenance/backfill op returns BEFORE the runner adds the `dryRun` echo (→ MaintenanceResult). */
interface MaintenancePassCounts {
  readonly scanned: number;
  readonly changed: number;
}

// Every op a singular-capable kind drives carries an `ownerId: UserId | null` — `null` = the bulk
// all-owners pass, a `UserId` = scoped to that one owner. Bulk-only ops carry no `ownerId`.

/** embeddings.* — the one vector write path's bulk passes. `force` re-embeds matched rows (else resumable skip). */
export interface WorkloadEmbeddingsEnv {
  readonly embedCorpus: (args: { ownerId: UserId | null; force: boolean; signal: AbortSignal }) => Promise<EmbedPassResult>;
  readonly embedAssets: (args: { ownerId: UserId | null; force: boolean; signal: AbortSignal }) => Promise<EmbedPassResult>;
  /** PD-139(b): reclaim the OLD chat-memory embed space (`chat_segments`/`chat_digests`) after a BULK
   *  memory-backfill. The memory-backfill runner calls it only for the box-global pass, after the sweep,
   *  and never on abort — the bulk-only + skip-on-abort guard the embedCorpus/embedAssets purge also uses. */
  readonly purgeMemoryVectors: () => Promise<void>;
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

/** discovery.* — the semantics passes. `computeHubScores` computes then writes back internally — workloads
 *  sees one op. `computeCooccurrence` is bulk-only. */
export interface WorkloadDiscoveryEnv {
  readonly computeThemes: (args: { ownerId: UserId | null; k: number; signal: AbortSignal }) => Promise<AnalyticsResult>;
  readonly distillCharacters: (args: { ownerId: UserId | null; signal: AbortSignal }) => Promise<AnalyticsResult>;
  readonly computeCooccurrence: (args: { signal: AbortSignal }) => Promise<AnalyticsResult>;
  readonly findDuplicates: (args: { ownerId: UserId | null; signal: AbortSignal }) => Promise<AnalyticsResult>;
  readonly computeHubScores: (args: { ownerId: UserId | null; signal: AbortSignal }) => Promise<AnalyticsResult>;
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

/** assets.* — the GC/backfill/fsck maintenance verbs that run as workloads. `collectGarbage` is the
 *  grace-windowed mark-sweep GC; `fsck` is the read-only integrity report (both global, no per-owner concept). */
export interface WorkloadAssetsEnv {
  readonly backfillAvatars: (args: { ownerId: UserId | null; dryRun: boolean; signal: AbortSignal }) => Promise<MaintenancePassCounts>;
  readonly collectGarbage: (args: { dryRun: boolean; signal: AbortSignal }) => Promise<MaintenancePassCounts>;
  readonly fsck: (args: { signal: AbortSignal }) => Promise<FsckReport>;
}

/** stats.* — the rollup rebuild from canon (the `reconcile-stats` workload + the import post-settle). */
export interface WorkloadStatsEnv {
  readonly reconcileStats: (args: { ownerId: UserId | null; signal: AbortSignal }) => Promise<ReconcileStatsWorkloadResult>;
}

/** connection.* — the provider catalog snapshot refreshes, counts only (no provider entry shapes cross into
 *  the workloads contract). Runs both the OpenRouter and agent-sdk catalog refreshes. */
export interface WorkloadConnectionEnv {
  readonly refreshCatalogSnapshot: (args: { signal: AbortSignal }) => Promise<CatalogRefreshResult>;
}

/** memory.* — the corpus-wide memory backfill (enumerates every chat × scope bucket, runs the same
 *  idempotent segment/digest builds the engine's post-turn trigger uses). */
export interface WorkloadMemoryEnv {
  readonly backfill: (args: { ownerId: UserId | null; signal: AbortSignal }) => Promise<MemoryBackfillResult>;
}

/** character.* — the synthetic group-character backfill; idempotent via the find-first short-circuit. */
export interface WorkloadCharacterEnv {
  readonly backfillGroupCharacters: (args: { ownerId: UserId | null; signal: AbortSignal }) => Promise<BackfillPassResult>;
}



/** The full cross-feature op bundle the runner context closes over (`ctx.env`). */
export interface WorkloadRunnerEnv {
  readonly embeddings: WorkloadEmbeddingsEnv;
  readonly databank: WorkloadDatabankEnv;
  readonly discovery: WorkloadDiscoveryEnv;
  readonly import: WorkloadImportEnv;
  readonly assets: WorkloadAssetsEnv;
  readonly stats: WorkloadStatsEnv;
  readonly connection: WorkloadConnectionEnv;
  readonly memory: WorkloadMemoryEnv;
  readonly character: WorkloadCharacterEnv;

  /** infra/storage blob bytes — the image-embed pass reads originals through it (NOT feature-owned). */
  readonly cas: Cas;
}
