// Import contributions run owner-composed operations and injected external adapters off-request.
// Staged handles resolve beneath the row owner's namespace before reads and cleanup; a handle grants no authority.

import type { ImportFsPort, ImportPreview } from "@orb/contracts/import";
import { STAGED_UPLOAD_OUTDATED } from "@orb/contracts/import";
import type { BundleImportWorkloadResult, ImportTokenUsageBackfillResult, MaintenanceResult, ReportProgress, WorkloadKind } from "@orb/contracts/workloads";
import { importBundleWorkloadParams, importStWorkloadParams, maintenanceWorkloadParams, readsOperatorTree } from "@orb/contracts/workloads";
import { DomainOperationError } from "@orb/kit/errors";
import { isPlainObject } from "@orb/kit/guards";
import type { UserId } from "@orb/kit/ids";
import type { ActiveWorkloadRow, WorkloadContribution } from "#domain/workloads";
import type { Logger } from "#foundation/observability";
import { getLog } from "#foundation/observability";
import { listStagedEntries, openVerifiedArchive, removeContained, resolveStagedPath, ZIP_STAGING_PREFIX } from "#infra/storage";
import type { ImportWorkloadDeps } from "./contract/workloads.ts";
import { STAGED_BUNDLE_PREFIX, STAGED_TREE_PREFIX, stagedOwnerRoot } from "./substrate/staging.ts";
import { createBackfillTokenUsage } from "./verbs/backfill-token-usage.ts";

// Planner statistics are derived maintenance: a failed refresh must not reject committed import data.
/** The result's merged persona keys, present only when a persona was merged. */
function mergedField(mergedKeys: readonly string[] | undefined): { readonly mergedKeys?: readonly string[] } {
  return mergedKeys !== undefined && mergedKeys.length > 0 ? { mergedKeys } : {};
}

/** The result's preview, present only on a dry run. */
function previewField(preview: ImportPreview | undefined): { readonly preview?: ImportPreview } {
  return preview !== undefined ? { preview } : {};
}

async function refreshPlannerAfterImport(
  refresh: ImportWorkloadDeps["refreshPlannerStats"],
  ownerId: UserId,
  report: ReportProgress,
  logger: Logger,
): Promise<void> {
  try {
    await refresh({ ownerId });
  } catch (err) {
    getLog(logger).error({ err, ownerId }, "post-import planner refresh failed; daily planner maintenance owns retry");
    report({ message: "Import committed; planner refresh deferred to daily maintenance retry." });
  }
}

/** Post-settle side effects of an import-st run: surface the skip count + report path to the workload
 *  progress, then reconcile owner stats on a real run that wrote canon. Extracted to keep the run body under
 *  the cognitive-complexity gate. */
async function settleImportRun(args: {
  readonly result: { readonly failed: number; readonly changed: number; readonly reportPath?: string };
  readonly dryRun: boolean;
  readonly ownerId: UserId;
  readonly report: ReportProgress;
  readonly reconcileImportStats: ImportWorkloadDeps["reconcileImportStats"];
  readonly refreshPlannerStats: ImportWorkloadDeps["refreshPlannerStats"];
  readonly emitLibraryChanged: ImportWorkloadDeps["emitLibraryChanged"];
  readonly logger: Logger;
}): Promise<void> {
  const { result, dryRun, ownerId, report, reconcileImportStats, refreshPlannerStats, emitLibraryChanged } = args;
  if (result.failed > 0) {
    // Per-card isolation surfaced: some cards were skipped but the batch completed (never a hard abort).
    report({ message: `imported with ${result.failed} card(s) skipped (validation)` });
  }
  if (result.reportPath !== undefined) {
    report({ message: `import report written: ${result.reportPath}` });
  }
  if (!dryRun && result.changed > 0) {
    report({ message: "reconciling stats post-import" });
    await reconcileImportStats({ ownerId });
    await refreshPlannerAfterImport(refreshPlannerStats, ownerId, report, args.logger);
    // Refresh the owner's character + chat lists (background import has no other client driver).
    emitLibraryChanged({ ownerId });
  }
}

const STAGED_PREFIXES = [STAGED_TREE_PREFIX, STAGED_BUNDLE_PREFIX, ZIP_STAGING_PREFIX];

type ImportContributions = readonly [
  WorkloadContribution<"import-st">,
  WorkloadContribution<"import-token-usage-backfill">,
  WorkloadContribution<"import-bundle">,
];

/** Import one staged backup ZIP through its open handle, closing the handle whatever the outcome. */
async function importStagedZip(
  runBundleImport: ImportWorkloadDeps["runBundleImport"],
  args: { readonly stagedPath: string; readonly digest: string; readonly ownerId: UserId; readonly stagingRoot: string; readonly signal: AbortSignal },
): Promise<BundleImportWorkloadResult> {
  await using archive = await openVerifiedArchive(args.stagedPath, args.digest);
  return await runBundleImport({ archive, ownerId: args.ownerId, stagingRoot: args.stagingRoot, signal: args.signal });
}

