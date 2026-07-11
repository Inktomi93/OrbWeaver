// domain/workloads/contract/runner-env — THE one true cross-feature composition seam (§8.1: "the one true
// cross-feature hub — model it, keep it"). It is the TYPED bundle of every
// cross-feature op the runners depend on; the runtime VALUE is built ONCE at the `entry/` composition root
// (the only tier above `domain-no-cross-feature`) and threaded through the worker into every dispatch.
// Runners reach in via `ctx.env.<feature>.<op>` — NEVER a sideways import. It is a STRUCTURED,
// NAMED bundle (NOT a junk drawer): each sub-interface is the MINIMAL op subset that feature's runners use,
// so a feature's full service surface never leaks into workloads.
//
// PARTITION (locked): the embed passes (text+image,
// the ONE write path) → `embeddings`; themes/distill/cooccurrence/duplicates/hub-scores → `discovery`;
// digest/segment gen → `memory`; the group mint → `character`; the catalog snapshot → `connection` (counts
// only — no provider shapes leak); import/assets/stats unchanged in spirit. `cas` stays top-level (an infra
// adapter the image-embed pass consumes, NOT feature-owned).
//
// NOTE: `Cas` is imported from `#infra/storage` (its actual home — the `assets` contract does the same),
// not `@orb/contracts`. The op
// result types are workload-OWNED (`contract/workload-result`) on BOTH sides of the seam — the runner still
// PROJECTS into `ResultByKind` (it does not re-export a sibling's internal result type; invariant intact).

import type { UserId } from "@orb/kit/ids";
import type { Cas } from "#infra/storage";
import type {
  AnalyticsResult,
  BackfillPassResult,
  CatalogRefreshResult,
  EmbedPassResult,
  FsckReport,
  MemoryBackfillResult,
  ReconcileStatsWorkloadResult,
} from "./workload-result";

/** Counts a maintenance/backfill op returns BEFORE the runner adds the `dryRun` echo (→ MaintenanceResult). */
export interface MaintenancePassCounts {
  readonly scanned: number;
  readonly changed: number;
}

// F3/MODE convention: every op a SINGULAR-capable kind drives carries an `ownerId: UserId | null` — `null` =
// the BULK all-owners/cross-tenant pass (the neo global sweep), a `UserId` = the SINGULAR pass scoped to that
// one owner's producers (the runner passes the row's raw `ownerId`; the source domain filters its
// enumeration/read + scopes its writes). Bulk-ONLY ops (reconcile-stats/refresh-model-catalog/cooccurrence)
// carry NO `ownerId` — they have no per-owner concept. For the CREATE-kind `import.importAll`, `ownerId` is the
// TARGET user (bulk = import INTO X; singular = the caller's own).

/** embeddings.* — the ONE vector write path's bulk passes. `force` re-embeds matched rows (else resumable
 *  skip). `ownerId` scopes the enumeration (null = all owners). Consumed by `embed-corpus` / `embed-assets`. */
export interface WorkloadEmbeddingsEnv {
  readonly embedCorpus: (args: {
    ownerId: UserId | null;
    force: boolean;
    signal: AbortSignal;
  }) => Promise<EmbedPassResult>;
  readonly embedAssets: (args: {
    ownerId: UserId | null;
    force: boolean;
    signal: AbortSignal;
  }) => Promise<EmbedPassResult>;
}

/** discovery.* — the semantics passes. `computeHubScores` is the CSLS write-back: discovery COMPUTES then
 *  calls `embeddings.writeHubScores` (the column owner) internally — workloads sees one op. `ownerId` scopes
 *  to one owner (null = all/cross-tenant). `computeCooccurrence` is bulk-only (no per-owner concept). Consumed
 *  by `compute-themes`/`distill-characters`/`compute-cooccurrence`/`find-duplicates`/`csls`. */
export interface WorkloadDiscoveryEnv {
  readonly computeThemes: (args: {
    ownerId: UserId | null;
    k: number;
    signal: AbortSignal;
  }) => Promise<AnalyticsResult>;
  readonly distillCharacters: (args: {
    ownerId: UserId | null;
    signal: AbortSignal;
  }) => Promise<AnalyticsResult>;
  readonly computeCooccurrence: (args: { signal: AbortSignal }) => Promise<AnalyticsResult>;
  readonly findDuplicates: (args: {
    ownerId: UserId | null;
    signal: AbortSignal;
  }) => Promise<AnalyticsResult>;
  readonly computeHubScores: (args: {
    ownerId: UserId | null;
    signal: AbortSignal;
  }) => Promise<AnalyticsResult>;
}

