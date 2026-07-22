// Builds the one true cross-feature hub, the `WorkloadRunnerEnv` — the typed bundle of every cross-feature
// op the workload runners depend on, assembled here (the only tier above domain-no-cross-feature) and
// threaded by the worker into every dispatch. Each op wires to the real backing domain verb where it
// exists; a deferred op is a typed inert seam that rejects with a clear "not built" message — never a fake
// success. Every op is now built (`import.importAll`, the last deferred seam, wires to the
// run-profile-dir-import driver).

import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import type { IngestRunResult } from "@orb/contracts/databank";
import type { Principal } from "@orb/contracts/identity";
import type { PortabilityRegistry } from "@orb/contracts/portability";
import type { Db } from "@orb/db";
import { characters } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { AssetsService } from "#domain/assets";
import type { BulkImportChats } from "#domain/chat";
import type { ConnectionService } from "#domain/connection";
import type { DatabankIngest } from "#domain/databank";
import type { DiscoveryService } from "#domain/discovery";
import type { EmbeddingsService } from "#domain/embeddings";

import type { BulkImportPersonas } from "#domain/persona";
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
import { stageDirectory } from "#infra/storage";
import type { ImportAssetPort, ImportCharacterPort, ImportTagPort, ImportWorldInfoPort } from "../import";
import {
  createNodeFsImportPort,
  IMPORT_MAX_DECOMPRESSED_BYTES,
  IMPORT_MAX_TOTAL_BYTES,
  importStagedArchive,
  runBundleImport,
  runProfileDirImport,
} from "../import";

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
    "computeThemes" | "computeDuplicatePairs" | "computeChatDuplicatePairs" | "computeCharacterHubScores" | "distillCharacters" | "computeCooccurrence"
  >;
  readonly connection: Pick<ConnectionService, "refreshCatalog" | "refreshAgentSdkCatalog">;
  readonly embeddings: Pick<EmbeddingsService, "embedCorpus" | "embedAssets" | "purgeMemoryVectors" | "purgeDocumentVectors">;
  /** The databank ingest subsystem (chunk→embed→prune) — the databank-ingest/reindex runners' backing ops. */
  readonly databankIngest: DatabankIngest;
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
  /** The ST profile-directory `importAll` reads (one subdir per ST user); absent ⇒ repo-root `.st-data`. */
  readonly stProfileDir?: string;
  /** The cross-feature ops the ST profile-directory importer (`importAll`) composes into a per-owner
   *  `ImportContext` — the same slice the portability chat/persona descriptors wire. */
  readonly profileImport: {
    readonly character: ImportCharacterPort;
    readonly storeAvatar: ImportAssetPort["store"];
    readonly attachCardTag: ImportTagPort["attachCardTagByName"];
    readonly importLorebook: ImportWorldInfoPort["importLorebook"];
    readonly linkCarriedBooks: ImportWorldInfoPort["linkCarriedBooks"];
    readonly bulkImportChats: BulkImportChats;
    readonly bulkImportPersonas: BulkImportPersonas;
    readonly enqueueBackfill: (args: { readonly ownerId: UserId }) => Promise<void>;
    readonly reconcileImportStats: (args: { readonly ownerId: UserId }) => Promise<void>;
    readonly resolveOwnerPrincipal: (userId: UserId) => Promise<Principal>;
  };
}

/** Resolve a server-minted staging handle to an absolute path that is a PROPER STRICT DESCENDANT of
 *  `stagingRoot`, or throw. The authoritative containment belt (mirrors import-tree.ts's `stagePart`
 *  resolve-prefix check): a handle that resolves to the staging root itself, its parent, or anywhere outside
 *  is a path-traversal attempt and throws BEFORE any fs read or rm — the workload fails cleanly, nothing is
 *  touched. `basename()` is NOT a containment primitive (`basename("..") === ".."`); never use it as one. */
function resolveStagedPath(stagingRoot: string, handle: string): string {
  const root = resolve(stagingRoot);
  const target = resolve(root, handle);
  if (target === root || !target.startsWith(root + sep)) {
    throw new DomainOperationError("staged_path_escape", `staged handle escapes the staging root: ${handle}`);
  }
  return target;
}

/** Belt-and-suspenders rm: remove `target` ONLY when it is provably a strict descendant of `stagingRoot`
 *  AT THE rm CALLSITE — so even a future refactor that computed the path unsafely can never make this delete
 *  the staging root, its parent, or anything outside it. A non-contained target is refused silently:
 *  `resolveStagedPath` already rejected the traversal loudly at compute time, so reaching here with an
 *  out-of-root path means a bug, and the safe response is to delete nothing (never throw from the finally). */
async function rmContained(stagingRoot: string, target: string): Promise<void> {
  const root = resolve(stagingRoot);
  const resolved = resolve(target);
  if (resolved === root || !resolved.startsWith(root + sep)) {
    return;
  }
  await rm(resolved, { recursive: true, force: true });
}

/** Bind the `import.importAll` workload op: resolve the target owner's principal, then run the ST
 *  profile-directory importer over the real node:fs port at the configured root (personas first, then
 *  per-bundle character + chats). Projects the driver's maintenance-pass counts straight through. */
