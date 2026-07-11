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
//   • assets.* (backfillAvatars / collectGarbage / fsck) → the PD-26 maintenance/DR verbs on AssetsService,
//     projected into the workload-owned counts/report (backfill GATHERS staged cards at the root).
//   • cas → the injected infra/storage blob store (the image-embed pass reads originals through it).
// INERT (DEFERRED — no backing verb in the current slices; named precisely so a run fails loud, not silent):
//   • import.importAll — built by the `entry/import/run-profile-import` driver (a later entry slice).
// WIRED (PD-41 cleared): memory.backfill + character.backfillGroupCharacters — chat's corpus sweeps,
//   handed in as BOUND ops from the chat compose product (the sweeps need the full ChatContext, so the
//   env is built AFTER chat at the root).

import type { Db } from "@orb/db";
import { characters } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { AssetsService } from "#domain/assets";
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
type MaintCountsOut = Awaited<ReturnType<WorkloadRunnerEnv["assets"]["collectGarbage"]>>;
type FsckOut = Awaited<ReturnType<WorkloadRunnerEnv["assets"]["fsck"]>>;

/** What the runner-env builder needs from the composition root — the db + clock + the cas handle + the
 *  slices of the real services whose verbs back a wired op. */
export interface RunnerEnvDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly cas: Cas;
  readonly discovery: Pick<
    DiscoveryService,
    | "computeThemes"
    | "computeDuplicatePairs"
    | "computeChatDuplicatePairs"
    | "computeCharacterHubScores"
    | "distillCharacters"
    | "computeCooccurrence"
  >;
  readonly connection: Pick<ConnectionService, "refreshCatalog" | "refreshAgentSdkCatalog">;
  /** The PD-53 bulk embed passes (resumable, content_hash-gated catch-up sweeps). */
  readonly embeddings: Pick<EmbeddingsService, "embedCorpus" | "embedAssets">;
  /** The PD-26 maintenance verbs backing the `assets-backfill`/`assets-gc`/`assets-fsck` workloads. */
  readonly assets: Pick<AssetsService, "backfillAvatars" | "collectGarbage" | "fsck">;
  /** Chat's PD-41 corpus sweeps, BOUND over the chat ctx at the root (built after chat). */
  readonly memoryBackfill: WorkloadMemoryEnv["backfill"];
  readonly groupCharacterBackfill: WorkloadCharacterEnv["backfillGroupCharacters"];
}

/** A typed inert seam for a DEFERRED op — rejects loudly (never fakes a success). The arg is ignored; the
 *  `() => Promise<never>` shape is assignable to any `(args) => Promise<X>` env op. */
function notBuilt(label: string): () => Promise<never> {
  return (): Promise<never> => Promise.reject(new Error(`workloads runner-env: ${label}`));
}

/** Bind the `assets-backfill` workload op to `assets.backfillAvatars`. The workload seam is count-only, so the
 *  root GATHERS the staged cards: characters with a recorded card (`importHash` present) but NO linked avatar
 *  (`avatarAssetId IS NULL`) whose card blob is still in the CAS — read those bytes and hand them to the verb,
 *  which re-stores them through the coherence writer and (re)links the avatar only on a hash match. `ownerId`
 *  scopes the scan (null = every owner); the verb is per-owner, so a bulk pass fans out per owner group. */
