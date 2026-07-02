// entry/compose/runner-env — builds THE one true cross-feature hub, the `WorkloadRunnerEnv`
// (domain/workloads/contract/runner-env; core/Tier-5-Entry.md §layout "runner-env.ts"). It is the TYPED bundle of
// every cross-feature op the workload runners depend on; the runtime VALUE is assembled HERE (the only tier
// above `domain-no-cross-feature`) and threaded by the worker into every dispatch. Each op is wired to the
// real backing domain verb where it EXISTS; ops whose backing verb is DEFERRED are typed INERT seams that
// reject with a clear "not built (PD-xx)" message — never a fake success (the prompt's inert-stub pattern).
//
// WIRED (real backing verbs):
//   • embeddings.embedCorpus / embedAssets → the PD-53 bulk catch-up sweeps on EmbeddingsService (resumable,
//     content_hash-gated; result reshaped into the workload-owned EmbedPassResult — the adapter discipline).
//   • discovery.computeThemes / findDuplicates / computeHubScores → DiscoveryService verbs (result reshaped
//     into the workload-owned AnalyticsResult — the adapter discipline; the workload contract never imports
//     a sibling's result type).
//   • stats.reconcileStats → the standalone `reconcileStats(db, {now, signal})` write substrate.
//   • connection.refreshCatalogSnapshot → `connection.refreshCatalog` (counts only — no provider shapes leak).
//   • cas → the injected infra/storage blob store (the image-embed pass reads originals through it).
// INERT (DEFERRED — no backing verb in the current slices; named precisely so a run fails loud, not silent):
//   • discovery.distillCharacters / computeCooccurrence — PD-40 (deferred discovery corpus surface).
//   • import.importAll — built by the `entry/import/run-profile-import` driver (a later entry slice).
//   • assets.* (backfillAvatars / collectGarbage / fsck) — PD-26 (the assets GC/backfill wave).
// WIRED (PD-41 cleared): memory.backfill + character.backfillGroupCharacters — chat's corpus sweeps,
//   handed in as BOUND ops from the chat compose product (the sweeps need the full ChatContext, so the
//   env is built AFTER chat at the root).

import type { Db } from "@orb/db";
import type { ConnectionService } from "#domain/connection";
import type { DiscoveryService } from "#domain/discovery";
import type { EmbeddingsService } from "#domain/embeddings";
import { reconcileStats } from "#domain/stats";
import type {
  WorkloadCharacterEnv,
  WorkloadConnectionEnv,
  WorkloadDiscoveryEnv,
  WorkloadEmbeddingsEnv,
  WorkloadMemoryEnv,
  WorkloadRunnerEnv,
  WorkloadStatsEnv,
} from "#domain/workloads";
import type { Cas } from "#infra/storage";

// Workload-owned result shapes derived from the front-door-exported sub-env interfaces (no deep import of
// the internal `workload-result` contract — which would breach `domain-feature-front-door`; no re-spell).
type DiscoveryOut = Awaited<ReturnType<WorkloadDiscoveryEnv["computeThemes"]>>;
type StatsOut = Awaited<ReturnType<WorkloadStatsEnv["reconcileStats"]>>;
type CatalogOut = Awaited<ReturnType<WorkloadConnectionEnv["refreshCatalogSnapshot"]>>;
type EmbedOut = Awaited<ReturnType<WorkloadEmbeddingsEnv["embedCorpus"]>>;

/** What the runner-env builder needs from the composition root — the db + clock + the cas handle + the
 *  slices of the real services whose verbs back a wired op. */