function bindImportAll(
  defaultProfileRoot: string,
  stagingRoot: string,
  now: () => number,
  deps: RunnerEnvDeps["profileImport"],
): WorkloadRunnerEnv["import"]["importAll"] {
  const fs = createNodeFsImportPort();
  return async ({ ownerId, dryRun, stagedDir, signal }) => {
    const principal = await deps.resolveOwnerPrincipal(ownerId);
    // A folder-upload override resolves the server-minted handle to a PROPER STRICT DESCENDANT of the staging
    // root (throws on any traversal attempt, before any fs read) — the same containment belt the HTTP ingest
    // uses; absent ⇒ the env-configured root.
    const profileRoot = stagedDir !== undefined ? resolveStagedPath(stagingRoot, stagedDir) : defaultProfileRoot;
    try {
      const { scanned, changed } = await runProfileDirImport({
        fs,
        profileRoot,
        principal,
        character: deps.character,
        storeAvatar: deps.storeAvatar,
        attachCardTag: deps.attachCardTag,
        importLorebook: deps.importLorebook,
        linkCarriedBooks: deps.linkCarriedBooks,
        bulkImportChats: deps.bulkImportChats,
        bulkImportPersonas: deps.bulkImportPersonas,
        enqueueBackfill: deps.enqueueBackfill,
        reconcileImportStats: deps.reconcileImportStats,
        now,
        dryRun,
        signal,
      });
      return { scanned, changed };
    } finally {
      // A folder-upload staging tree is owned by this run; remove it (success OR error) — but only via the
      // contained-rm belt, so nothing outside the staging root is ever deletable here. The env-configured
      // default profile dir is persistent and is NEVER removed here.
      if (stagedDir !== undefined) {
        await rmContained(stagingRoot, profileRoot);
      }
    }
  };
}

/** Repo-root ST profile snapshot (gitignored) — the `importAll` default when no `stProfileDir` is set. */
const DEFAULT_ST_PROFILE_DIR = ".st-data";

/** Bind the `assets-backfill` op. The workload seam is count-only, so the root gathers the staged cards:
 *  characters with a recorded card but no linked avatar whose card blob is still in the CAS. */
function bindBackfillAvatars(db: Db, cas: Cas, assets: Pick<AssetsService, "backfillAvatars">): WorkloadRunnerEnv["assets"]["backfillAvatars"] {
  return async ({ ownerId, dryRun }) => {
    const scope =
      ownerId === null
        ? and(isNull(characters.avatarAssetId), isNotNull(characters.importHash))
        : and(eq(characters.ownerId, ownerId), isNull(characters.avatarAssetId), isNotNull(characters.importHash));
    const rows = await db.select({ id: characters.id, ownerId: characters.ownerId, importHash: characters.importHash }).from(characters).where(scope);

    const byOwner = new Map<UserId, { characterId: CharacterId; bytes: Uint8Array; importHash: string }[]>();
    for (const row of rows) {
      const importHash = row.importHash;
      // biome-ignore lint/performance/noAwaitInLoops: per-character CAS probe during a maintenance-time gather — not a hot path.
      if (importHash === null || !(await cas.exists(row.ownerId, importHash))) {
        continue;
      }
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

/** Bind the `import-bundle` workload op. `resolveStagedPath` resolves the staged upload to a PROPER STRICT
 *  DESCENDANT of the staging root (throws on any traversal attempt, before any fs read or rm). `source: "zip"`
 *  (default) reads the single archive through `runBundleImport` (its own extract belts); `source: "dir"` walks
 *  a staged folder-upload tree (`stageDirectory`, already sanitized + capped at the HTTP ingest) through the
 *  SAME entity routing. The staged upload (a file OR a directory) is removed in a `finally` (success and
 *  error) via the contained-rm belt. */
function bindImportBundle(getRegistry: () => PortabilityRegistry, stagingRoot: string): WorkloadRunnerEnv["import"]["importBundle"] {
  return async ({ ownerId, token, source, signal }) => {
    const stagedPath = resolveStagedPath(stagingRoot, token);
    try {
      const report =
        source === "dir"
          ? await importStagedArchive({
              registry: getRegistry(),
              ownerId,
              staged: await stageDirectory(stagedPath),
              signal,
            })
          : await runBundleImport({
              registry: getRegistry(),
              ownerId,
              archive: await readFile(stagedPath),
              extractOptions: {
                maxTotalBytes: IMPORT_MAX_TOTAL_BYTES,
                maxTotalDecompressedBytes: IMPORT_MAX_DECOMPRESSED_BYTES,
                stagingRoot,
              },
              signal,
            });
      return { imported: report.imported, skipped: report.skipped, failed: report.failed };
    } finally {
      await rmContained(stagingRoot, stagedPath);
    }
  };
}

/** Assemble the cross-feature `WorkloadRunnerEnv` once at boot. */
export function buildWorkloadRunnerEnv(deps: RunnerEnvDeps): WorkloadRunnerEnv {
  const stagingRoot = deps.importStagingDir ?? tmpdir();
  const stProfileDir = deps.stProfileDir ?? DEFAULT_ST_PROFILE_DIR;
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
      // PD-139(b): the chat-memory old-space reclaim; the runner gates it to the bulk, non-aborted pass. The
      // purge's row counts are advisory — the runner discards them (the sweep's own counts are the result).
      purgeMemoryVectors: async (): Promise<void> => {
        await deps.embeddings.purgeMemoryVectors();
      },
      // PD-139(c): the document old-space reclaim; the databank-reindex runner gates it to the bulk,
      // non-aborted pass (same guard as purgeMemoryVectors). Counts discarded.
      purgeDocumentVectors: async (): Promise<void> => {
        await deps.embeddings.purgeDocumentVectors();
      },
    },
    databank: {
      ingest: (args): Promise<IngestRunResult> => deps.databankIngest.ingestDocument(args),
      reindex: (args): Promise<IngestRunResult> => deps.databankIngest.reindex(args),
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
      importAll: bindImportAll(stProfileDir, stagingRoot, deps.now, deps.profileImport),
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
        const [or, agentSdk] = await Promise.allSettled([deps.connection.refreshCatalog({ signal }), deps.connection.refreshAgentSdkCatalog({ signal })]);
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