/** import.* — the ST bulk import loop (collect → import each → post-import reconcile). `ownerId` is the TARGET
 *  the imported rows are minted under (a CREATE-kind — singular = the caller's own, bulk = the designated
 *  user X; never `null` for import). Provided by `import`. Consumed by `import-st`. */
export interface WorkloadImportEnv {
  readonly importAll: (args: {
    ownerId: UserId;
    dryRun: boolean;
    signal: AbortSignal;
  }) => Promise<MaintenancePassCounts>;
}

/** assets.* — the GC/backfill/fsck maintenance verbs that RUN AS WORKLOADS (PD-26). `backfillAvatars`
 *  re-pairs avatar refs (`ownerId` scopes to one owner, null = all — the SWEEP-kind); `collectGarbage` is the
 *  grace-windowed mark-sweep GC; `fsck` is the read-only integrity report. GC/fsck are global BOX-OWNER passes
 *  (no per-owner concept). Provided by `assets` at the root; consumed by `assets-backfill`/`assets-gc`/
 *  `assets-fsck`. The op result types are workload-OWNED (the runner PROJECTS the domain's richer result). */
export interface WorkloadAssetsEnv {
  readonly backfillAvatars: (args: {
    ownerId: UserId | null;
    dryRun: boolean;
    signal: AbortSignal;
  }) => Promise<MaintenancePassCounts>;
  readonly collectGarbage: (args: {
    dryRun: boolean;
    signal: AbortSignal;
  }) => Promise<MaintenancePassCounts>;
  readonly fsck: (args: { signal: AbortSignal }) => Promise<FsckReport>;
}

/** stats.* — the rollup rebuild from canon (the `reconcile-stats` workload + the import post-settle).
 *  `ownerId` scopes to ONE owner (SINGULAR — rebuild MY rollups; the underlying pass is per-owner-native);
 *  null = every owner (BULK). Provided by `stats` (`reconcileStats`). Consumed by `reconcile-stats`/`import-st`. */
export interface WorkloadStatsEnv {
  readonly reconcileStats: (args: {
    ownerId: UserId | null;
    signal: AbortSignal;
  }) => Promise<ReconcileStatsWorkloadResult>;
}

/** connection.* — the provider catalog snapshot refreshes, COUNTS ONLY (no provider entry shapes cross
 *  into the workloads contract — the adapter discipline). `refreshCatalogSnapshot` runs BOTH provider
 *  catalog refreshes (OpenRouter `/models` + the agent-sdk daemon `supportedModels()` map) and returns both
 *  counts. Provided by `connection`. Consumed by `refresh-model-catalog`. */
export interface WorkloadConnectionEnv {
  readonly refreshCatalogSnapshot: (args: { signal: AbortSignal }) => Promise<CatalogRefreshResult>;
}

/**
 * memory.* (PD-41 cleared): the corpus-wide memory backfill — chat's `backfillMemory` sweep (enumerate
 * every chat × scope bucket; run the SAME idempotent segment/digest builds the engine's post-turn trigger
 * uses; fold the counts). Wired at the root from the chat compose product (the sweep needs the full
 * `ChatContext` — summarizer/embeddings/regex ops — so the env is built AFTER chat).
 */
export interface WorkloadMemoryEnv {
  readonly backfill: (args: {
    ownerId: UserId | null;
    signal: AbortSignal;
  }) => Promise<MemoryBackfillResult>;
}

/**
 * character.* (PD-41 cleared): the synthetic group-character backfill — chat's `backfillGroupCharacters`
 * sweep (every `>1`-character room lacking its shared group character gets one minted under the room HOST;
 * idempotent via the find-first short-circuit).
 */
export interface WorkloadCharacterEnv {
  readonly backfillGroupCharacters: (args: {
    ownerId: UserId | null;
    signal: AbortSignal;
  }) => Promise<BackfillPassResult>;
}

/**
 * The full cross-feature op bundle the runner context closes over (`ctx.env`). Built ONCE at `entry/` from
 * the real service factories; the worker threads it into every dispatch. Adding a runner that wraps a new
 * verb = add the op to a sub-env here + wire it at `entry/` (one mechanical edit per layer, no rule change).
 */
export interface WorkloadRunnerEnv {
  readonly embeddings: WorkloadEmbeddingsEnv;
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