/** The digest a staged run needs. A row queued before digests existed has none, and only a new upload can supply one. */
function requireStagedDigest(digest: string | undefined): string {
  if (digest === undefined) {
    throw new DomainOperationError("staged_upload_outdated", STAGED_UPLOAD_OUTDATED);
  }
  return digest;
}

/** The tree one `import-st` run reads: the staged upload when the row names one, else the operator's profile directory. */
async function profilePort(deps: ImportWorkloadDeps, stagedRoot: string | null, digest: string | undefined): Promise<ImportFsPort> {
  return stagedRoot === null ? deps.operatorImportPort : await deps.stagedImportPort(stagedRoot, requireStagedDigest(digest));
}

/** Free the upload a row that never ran still holds. Never rejects: its row is already terminal, and the next boot's
 *  sweep frees what this could not. An unset handle reads the configured profile dir, which is never removed. */
async function releaseStaged(deps: ImportWorkloadDeps, ownerId: UserId | null, handle: string | undefined): Promise<void> {
  if (handle === undefined) {
    return;
  }
  // owned by the log line and the boot sweep, which frees whatever this could not reach. Ends if the sweep stops running at boot.
  try {
    if (ownerId === null) {
      // The row outlived its owner and no longer says whose root holds the upload. A handle is minted unique, so
      // the one entry that carries its name under any account's root is the one this row staged.
      for (const { ownerRoot, name, path } of await listStagedEntries(deps.stagingRoot)) {
        if (name === handle && STAGED_PREFIXES.some((prefix) => name.startsWith(prefix))) {
          await removeContained(ownerRoot, path);
        }
      }
      return;
    }
    const ownerRoot = stagedOwnerRoot(deps.stagingRoot, ownerId);
    await removeContained(ownerRoot, await resolveStagedPath(ownerRoot, handle));
  } catch (err) {
    getLog(deps.logger).warn({ err, ownerId }, "import: could not free a cancelled run's staged upload; the next boot sweeps it");
  }
}

/** The params field each staged kind names its upload in. */
const STAGED_HANDLE_FIELD: Partial<Record<WorkloadKind, string>> = { "import-st": "stagedDir", "import-bundle": "token" };

/** The upload a row's stored params name, read off the raw value so a row that no longer parses still names it. */
function storedHandle(kind: WorkloadKind, params: unknown): string | undefined {
  const field = STAGED_HANDLE_FIELD[kind];
  const handle = field !== undefined && isPlainObject(params) ? params[field] : undefined;
  return typeof handle === "string" ? handle : undefined;
}

/** The handles active rows still own. */
function liveHandles(active: readonly ActiveWorkloadRow[]): ReadonlySet<string> {
  const handles = new Set<string>();
  for (const { kind, params } of active) {
    const handle = storedHandle(kind, params);
    if (handle !== undefined) {
      handles.add(handle);
    }
  }
  return handles;
}

/**
 * Remove every staged upload no active row names. Safe only where boot calls it: no run is live and the listener is
 * not up, so a live extraction directory or a tree still being written cannot be here.
 */
async function sweepStaging(deps: ImportWorkloadDeps, active: readonly ActiveWorkloadRow[]): Promise<void> {
  const live = liveHandles(active);
  let removed = 0;
  for (const { ownerRoot, name, path } of await listStagedEntries(deps.stagingRoot)) {
    if (STAGED_PREFIXES.some((prefix) => name.startsWith(prefix)) && !live.has(name)) {
      await removeContained(ownerRoot, path);
      removed += 1;
    }
  }
  getLog(deps.logger).info({ removed, live: live.size }, "import: boot sweep of abandoned staged uploads");
}