function bindBackfillAvatars(
  db: Db,
  cas: Cas,
  assets: Pick<AssetsService, "backfillAvatars">,
): WorkloadRunnerEnv["assets"]["backfillAvatars"] {
  return async ({ ownerId, dryRun }) => {
    const scope =
      ownerId === null
        ? and(isNull(characters.avatarAssetId), isNotNull(characters.importHash))
        : and(
            eq(characters.ownerId, ownerId),
            isNull(characters.avatarAssetId),
            isNotNull(characters.importHash),
          );
    const rows = await db
      .select({ id: characters.id, ownerId: characters.ownerId, importHash: characters.importHash })
      .from(characters)
      .where(scope);

    // Group by owner (the verb is per-owner); read each card's bytes from the CAS at its `importHash`.
    const byOwner = new Map<
      UserId,
      { characterId: CharacterId; bytes: Uint8Array; importHash: string }[]
    >();
    for (const row of rows) {
      const importHash = row.importHash;
      // biome-ignore lint/performance/noAwaitInLoops: per-character CAS probe during a maintenance-time gather — not a hot path.
      if (importHash === null || !(await cas.exists(row.ownerId, importHash))) {
        continue; // no card, or its blob is gone — nothing to relink here.
      }
      // biome-ignore lint/performance/noAwaitInLoops: per-character CAS byte read (same maintenance-time gather).
      const bytes = await cas.read(row.ownerId, importHash);
      const cards = byOwner.get(row.ownerId) ?? [];
      cards.push({ characterId: row.id, bytes, importHash });
      byOwner.set(row.ownerId, cards);
    }

    let scanned = 0;
    let changed = 0;
    for (const [owner, cards] of byOwner) {
      // biome-ignore lint/performance/noAwaitInLoops: sequential per-owner backfill fan-out (the verb is per-owner) — maintenance-time, not a hot path.
      const result = await assets.backfillAvatars({ ownerId: owner, cards, dryRun });
      scanned += result.scanned;
      changed += result.linked;
    }
    return { scanned, changed };
  };
}

