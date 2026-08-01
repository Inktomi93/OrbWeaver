// domain/import — the domain's OWN background work, raised as `WorkloadContribution`s (the workloads
// junk-drawer exit: domains raise seams, the worker skims them). Two kinds: `import-st` (the SillyTavern
// profile-directory bulk loop) and `import-bundle` (one staged portability zip / folder-upload tree).
//
// Both are off-request MANDATORY — the HTTP route stages bytes, replies 202 `{workloadId}`, and the run
// survives request death. The DRIVERS stay entry-composed ops (they are cross-domain compositions by
// nature — the profile importer fans into character/chat/persona/world-info/tag/assets); what lives here is
// the CONTRIBUTION: the params/result contract, the lane/resume policy, the post-settle stats reconcile, and
// the STAGING-CONTAINMENT belts (import logic, never compose logic).

import { readFile, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { BundleImportWorkloadResult, MaintenanceResult } from "@orb/contracts/workloads";
import { importBundleWorkloadParams, importStWorkloadParams } from "@orb/contracts/workloads";
import { DomainOperationError } from "@orb/kit/errors";
import type { WorkloadContribution } from "#domain/workloads";
import type { ImportWorkloadDeps } from "./contract/workloads";

type ImportContributions = readonly [WorkloadContribution<"import-st">, WorkloadContribution<"import-bundle">];

/**
 * Resolve a server-minted staging handle to an absolute path that is a PROPER STRICT DESCENDANT of
 * `stagingRoot`, or throw. The AUTHORITATIVE containment belt (the contract-layer charset regex is the outer
 * one): a handle resolving to the staging root itself, its parent, or anywhere outside is a path-traversal
 * attempt and throws BEFORE any fs read or rm — the workload fails cleanly, nothing is touched.
 * `basename()` is NOT a containment primitive (`basename("..") === ".."`); never use it as one.
 */
function resolveStagedPath(stagingRoot: string, handle: string): string {
  const root = resolve(stagingRoot);
  const target = resolve(root, handle);
  if (target === root || !target.startsWith(root + sep)) {
    throw new DomainOperationError("staged_path_escape", `staged handle escapes the staging root: ${handle}`);
  }
  return target;
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
  await rm(resolved, { recursive: true, force: true });
}

export function createImportWorkloadContributions(deps: ImportWorkloadDeps): ImportContributions {
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
        const profileRoot = params.stagedDir !== undefined ? resolveStagedPath(deps.stagingRoot, params.stagedDir) : deps.stProfileDir;
        let result: { readonly scanned: number; readonly changed: number };
        try {
          result = await deps.runProfileDirImport({ profileRoot, ownerId: targetOwnerId, dryRun, signal });
        } finally {
          // A folder-upload staging tree is owned by this run; remove it (success OR error) through the
          // contained-rm belt. The configured default profile dir is persistent and is NEVER removed here.
          if (params.stagedDir !== undefined) {
            await rmContained(deps.stagingRoot, profileRoot);
          }
        }
        if (!dryRun && result.changed > 0) {
          report({ message: "reconciling stats post-import" });
          await deps.reconcileImportStats({ ownerId: targetOwnerId });
        }
        return { scanned: result.scanned, changed: result.changed, dryRun };
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
        const stagedPath = resolveStagedPath(deps.stagingRoot, params.token);
        try {
          const report_ =
            params.source === "dir"
              ? await deps.runStagedDirImport({ stagedPath, ownerId: targetOwnerId, signal })
              : await deps.runBundleImport({ archive: await readFile(stagedPath), ownerId: targetOwnerId, stagingRoot: deps.stagingRoot, signal });
          return { imported: report_.imported, skipped: report_.skipped, failed: report_.failed };
        } finally {
          await rmContained(deps.stagingRoot, stagedPath);
        }
      },
    },
  ];
}
