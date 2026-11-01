// Import contributions run owner-composed operations and injected external adapters off-request.
// Staged handles resolve beneath the row owner's namespace before reads and cleanup; a handle grants no authority.

import type { Dirent } from "node:fs";
import { constants as fsConstants } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { lstat, open, readdir, realpath, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { ImportPreview } from "@orb/contracts/import";
import type { BundleImportWorkloadResult, ImportTokenUsageBackfillResult, MaintenanceResult, ReportProgress, WorkloadKind } from "@orb/contracts/workloads";
import { importBundleWorkloadParams, importStWorkloadParams, maintenanceWorkloadParams } from "@orb/contracts/workloads";
import { DomainOperationError } from "@orb/kit/errors";
import { isPlainObject } from "@orb/kit/guards";
import type { UserId } from "@orb/kit/ids";
import { isStrictDescendant } from "@orb/kit/path-containment";
import type { ActiveWorkloadRow, WorkloadContribution } from "#domain/workloads";
import type { Logger } from "#foundation/observability";
import { getLog } from "#foundation/observability";
import { ZIP_STAGING_PREFIX } from "#infra/storage";
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
    // #23: refresh the owner's character + chat lists (background import has no other client driver).
    emitLibraryChanged({ ownerId });
  }
}

// The lexical containment pass runs on the host's own separator; `realpath` below is the authoritative half.
const HOST_PATH = { sep };
const STAGED_PREFIXES = [STAGED_TREE_PREFIX, STAGED_BUNDLE_PREFIX, ZIP_STAGING_PREFIX];

type ImportContributions = readonly [
  WorkloadContribution<"import-st">,
  WorkloadContribution<"import-token-usage-backfill">,
  WorkloadContribution<"import-bundle">,
];

/**
 * Resolve a server-minted staging handle to an absolute path that is a PROPER STRICT DESCENDANT of
 * `stagingRoot`, or throw. The AUTHORITATIVE containment belt (the contract-layer charset regex is the outer
 * one): a handle resolving to the staging root itself, its parent, or anywhere outside is a path-traversal
 * attempt and throws BEFORE any fs read or rm — the workload fails cleanly, nothing is touched.
 * `basename()` is NOT a containment primitive (`basename("..") === ".."`); never use it as one.
 *
 * CONTAINMENT IS RESOLVED, NEVER STRING-MATCHED. A lexical `startsWith` says "inside the root" about a path
 * whose own components are symlinks pointing anywhere on the box — and `readFile` / the profile-tree walker
 * then follow them. So the string check is only the cheap first pass: the belt is `realpath`, on the root
 * (the configured root may itself sit behind a link) and on the target, with the two required to agree.
 * "No writer of ours creates symlinks under the staging root" is not a containment argument either: the root
 * is operator-configurable (`IMPORT_STAGING_DIR`) and may point anywhere, including a shared directory.
 */
async function resolveStagedPath(stagingRoot: string, stagedHandle: string): Promise<string> {
  const root = resolve(stagingRoot);
  const target = resolve(root, stagedHandle);
  if (!isStrictDescendant(root, target, HOST_PATH)) {
    throw new DomainOperationError("staged_path_escape", `staged handle escapes the staging root: ${stagedHandle}`);
  }
  const realRoot = await realpath(root).catch(() => {
    throw new DomainOperationError("staged_path_escape", `staged handle escapes the staging root: ${stagedHandle}`);
  });
  const realTarget = await realpath(target).catch(() => {
    throw new DomainOperationError("staged_path_missing", `staged handle names nothing under the staging root: ${stagedHandle}`);
  });
  // Any symlinked component anywhere in the handle moves the real path off the expected one — refused even
  // when the link happens to land back inside the root (its target can be repointed between checks).
  if (realTarget !== resolve(realRoot, stagedHandle)) {
    throw new DomainOperationError("staged_path_escape", `staged handle escapes the staging root (symlinked path): ${stagedHandle}`);
  }
  return target;
}

/**
 * Open a staged FILE without following a link at the final component — O_NOFOLLOW makes the no-symlink half
 * of {@link resolveStagedPath} atomic with the open, closing the window between the check and the open
 * (the same flag the zip stager's own reader carries). The caller owns the handle; the extractor reads the
 * archive through it by position, so a backup is never held in memory whole.
 *
 * `O_NOFOLLOW` is POSIX-only — on a platform where it is not a number (Windows), the flags would silently
 * collapse to plain `O_RDONLY` and this belt's no-symlink half would vanish without a sound. There the open
 * is unguarded, and the atomicity is recovered AFTER the fact instead: `fstat` the open handle and `lstat`
 * the path, and refuse when they don't name the same inode — a symlink swapped in between the resolve and
 * the open changes the path's own identity out from under the already-open fd.
 */