export function createImportWorkloadContributions(deps: ImportWorkloadDeps): ImportContributions {
  const backfillTokenUsage = createBackfillTokenUsage(deps);
  return [
    {
      kind: "import-st",
      params: importStWorkloadParams,
      // Minutes of bulk profile loading — the archetypal sweep.
      lane: "sweep",
      // A dry run is the preview a person watches (it writes nothing), so it never waits behind a sweep (D209).
      laneFor: (params) => (params.dryRun === true ? "interactive" : "sweep"),
      // Every per-entity write is dedupe-gated, so a retry re-runs the whole loop safely.
      resume: "idempotent-restart",
      admit: ({ params }) => Promise.resolve(params.stagedDir !== undefined && params.stagedDigest === undefined ? STAGED_UPLOAD_OUTDATED : null),
      ownerOnly: readsOperatorTree,
      releaseUnrun: ({ ownerId, params }) => releaseStaged(deps, ownerId, storedHandle("import-st", params)),
      // Declared once: both staged kinds share this root, and the sweep reads the rows of both.
      sweepOnBoot: (active) => sweepStaging(deps, active),
      run: async (ctx, params, report, signal): Promise<MaintenanceResult> => {
        const targetOwnerId = ctx.ownerId;
        if (targetOwnerId === null) {
          // `start` guarantees a target for this create-kind; the guard makes "can't mint ownerless rows" explicit.
          throw new DomainOperationError("import_target_required", "import-st: no target owner (a bulk import must designate a targetOwnerId)");
        }
        const dryRun = params.dryRun ?? false;
        report({ message: dryRun ? "import ST (dry run)" : "importing ST profiles" });
        // A folder-upload override resolves the server-minted handle to a PROPER STRICT DESCENDANT of the
        // staging root (throws on any traversal attempt, before any fs read); absent ⇒ the configured root.
        const ownerRoot = stagedOwnerRoot(deps.stagingRoot, targetOwnerId);
        const stagedRoot = params.stagedDir === undefined ? null : await resolveStagedPath(ownerRoot, params.stagedDir);
        let result: Awaited<ReturnType<ImportWorkloadDeps["runProfileDirImport"]>>;
        try {
          result = await deps.runProfileDirImport({
            fs: await profilePort(deps, stagedRoot, params.stagedDigest),
            ownerId: targetOwnerId,
            dryRun,
            signal,
            personaCollisions: params.personaCollisions,
          });
        } finally {
          // A folder-upload staging tree is owned by this run; remove it (success OR error) through the
          // contained-rm belt. The configured default profile dir is persistent and is NEVER removed here.
          if (stagedRoot !== null) {
            await removeContained(ownerRoot, stagedRoot);
          }
        }
        await settleImportRun({
          logger: deps.logger,
          result,
          dryRun,
          ownerId: targetOwnerId,
          report,
          reconcileImportStats: deps.reconcileImportStats,
          refreshPlannerStats: deps.refreshPlannerStats,
          emitLibraryChanged: deps.emitLibraryChanged,
        });
        return {
          scanned: result.scanned,
          changed: result.changed,
          dryRun,
          failed: result.failed,
          ...mergedField(result.mergedKeys),
          ...(result.reportPath !== undefined ? { reportPath: result.reportPath } : {}),
          ...(dryRun ? {} : { memoryScope: result.memoryScope }),
          found: result.found,
          ...previewField(result.preview),
        };
      },
    },
    {
      kind: "import-token-usage-backfill",
      params: maintenanceWorkloadParams,
      lane: "sweep",
      resume: "idempotent-restart",
      run: async (ctx, params, report, signal): Promise<ImportTokenUsageBackfillResult> => {
        const dryRun = params.dryRun ?? false;
        report({ message: dryRun ? "token usage catch-up (dry run)" : "backfilling imported token usage" });
        return await backfillTokenUsage({ ownerId: ctx.ownerId, dryRun, report, signal });
      },
    },
    {
      kind: "import-bundle",
      params: importBundleWorkloadParams,
      // A whole-library zip with blobs — minutes, and off-request MANDATORY (the route replies 202 and the
      // client tails the run). The staged upload is owned by this row from `start` on.
      lane: "sweep",
      // The entity descriptors dedupe on re-import, so a retry is safe.
      resume: "idempotent-restart",
      admit: ({ params }) => Promise.resolve(params.stagedDigest === undefined ? STAGED_UPLOAD_OUTDATED : null),
      releaseUnrun: ({ ownerId, params }) => releaseStaged(deps, ownerId, storedHandle("import-bundle", params)),
      run: async (ctx, params, report, signal): Promise<BundleImportWorkloadResult> => {
        const targetOwnerId = ctx.ownerId;
        if (targetOwnerId === null) {
          throw new DomainOperationError("import_target_required", "import-bundle: no target owner (a bundle must be scoped to the uploader)");
        }
        report({ message: "importing bundle" });
        const ownerRoot = stagedOwnerRoot(deps.stagingRoot, targetOwnerId);
        const stagedPath = await resolveStagedPath(ownerRoot, params.token);
        try {
          const digest = requireStagedDigest(params.stagedDigest);
          const report_ =
            params.source === "dir"
              ? await deps.runStagedDirImport({ stagedPath, digest, ownerId: targetOwnerId, signal })
              : await importStagedZip(deps.runBundleImport, { stagedPath, digest, ownerId: targetOwnerId, stagingRoot: ownerRoot, signal });
          // A background bundle/tree import that wrote canon refreshes the owner's character + chat lists
          // (the client's own completion invalidation only fires while the import UI stayed mounted).
          if (report_.imported > 0) {
            await refreshPlannerAfterImport(deps.refreshPlannerStats, targetOwnerId, report, deps.logger);
            deps.emitLibraryChanged({ ownerId: targetOwnerId });
          }
          // A background run surfaces the SAME per-file notes a sync door would: what a file
          // that DID import still left behind (a kept edited lorebook, a dropped overlay). Named on the run's
          // own progress stream, not only buried in the terminal result.
          for (const note of report_.notes) {
            report({ message: note });
          }
          return report_;
        } finally {
          await removeContained(ownerRoot, stagedPath);
        }
      },
    },
  ];
}
