// Builds what is LEFT of the retiring cross-feature hub, the `WorkloadRunnerEnv` (the workloads junk-drawer
// exit). Each kind whose ownership move has landed reads its deps from its OWN domain's
// `workload-contributions.ts` factory instead; this file shrinks with every stage and is deleted with the
// last one. NOTHING may be added here.

import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import type { IngestRunResult } from "@orb/contracts/databank";
import type { Principal } from "@orb/contracts/identity";
import type { PortabilityRegistry } from "@orb/contracts/portability";
import type { Db } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import type { BulkImportChats } from "#domain/chat";
import type { DatabankIngest } from "#domain/databank";
import type { EmbeddingsService } from "#domain/embeddings";
import type { BulkImportPersonas } from "#domain/persona";
import { reconcileStats } from "#domain/stats";
import type { WorkloadRunnerEnv } from "#domain/workloads";
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

type StatsOut = Awaited<ReturnType<WorkloadRunnerEnv["stats"]["reconcileStats"]>>;

/** What the runner-env builder needs from the composition root. */
export interface RunnerEnvDeps {
  readonly db: Db;
  readonly now: () => number;

  /** Only the DOCUMENT purge survives here — every other embeddings op moved to its owning domain's
   *  contribution factory. It is fired by the
   *  databank-reindex runner, which has not moved yet. */
  readonly embeddings: Pick<EmbeddingsService, "purgeDocumentVectors">;
  /** The databank ingest subsystem (chunk→embed→prune) — the databank-ingest/reindex runners' backing ops. */
  readonly databankIngest: DatabankIngest;
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
    import: {
      importAll: bindImportAll(stProfileDir, stagingRoot, deps.now, deps.profileImport),
      importBundle: bindImportBundle(deps.getPortabilityRegistry, stagingRoot),
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
  };
}