async function openStagedFile(path: string): Promise<FileHandle> {
  const noFollowFlag: number | undefined = fsConstants.O_NOFOLLOW;
  if (typeof noFollowFlag === "number") {
    // biome-ignore lint/suspicious/noBitwiseOperators: OR-ing POSIX open() flag bits is the intended API (the zip + tree staging writers carry the same exemption).
    return await open(path, fsConstants.O_RDONLY | noFollowFlag);
  }
  const handle = await open(path, fsConstants.O_RDONLY);
  try {
    const [handleStat, pathStat] = await Promise.all([handle.stat(), lstat(path)]);
    if (handleStat.dev !== pathStat.dev || handleStat.ino !== pathStat.ino) {
      throw new DomainOperationError("staged_path_escape", `staged handle names a symlink: ${path}`);
    }
    return handle;
  } catch (err) {
    await handle.close();
    throw err;
  }
}

/** Import one staged backup ZIP through its open handle, closing the handle whatever the outcome. */
async function importStagedZip(
  runBundleImport: ImportWorkloadDeps["runBundleImport"],
  args: { readonly stagedPath: string; readonly ownerId: UserId; readonly stagingRoot: string; readonly signal: AbortSignal },
): Promise<BundleImportWorkloadResult> {
  await using archive = await openStagedFile(args.stagedPath);
  return await runBundleImport({ archive, ownerId: args.ownerId, stagingRoot: args.stagingRoot, signal: args.signal });
}

/**
 * Belt-and-suspenders rm: remove `target` ONLY when it is provably a strict descendant of `stagingRoot`
 * AT THE rm CALLSITE — so even a future refactor that computed the path unsafely can never delete the
 * staging root, its parent, or anything outside it. A non-contained target is refused SILENTLY:
 * `resolveStagedPath` already rejected the traversal loudly at compute time, so reaching here with an
 * out-of-root path means a bug, and the safe response is to delete nothing (never throw from a `finally`).
 */
async function rmContained(stagingRoot: string, target: string): Promise<void> {
  const root = resolve(stagingRoot);
  const resolved = resolve(target);
  if (!isStrictDescendant(root, resolved, HOST_PATH)) {
    return;
  }
  // A SYMLINK is never removed here. `rm` would unlink the link rather than its target, so this is not the
  // deletion hole — but a staged entry that turned into a link since the resolve is a tampering signal, and
  // deleting nothing is the safe response on a path this belt no longer recognizes.
  // both arms of this stat converge on "remove nothing" — an absent path has nothing to delete, and an unreadable one is a path this belt can no longer vouch for. It runs in a `finally` whose loud half already fired at compute time (`resolveStagedPath` throws the escape), and a genuine fs fault re-surfaces on the next run's read of the same tree. Ends if this rm becomes the only proof a staged tree was removed.
  const link = await lstat(resolved).catch(() => null);
  if (link === null || link.isSymbolicLink()) {
    return;
  }
  await rm(resolved, { recursive: true, force: true });
}

/** Free the upload a row that never ran still holds. Never rejects: its row is already terminal, and the next boot's
 *  sweep frees what this could not. An unset handle reads the configured profile dir, which is never removed. */
async function releaseStaged(deps: ImportWorkloadDeps, ownerId: UserId | null, handle: string | undefined): Promise<void> {
  if (ownerId === null || handle === undefined) {
    return;
  }
  // owned by the log line and the boot sweep, which frees whatever this could not reach. Ends if the sweep stops running at boot.
  try {
    const ownerRoot = stagedOwnerRoot(deps.stagingRoot, ownerId);
    await rmContained(ownerRoot, await resolveStagedPath(ownerRoot, handle));
  } catch (err) {
    getLog(deps.logger).warn({ err, ownerId }, "import: could not free a cancelled run's staged upload; the next boot sweeps it");
  }
}

/** The params field each staged kind names its upload in. */
const STAGED_HANDLE_FIELD: Partial<Record<WorkloadKind, string>> = { "import-st": "stagedDir", "import-bundle": "token" };

