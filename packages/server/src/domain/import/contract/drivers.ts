import type { Principal } from "@orb/contracts/identity";
import type { BundleImportDeps, BundleImportReport, StagedBundleImportDeps } from "./bundle.ts";
import type { ImportReport } from "./results.ts";
import type { ImportWorkloadDeps, SettleImportMemory } from "./workloads.ts";

export type ImportWorkloadDrivers = Pick<ImportWorkloadDeps, "runProfileDirImport" | "runBundleImport" | "runStagedDirImport">;
export interface ImportDriverDeps {
  readonly now: () => number;
  readonly quiet: <T>(run: () => Promise<T>) => Promise<T>;
  readonly resolveOwnerPrincipal: (ownerId: Principal["userId"]) => Promise<Principal>;
  readonly profile: (principal: Principal, args: Parameters<ImportWorkloadDeps["runProfileDirImport"]>[0]) => Promise<ImportReport>;
  readonly bundle: (args: Pick<BundleImportDeps, "ownerId" | "archive" | "signal" | "extractOptions">) => Promise<BundleImportReport>;
  readonly staged: (args: Pick<StagedBundleImportDeps, "ownerId" | "signal"> & { readonly stagedPath: string }) => Promise<BundleImportReport>;
  readonly writeReport: (markdown: string, generatedAt: number) => Promise<string>;
  readonly reconcileStats: ImportWorkloadDeps["reconcileImportStats"];
  readonly settleMemory: SettleImportMemory;
}
