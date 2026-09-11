// domain/import — the domain's OWN background work, raised as `WorkloadContribution`s (the workloads
// junk-drawer exit: domains raise seams, the worker skims them). Two kinds: `import-st` (the SillyTavern
// profile-directory bulk loop) and `import-bundle` (one staged portability zip / folder-upload tree).
//
// Both are off-request MANDATORY — the HTTP route stages bytes, replies 202 `{workloadId}`, and the run
// survives request death. The DRIVERS stay entry-composed ops (they are cross-domain compositions by
// nature — the profile importer fans into character/chat/persona/world-info/tag/assets); what lives here is
// the CONTRIBUTION: the params/result contract, the lane/resume policy, the post-settle stats reconcile, and
// the STAGING-CONTAINMENT belts (import logic, never compose logic).
//
// EVERY HANDLE RESOLVES UNDER THE ROW OWNER'S OWN STAGING ROOT (#1534). `params.token`/`params.stagedDir` are
// caller-settable on an `authedProcedure` singular kind, so a handle names bytes but authorizes nothing; the
// authority is `ctx.ownerId` — the server-stamped row owner, which is also the library the import WRITES to.
// `stagedOwnerRoot` is the one derivation the staging routes and this file share (`substrate/staging.ts`
// states the why), so another user's handle simply does not exist under this run's root and dies on the
// containment belt's `staged_path_missing` before any read — and, just as load-bearing, before the cleanup
// `finally` can delete someone else's staged upload.

import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { BundleImportWorkloadResult, ImportTokenUsageBackfillResult, MaintenanceResult, ReportProgress } from "@orb/contracts/workloads";
import { importBundleWorkloadParams, importStWorkloadParams, maintenanceWorkloadParams } from "@orb/contracts/workloads";
import { DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import type { WorkloadContribution } from "#domain/workloads";
import type { ImportWorkloadDeps } from "./contract/workloads.ts";
import { stagedOwnerRoot } from "./substrate/staging.ts";
import { createBackfillTokenUsage } from "./verbs/backfill-token-usage.ts";

/** Post-settle side effects of an import-st run: surface the skip count + report path to the workload
 *  progress, then reconcile owner stats on a real run that wrote canon. Extracted to keep the run body under
 *  the cognitive-complexity gate. */
async function settleImportRun(args: {
  readonly result: { readonly failed: number; readonly changed: number; readonly reportPath?: string };
  readonly dryRun: boolean;
  readonly ownerId: UserId;
  readonly report: ReportProgress;
  readonly reconcileImportStats: (a: { readonly ownerId: UserId }) => Promise<void>;
  readonly emitLibraryChanged: (a: { readonly ownerId: UserId }) => void;
}): Promise<void> {
  const { result, dryRun, ownerId, report, reconcileImportStats, emitLibraryChanged } = args;
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
    // #23: refresh the owner's character + chat lists (background import has no other client driver).
    emitLibraryChanged({ ownerId });
  }
}

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
  if (target === root || !target.startsWith(root + sep)) {
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

/** Read a staged FILE without following a link at the final component — O_NOFOLLOW makes the no-symlink half
 *  of {@link resolveStagedPath} atomic with the read, closing the window between the check and the open
 *  (the same flag the zip stager's own reader carries). */
async function readStagedFile(path: string): Promise<Uint8Array> {
  // biome-ignore lint/suspicious/noBitwiseOperators: OR-ing POSIX open() flag bits is the intended API (the zip + tree staging writers carry the same exemption).
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const data = await handle.readFile();
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } finally {
    await handle.close();
  }
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
  if (resolved === root || !resolved.startsWith(root + sep)) {
    return;
  }
  // A SYMLINK is never removed here. `rm` would unlink the link rather than its target, so this is not the
  // deletion hole — but a staged entry that turned into a link since the resolve is a tampering signal, and
  // deleting nothing is the safe response on a path this belt no longer recognizes.
  // @orb-waive caught-failure-ownership(lstat): both arms of this stat converge on "remove nothing" — an absent path has nothing to delete, and an unreadable one is a path this belt can no longer vouch for. It runs in a `finally` whose loud half already fired at compute time (`resolveStagedPath` throws the escape), and a genuine fs fault re-surfaces on the next run's read of the same tree. Ends if this rm becomes the only proof a staged tree was removed.
  const link = await lstat(resolved).catch(() => null);
  if (link === null || link.isSymbolicLink()) {
    return;
  }
  await rm(resolved, { recursive: true, force: true });
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
        let result: { readonly scanned: number; readonly changed: number; readonly failed: number; readonly reportPath?: string };
        try {
          result = await deps.runProfileDirImport({ profileRoot, ownerId: targetOwnerId, dryRun, signal });
        } finally {
          // A folder-upload staging tree is owned by this run; remove it (success OR error) through the
          // contained-rm belt. The configured default profile dir is persistent and is NEVER removed here.
          if (params.stagedDir !== undefined) {
            await rmContained(ownerRoot, profileRoot);
          }
        }
        await settleImportRun({
          result,
          dryRun,
          ownerId: targetOwnerId,
          report,
          reconcileImportStats: deps.reconcileImportStats,
          emitLibraryChanged: deps.emitLibraryChanged,
        });
        return {
          scanned: result.scanned,
          changed: result.changed,
          dryRun,
          failed: result.failed,
          ...(result.reportPath !== undefined ? { reportPath: result.reportPath } : {}),
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
              : await deps.runBundleImport({ archive: await readStagedFile(stagedPath), ownerId: targetOwnerId, stagingRoot: ownerRoot, signal });
          // #23: a background bundle/tree import that wrote canon refreshes the owner's character + chat lists
          // (the client's own completion invalidation only fires while the import UI stayed mounted).
          if (report_.imported > 0) {
            deps.emitLibraryChanged({ ownerId: targetOwnerId });
          }
          // #1710 — a background run surfaces the SAME per-file notes (#1688) a sync door would: what a file
          // that DID import still left behind (a kept edited lorebook, a dropped overlay). Named on the run's
          // own progress stream, not only buried in the terminal result.
          for (const note of report_.notes) {
            report({ message: note });
          }
          return { imported: report_.imported, skipped: report_.skipped, failed: report_.failed, notes: report_.notes };
        } finally {
          await rmContained(ownerRoot, stagedPath);
        }
      },
    },
  ];
}