/** Assemble the cross-feature `WorkloadRunnerEnv` ONCE at boot (the worker threads it into every dispatch). */
export function buildWorkloadRunnerEnv(deps: RunnerEnvDeps): WorkloadRunnerEnv {
  return {
    // PD-53 cleared: the bulk catch-up sweeps (resumable, content_hash-gated) back the embed workloads.
    // The domain's BulkEmbedResult is projected field-for-field into the workload-owned EmbedPassResult
    // (the adapter discipline — structurally identical today, decoupled by design).
    embeddings: {
      // `ownerId` scopes the enumeration (SINGULAR = one owner; null = the BULK all-owners sweep).
      embedCorpus: async ({ ownerId, force, signal }): Promise<EmbedOut> => {
        const r = await deps.embeddings.embedCorpus({ ownerId, force, signal });
        return { embedded: r.embedded, skipped: r.skipped };
      },
      embedAssets: async ({ ownerId, force, signal }): Promise<EmbedOut> => {
        const r = await deps.embeddings.embedAssets({ ownerId, force, signal });
        return { embedded: r.embedded, skipped: r.skipped };
      },
    },
    discovery: {
      computeThemes: async ({ ownerId, k }): Promise<DiscoveryOut> => {
        const stats = await deps.discovery.computeThemes({ k, ownerId });
        return { scanned: stats.digestsAssigned, written: stats.clustersWritten };
      },
      // PD-40 write-half: the distill pass (character summaries + staged `pending` tag suggestions). `ownerId`
      // scopes to one owner (SINGULAR); null = the whole-library batch (BULK — distill takes an optional
      // owner, so null maps to "no owner filter"). DistillStats → the workload-owned AnalyticsResult.
      distillCharacters: async ({ ownerId, signal }): Promise<DiscoveryOut> => {
        const stats = await deps.discovery.distillCharacters({
          signal,
          ...(ownerId !== null ? { ownerId } : {}),
        });
        return { scanned: stats.scanned, written: stats.distilled };
      },
      // PD-40 cleared: keyword×keyword cooccurrence + per-character keyword profiles over tier-0 digests
      // (bulk-only — no per-owner concept in the workload env). CooccurrenceStats → the AnalyticsResult.
      computeCooccurrence: async ({ signal }): Promise<DiscoveryOut> => {
        const stats = await deps.discovery.computeCooccurrence({ signal });
        return { scanned: stats.charKeywordsWritten, written: stats.pairsWritten };
      },
      // Both dedup arms run in the ONE `find-duplicates` workload: the character arm (all-pairs cosine) + the
      // chat near-dup arm (Jaccard of segment content-hashes + fork lineage). Counts are summed.
      findDuplicates: async ({ ownerId }): Promise<DiscoveryOut> => {
        const [chars, chatPairs] = await Promise.all([
          deps.discovery.computeDuplicatePairs({ ownerId }),
          deps.discovery.computeChatDuplicatePairs({ ownerId }),
        ]);
        return {
          scanned: chars.charactersScanned + chatPairs.chatsScanned,
          written: chars.pairsWritten + chatPairs.pairsWritten,
        };
      },
      // Character hub scores are the meaningful CSLS pass in this slice; the digest/segment/image hub passes
      // join when their embeddings land (they read chat/image vector tables that are empty pre-P5). `ownerId`
      // scopes to owner-local hubness (SINGULAR); null = the cross-tenant whole-space hubness (BULK).
      computeHubScores: async ({ ownerId }): Promise<DiscoveryOut> => {
        const stats = await deps.discovery.computeCharacterHubScores({ ownerId });
        return { scanned: stats.rowsScored, written: stats.rowsScored };
      },
    },
    import: {
      importAll: notBuilt(
        "import.importAll not built — the entry/import run-profile-import driver owns it",
      ),
    },
    // PD-26 cleared: the maintenance/DR verbs back the assets workloads. Each op PROJECTS the domain's richer
    // result into the workload-owned shape (the adapter discipline). `backfillAvatars` GATHERS staged cards at
    // the root (the workload seam is count-only); GC/fsck are whole-store passes.
    assets: {
      backfillAvatars: bindBackfillAvatars(deps.db, deps.cas, deps.assets),
      collectGarbage: async ({ dryRun, signal }): Promise<MaintCountsOut> => {
        const r = await deps.assets.collectGarbage({ dryRun, signal });
        return { scanned: r.scanned, changed: r.reclaimed };
      },
      fsck: async ({ signal }): Promise<FsckOut> => {
        const r = await deps.assets.fsck({ signal });
        return {
          danglingRows: r.danglingRows,
          corruptBlobs: r.corruptBlobs,
          orphanBlobs: r.orphanBlobs,
        };
      },
    },
    stats: {
      reconcileStats: async ({ ownerId, signal }): Promise<StatsOut> => {
        // The standalone pass is per-owner-native: `ownerId` set → rebuild that owner; null → every owner.
        const r = await reconcileStats(deps.db, {
          now: deps.now,
          signal,
          ...(ownerId !== null ? { ownerId } : {}),
        });
        return { owners: r.owners, characters: r.characters };
      },
    },
    connection: {
      // The daily catalog refresh runs BOTH provider catalogs — OpenRouter `/models` + the agent-sdk
      // daemon `supportedModels()` map (the family→version fix's auto-population). Each lane is best-effort
      // AND INDEPENDENT: the two run under `allSettled` so one lane's failure (no OR key, or a cold agent-sdk
      // snapshot + unreachable daemon) never discards the other lane's refresh. A refreshed lane reports its
      // snapshot size; a FAILED lane reports `null` (distinct from `0` = a real empty catalog). The run only
      // fails — rethrowing the first rejection — when BOTH lanes failed (nothing was accomplished).
      refreshCatalogSnapshot: async ({ signal }): Promise<CatalogOut> => {
        const [or, agentSdk] = await Promise.allSettled([
          deps.connection.refreshCatalog({ signal }),
          deps.connection.refreshAgentSdkCatalog({ signal }),
        ]);
        if (or.status === "rejected" && agentSdk.status === "rejected") {
          throw or.reason;
        }
        return {
          models: or.status === "fulfilled" ? or.value.models.length : null,
          agentSdkModels: agentSdk.status === "fulfilled" ? agentSdk.value.models.length : null,
        };
      },
    },
    // PD-41 cleared: chat's corpus sweeps (substrate/backfill.ts), bound over the chat ctx at the root.
    memory: { backfill: deps.memoryBackfill },
    character: { backfillGroupCharacters: deps.groupCharacterBackfill },
    cas: deps.cas,
  };
}
