// Builds the one true cross-feature hub, the `WorkloadRunnerEnv` — the typed bundle of every cross-feature
// op the workload runners depend on, assembled here (the only tier above domain-no-cross-feature) and
// threaded by the worker into every dispatch. Each op wires to the real backing domain verb where it
// exists; a deferred op is a typed inert seam that rejects with a clear "not built" message — never a fake
// success. `import.importAll` is the one still-deferred op (built by the run-profile-import driver).

import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { PortabilityRegistry } from "@orb/contracts/portability";
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
import { IMPORT_MAX_DECOMPRESSED_BYTES, IMPORT_MAX_TOTAL_BYTES, runBundleImport } from "../import";

type DiscoveryOut = Awaited<ReturnType<WorkloadDiscoveryEnv["computeThemes"]>>;
type StatsOut = Awaited<ReturnType<WorkloadStatsEnv["reconcileStats"]>>;
type CatalogOut = Awaited<ReturnType<WorkloadConnectionEnv["refreshCatalogSnapshot"]>>;
type EmbedOut = Awaited<ReturnType<WorkloadEmbeddingsEnv["embedCorpus"]>>;
type MaintCountsOut = Awaited<ReturnType<WorkloadRunnerEnv["assets"]["collectGarbage"]>>;
type FsckOut = Awaited<ReturnType<WorkloadRunnerEnv["assets"]["fsck"]>>;

/** What the runner-env builder needs from the composition root. */
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
  readonly embeddings: Pick<EmbeddingsService, "embedCorpus" | "embedAssets">;
  readonly assets: Pick<AssetsService, "backfillAvatars" | "collectGarbage" | "fsck">;
  /** Chat's corpus sweeps, bound over the chat ctx at the root (built after chat). */
  readonly memoryBackfill: WorkloadMemoryEnv["backfill"];
  readonly groupCharacterBackfill: WorkloadCharacterEnv["backfillGroupCharacters"];
  /** Accessed lazily — the registry is assembled after this env is built, so this derefs at run time.
   *  Do NOT eager-capture the registry (it doesn't exist yet when this runs). */
  readonly getPortabilityRegistry: () => PortabilityRegistry;
  /** The staging root the upload route wrote the zip under; absent ⇒ the OS temp dir (same default the
   *  route resolves, so the op reads exactly where the route wrote). */
  readonly importStagingDir?: string;
}

/** A typed inert seam for a deferred op — rejects loudly, never fakes a success. */
function notBuilt(label: string): () => Promise<never> {
  return (): Promise<never> => Promise.reject(new Error(`workloads runner-env: ${label}`));
}

/** Bind the `assets-backfill` op. The workload seam is count-only, so the root gathers the staged cards:
 *  characters with a recorded card but no linked avatar whose card blob is still in the CAS. */
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

    const byOwner = new Map<
      UserId,
      { characterId: CharacterId; bytes: Uint8Array; importHash: string }[]
    >();
    for (const row of rows) {
      const importHash = row.importHash;
      // biome-ignore lint/performance/noAwaitInLoops: per-character CAS probe during a maintenance-time gather — not a hot path.
      if (importHash === null || !(await cas.exists(row.ownerId, importHash))) {
        continue;
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

/** Bind the `import-bundle` workload op: read the staged zip (`basename` strips any path-traversal), run
 *  `runBundleImport` over the lazily-resolved registry, project the report into workload counts, and remove
 *  the staged zip in a `finally` (success and error). */
function bindImportBundle(
  getRegistry: () => PortabilityRegistry,
  stagingRoot: string,
): WorkloadRunnerEnv["import"]["importBundle"] {
  return async ({ ownerId, token, signal }) => {
    const stagedPath = join(stagingRoot, basename(token));
    try {
      const bytes = await readFile(stagedPath);
      const report = await runBundleImport({
        registry: getRegistry(),
        ownerId,
        archive: bytes,
        extractOptions: {
          maxTotalBytes: IMPORT_MAX_TOTAL_BYTES,
          maxTotalDecompressedBytes: IMPORT_MAX_DECOMPRESSED_BYTES,
          stagingRoot,
        },
        signal,
      });
      return { imported: report.imported, skipped: report.skipped, failed: report.failed };
    } finally {
      await rm(stagedPath, { force: true });
    }
  };
}

/** Assemble the cross-feature `WorkloadRunnerEnv` once at boot. */
export function buildWorkloadRunnerEnv(deps: RunnerEnvDeps): WorkloadRunnerEnv {
  const stagingRoot = deps.importStagingDir ?? tmpdir();
  return {
    embeddings: {
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
      distillCharacters: async ({ ownerId, signal }): Promise<DiscoveryOut> => {
        const stats = await deps.discovery.distillCharacters({
          signal,
          ...(ownerId !== null ? { ownerId } : {}),
        });
        return { scanned: stats.scanned, written: stats.distilled };
      },
      computeCooccurrence: async ({ signal }): Promise<DiscoveryOut> => {
        const stats = await deps.discovery.computeCooccurrence({ signal });
        return { scanned: stats.charKeywordsWritten, written: stats.pairsWritten };
      },
      // Both dedup arms run in the one find-duplicates workload; counts are summed.
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
      computeHubScores: async ({ ownerId }): Promise<DiscoveryOut> => {
        const stats = await deps.discovery.computeCharacterHubScores({ ownerId });
        return { scanned: stats.rowsScored, written: stats.rowsScored };
      },
    },
    import: {
      importAll: notBuilt(
        "import.importAll not built — the entry/import run-profile-import driver owns it",
      ),
      importBundle: bindImportBundle(deps.getPortabilityRegistry, stagingRoot),
    },
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
        const r = await reconcileStats(deps.db, {
          now: deps.now,
          signal,
          ...(ownerId !== null ? { ownerId } : {}),
        });
        return { owners: r.owners, characters: r.characters };
      },
    },
    connection: {
      // Both lanes run under allSettled so one lane's failure never discards the other's refresh; a failed
      // lane reports null (distinct from 0 = a real empty catalog). Only rethrows when BOTH lanes failed.
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
    memory: { backfill: deps.memoryBackfill },
    character: { backfillGroupCharacters: deps.groupCharacterBackfill },
    cas: deps.cas,
  };
}
