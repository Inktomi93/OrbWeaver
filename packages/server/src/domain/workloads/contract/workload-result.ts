// domain/workloads/contract/workload-result — per-kind result vocabulary: workload-owned projections, not
// re-exports of the wrapped verb's return (the runner translates the wrapped op's stats into these shapes,
// so the contract stays stable as wrapped verbs evolve). ResultByKind is the exhaustive map — a kind
// without a result entry fails tsc at Runner<K>'s return.
//
// `IngestRunResult` (databank-ingest/reindex) is the one exception: it is a cross-boundary shape owned by
// `@orb/contracts/databank` (the workload row carries it as its result JSON the client reads), so the two
// databank kinds reference it directly rather than re-spelling a workload-local twin (one home, D34).


import type { IngestRunResult } from "@orb/contracts/databank";
import type { AssetId, MessageId } from "@orb/kit/ids";

export interface EmbedPassResult {
  readonly embedded: number;
  readonly skipped: number;
}

export interface AnalyticsResult {
  readonly scanned: number;
  readonly written: number;
}

interface MaintenanceResult {
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
interface DeferredResult {
  readonly deferred: true;
}

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

/** The `expressions-sprite-sheet` job result (expressions-design/03 §2) — the workload-owned projection the
 *  row carries as its result JSON. `written` == labels.length on success; `sheetAssetId` is the KEPT un-sliced
 *  sheet (§6, the review/re-slice artifact); `model`/`costUsd` are the imagery provenance. The expressions
 *  pass produces a structural twin; the runner-env member returns it under this contract type. */
export interface SpriteSheetJobResult {
  readonly written: number;
  readonly labels: readonly string[];
  readonly sheetAssetId: AssetId;
  readonly model: string;
  readonly costUsd: number | null;
}

/** The compiled prompt a `dryRun` image workload returns for host review before spending (rpg-design/08 §2
 *  preview-before-spend); `null` on a real (non-dryRun) run. */
interface ImagePreview {
  readonly prompt: string;
  readonly negative: string;
}

/** `rpg-npc-portrait` result (rpg-design/10 §R9): the stored/reused portrait asset (null on a dryRun / a no-op /
 *  an honest capability refusal), whether the reuse gate short-circuited, whether the run refused for lack of an
 *  image-capable model (the story is never blocked — 08 §4), and the dryRun preview. */
export interface RpgNpcPortraitJobResult {
  readonly assetId: AssetId | null;
  readonly reused: boolean;
  readonly refusedNoCapability: boolean;
  readonly preview: ImagePreview | null;
}

/** `rpg-illustration` result (rpg-design/10 §R9): the narrator message the art landed in (null on a
 *  dryRun / a cadence skip / a refusal), whether it posted, whether the cadence gate skipped it (08 §3),
 *  whether it refused for lack of capability (08 §4), and the dryRun preview. Illustrations are never reused. */
export interface RpgIllustrationJobResult {
  readonly messageId: MessageId | null;
  readonly posted: boolean;
  readonly skippedCadence: boolean;
  readonly refusedNoCapability: boolean;
  readonly preview: ImagePreview | null;
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
  "databank-ingest": IngestRunResult;
  "databank-reindex": IngestRunResult;
}