export interface RunnerEnvDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly cas: Cas;
  readonly discovery: Pick<
    DiscoveryService,
    "computeThemes" | "computeDuplicatePairs" | "computeCharacterHubScores"
  >;
  readonly connection: Pick<ConnectionService, "refreshCatalog">;
  /** The PD-53 bulk embed passes (resumable, content_hash-gated catch-up sweeps). */
  readonly embeddings: Pick<EmbeddingsService, "embedCorpus" | "embedAssets">;
  /** Chat's PD-41 corpus sweeps, BOUND over the chat ctx at the root (built after chat). */
  readonly memoryBackfill: WorkloadMemoryEnv["backfill"];
  readonly groupCharacterBackfill: WorkloadCharacterEnv["backfillGroupCharacters"];
}

/** A typed inert seam for a DEFERRED op — rejects loudly (never fakes a success). The arg is ignored; the
 *  `() => Promise<never>` shape is assignable to any `(args) => Promise<X>` env op. */
function notBuilt(label: string): () => Promise<never> {
  return (): Promise<never> => Promise.reject(new Error(`workloads runner-env: ${label}`));
}

/** Assemble the cross-feature `WorkloadRunnerEnv` ONCE at boot (the worker threads it into every dispatch). */
export function buildWorkloadRunnerEnv(deps: RunnerEnvDeps): WorkloadRunnerEnv {
  return {
    // PD-53 cleared: the bulk catch-up sweeps (resumable, content_hash-gated) back the embed workloads.
    // The domain's BulkEmbedResult is projected field-for-field into the workload-owned EmbedPassResult
    // (the adapter discipline — structurally identical today, decoupled by design).
    embeddings: {
      embedCorpus: async ({ force, signal }): Promise<EmbedOut> => {
        const r = await deps.embeddings.embedCorpus({ force, signal });
        return { embedded: r.embedded, skipped: r.skipped };
      },
      embedAssets: async ({ force, signal }): Promise<EmbedOut> => {
        const r = await deps.embeddings.embedAssets({ force, signal });
        return { embedded: r.embedded, skipped: r.skipped };
      },
    },
    discovery: {
      computeThemes: async ({ k }): Promise<DiscoveryOut> => {
        const stats = await deps.discovery.computeThemes({ k });
        return { scanned: stats.digestsAssigned, written: stats.clustersWritten };
      },
      distillCharacters: notBuilt("discovery.distillCharacters not built (PD-40)"),
      computeCooccurrence: notBuilt("discovery.computeCooccurrence not built (PD-40)"),
      findDuplicates: async (): Promise<DiscoveryOut> => {
        const stats = await deps.discovery.computeDuplicatePairs();
        return { scanned: stats.charactersScanned, written: stats.pairsWritten };
      },
      // Character hub scores are the meaningful CSLS pass in this slice; the digest/segment/image hub passes
      // join when their embeddings land (they read chat/image vector tables that are empty pre-P5).
      computeHubScores: async (): Promise<DiscoveryOut> => {
        const stats = await deps.discovery.computeCharacterHubScores();
        return { scanned: stats.rowsScored, written: stats.rowsScored };
      },
    },
    import: {
      importAll: notBuilt(
        "import.importAll not built — the entry/import run-profile-import driver owns it",
      ),
    },
    assets: {
      backfillAvatars: notBuilt("assets.backfillAvatars not built (PD-26)"),
      collectGarbage: notBuilt("assets.collectGarbage not built (PD-26)"),
      fsck: notBuilt("assets.fsck not built (PD-26)"),
    },
    stats: {
      reconcileStats: async ({ signal }): Promise<StatsOut> => {
        const r = await reconcileStats(deps.db, { now: deps.now, signal });
        return { owners: r.owners, characters: r.characters };
      },
    },
    connection: {
      refreshCatalogSnapshot: async ({ signal }): Promise<CatalogOut> => {
        const snap = await deps.connection.refreshCatalog({ signal });
        return { models: snap.models.length };
      },
    },
    // PD-41 cleared: chat's corpus sweeps (substrate/backfill.ts), bound over the chat ctx at the root.
    memory: { backfill: deps.memoryBackfill },
    character: { backfillGroupCharacters: deps.groupCharacterBackfill },
    cas: deps.cas,
  };
}
