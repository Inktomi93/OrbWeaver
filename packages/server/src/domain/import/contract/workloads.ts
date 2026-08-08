// domain/import/contract/workloads — the DI bundle import's `WorkloadContribution` factory closes over.
//
// The two DRIVERS are injected-op TYPES, not imports: `runProfileDirImport`/`runBundleImport`/
// `runStagedDirImport` are cross-domain compositions (they fan into character/chat/persona/world-info/tag/
// assets), so they are composed once at `entry/` and handed in. `reconcileImportStats` is the SAME op the
// portability descriptors take — one slice, built once, shared by both consumers.

import type { UserId } from "@orb/kit/ids";

/** A bulk import's pass counts (rows examined / rows written). */
interface ImportPassCounts {
  readonly scanned: number;
  readonly changed: number;
  /** Cards skipped by per-card isolation (a single card's defect never aborts the batch). */
  readonly failed: number;
  /** Path to the written import report (what landed / what didn't). Absent on a dry run (nothing written). */
  readonly reportPath?: string;
}

/** A bundle import's per-entity tallies, as the delivery core reports them. */
interface BundleImportCounts {
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
}

export interface ImportWorkloadDeps {
  /** The staging root the HTTP upload routes wrote under — every staged handle resolves strictly inside it. */
  readonly stagingRoot: string;
  /** The ST profile directory `import-st` reads when the row carries no `stagedDir` override. */
  readonly stProfileDir: string;
  /** The ST profile-directory bulk loop (personas first, then per-bundle character + chats). */
  readonly runProfileDirImport: (args: { profileRoot: string; ownerId: UserId; dryRun: boolean; signal: AbortSignal }) => Promise<ImportPassCounts>;
  /** The single-archive portability import (its own extract belts + caps). */
  readonly runBundleImport: (args: { archive: Uint8Array; ownerId: UserId; stagingRoot: string; signal: AbortSignal }) => Promise<BundleImportCounts>;
  /** The folder-upload variant: a staged directory tree walked through the SAME entity routing. */
  readonly runStagedDirImport: (args: { stagedPath: string; ownerId: UserId; signal: AbortSignal }) => Promise<BundleImportCounts>;
  /** Rebuild the freshly-imported owner's stats rollups from canon (the post-settle). The same injected op
   *  the portability descriptors take — one slice, one home. */
  readonly reconcileImportStats: (args: { readonly ownerId: UserId }) => Promise<void>;
}
