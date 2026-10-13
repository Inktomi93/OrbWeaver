import { IMPORT_MAX_DECOMPRESSED_BYTES, IMPORT_MAX_TOTAL_BYTES } from "@orb/contracts/uploads";
import type { BundleImportWorkloadResult } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import type { BundleImportReport } from "../contract/bundle.ts";
import type { ImportDriverDeps, ImportWorkloadDrivers } from "../contract/drivers.ts";
import { bundleImportMemoryChatIds, bundleImportNotes } from "../substrate/bundle-report.ts";
import { formatImportReport } from "../substrate/report.ts";

async function settleBundle(deps: ImportDriverDeps, report: BundleImportReport, ownerId: UserId, from: number): Promise<BundleImportWorkloadResult> {
  if (report.imported > 0) {
    await deps.reconcileStats({ ownerId });
  }
  return {
    imported: report.imported,
    skipped: report.skipped,
    failed: report.failed,
    notes: bundleImportNotes(report),
    memoryScope: await deps.settleMemory({ ownerId, from, memoryChatIds: bundleImportMemoryChatIds(report) }),
  };
}

/** Bulk run boundaries preserve quiet fanout, report effects and result settlement in write order. */
export function createImportWorkloadDrivers(deps: ImportDriverDeps): ImportWorkloadDrivers {
  return {
    runProfileDirImport: (args): ReturnType<ImportWorkloadDrivers["runProfileDirImport"]> =>
      deps.quiet(async () => {
        const principal = await deps.resolveOwnerPrincipal(args.ownerId);
        const from = deps.now();
        const report = await deps.profile(principal, args);
        let reportPath: string | undefined;
        if (!args.dryRun) {
          const generatedAt = deps.now();
          reportPath = await deps.writeReport(formatImportReport(report, generatedAt), generatedAt);
        }
        return {
          scanned: report.scanned,
          changed: report.changed,
          failed: report.skippedCards.length,
          mergedKeys: report.personasMergedKeys,
          memoryScope: await deps.settleMemory({ ownerId: args.ownerId, from, memoryChatIds: report.memoryChatIds }),
          ...(reportPath !== undefined ? { reportPath } : {}),
        };
      }),
    runBundleImport: (args): ReturnType<ImportWorkloadDrivers["runBundleImport"]> =>
      deps.quiet(async () => {
        const from = deps.now();
        const report = await deps.bundle({
          ownerId: args.ownerId,
          archive: args.archive,
          extractOptions: { maxTotalBytes: IMPORT_MAX_TOTAL_BYTES, maxTotalDecompressedBytes: IMPORT_MAX_DECOMPRESSED_BYTES, stagingRoot: args.stagingRoot },
          signal: args.signal,
        });
        return settleBundle(deps, report, args.ownerId, from);
      }),
    runStagedDirImport: (args): ReturnType<ImportWorkloadDrivers["runStagedDirImport"]> =>
      deps.quiet(async () => {
        const from = deps.now();
        const report = await deps.staged(args);
        return settleBundle(deps, report, args.ownerId, from);
      }),
  };
}