/** The handles active rows still own, read off the stored params so a row that no longer parses keeps its upload. */
function liveHandles(active: readonly ActiveWorkloadRow[]): ReadonlySet<string> {
  const handles = new Set<string>();
  for (const { kind, params } of active) {
    const field = STAGED_HANDLE_FIELD[kind];
    const handle = field !== undefined && isPlainObject(params) ? params[field] : undefined;
    if (typeof handle === "string") {
      handles.add(handle);
    }
  }
  return handles;
}

async function entriesOf(dir: string): Promise<readonly Dirent[]> {
  // A box that has never staged anything has no root to walk; the rethrow leaves every other fault to the boot sweep's log.
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

/**
 * Remove every staged upload no active row names. Safe only where boot calls it: no run is live and the listener is
 * not up, so a live extraction directory or a tree still being written cannot be here. A link is never walked: a
 * `Dirent` reports what the name is, so a linked owner directory is no directory, and {@link rmContained} refuses the rest.
 */
async function sweepStaging(deps: ImportWorkloadDeps, active: readonly ActiveWorkloadRow[]): Promise<void> {
  const live = liveHandles(active);
  const root = resolve(deps.stagingRoot);
  let removed = 0;
  for (const owner of await entriesOf(root)) {
    if (!owner.isDirectory()) {
      continue;
    }
    const ownerRoot = join(root, owner.name);
    for (const { name } of await entriesOf(ownerRoot)) {
      if (STAGED_PREFIXES.some((prefix) => name.startsWith(prefix)) && !live.has(name)) {
        await rmContained(ownerRoot, join(ownerRoot, name));
        removed += 1;
      }
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
      // Every per-entity write is dedupe-gated, so a retry re-runs the whole loop safely.
      resume: "idempotent-restart",
      releaseUnrun: ({ ownerId, params }) => releaseStaged(deps, ownerId, params.stagedDir),
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
        const profileRoot = params.stagedDir !== undefined ? await resolveStagedPath(ownerRoot, params.stagedDir) : deps.stProfileDir;
        let result: Awaited<ReturnType<ImportWorkloadDeps["runProfileDirImport"]>>;
        try {
          result = await deps.runProfileDirImport({
            profileRoot,
            ownerId: targetOwnerId,
            dryRun,
            signal,
            personaCollisions: params.personaCollisions,
          });
        } finally {
          // A folder-upload staging tree is owned by this run; remove it (success OR error) through the
          // contained-rm belt. The configured default profile dir is persistent and is NEVER removed here.
          if (params.stagedDir !== undefined) {
            await rmContained(ownerRoot, profileRoot);
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
      releaseUnrun: ({ ownerId, params }) => releaseStaged(deps, ownerId, params.token),
      run: async (ctx, params, report, signal): Promise<BundleImportWorkloadResult> => {
        const targetOwnerId = ctx.ownerId;
        if (targetOwnerId === null) {
          throw new DomainOperationError("import_target_required", "import-bundle: no target owner (a bundle must be scoped to the uploader)");
        }
        report({ message: "importing bundle" });
        const ownerRoot = stagedOwnerRoot(deps.stagingRoot, targetOwnerId);
        const stagedPath = await resolveStagedPath(ownerRoot, params.token);
        try {
          const report_ =
            params.source === "dir"
              ? await deps.runStagedDirImport({ stagedPath, ownerId: targetOwnerId, signal })
              : await importStagedZip(deps.runBundleImport, { stagedPath, ownerId: targetOwnerId, stagingRoot: ownerRoot, signal });
          // #23: a background bundle/tree import that wrote canon refreshes the owner's character + chat lists
          // (the client's own completion invalidation only fires while the import UI stayed mounted).
          if (report_.imported > 0) {
            await refreshPlannerAfterImport(deps.refreshPlannerStats, targetOwnerId, report, deps.logger);
            deps.emitLibraryChanged({ ownerId: targetOwnerId });
          }
          // #1710 — a background run surfaces the SAME per-file notes (#1688) a sync door would: what a file
          // that DID import still left behind (a kept edited lorebook, a dropped overlay). Named on the run's
          // own progress stream, not only buried in the terminal result.
          for (const note of report_.notes) {
            report({ message: note });
          }
          return report_;
        } finally {
          await rmContained(ownerRoot, stagedPath);
        }
      },
    },
  ];
}
