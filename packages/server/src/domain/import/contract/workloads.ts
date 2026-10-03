// domain/import/contract/workloads — the DI bundle import's `WorkloadContribution` factory closes over.
//
// The two DRIVERS are injected-op TYPES, not imports: `runProfileDirImport`/`runBundleImport`/
// `runStagedDirImport` are cross-domain compositions (they fan into character/chat/persona/world-info/tag/
// assets), so they are composed once at `entry/` and handed in. `reconcileImportStats` is the SAME op the
// portability descriptors take — one slice, built once, shared by both consumers.

import type { CompareAndSetImportedTokenUsage, ListImportedTokenUsageCandidates } from "@orb/contracts/chat";
import type { BundleImportWorkloadResult, ImportTokenUsageBackfillResult, ReportProgress } from "@orb/contracts/workloads";
import type { ChatId, UserId } from "@orb/kit/ids";

export interface ImportTokenUsageBackfillDeps {
  readonly listTokenUsageCandidates: ListImportedTokenUsageCandidates;
  readonly compareAndSetTokenUsage: CompareAndSetImportedTokenUsage;
  readonly reconcileImportStats: (args: { readonly ownerId: UserId }) => Promise<void>;
}

/** The import-owned catch-up verb after its cross-domain persistence dependencies are composed. */
export type BackfillTokenUsage = (args: {
  readonly ownerId: UserId | null;
  readonly dryRun: boolean;
  readonly report: ReportProgress;
  readonly signal: AbortSignal;
}) => Promise<ImportTokenUsageBackfillResult>;

/** A bulk import's pass counts (rows examined / rows written). */
interface ImportPassCounts {
  readonly scanned: number;
  readonly changed: number;
  /** Cards skipped by per-card isolation (a single card's defect never aborts the batch). */
  readonly failed: number;
  /** Path to the written import report (what landed / what didn't). Absent on a dry run (nothing written). */
  readonly reportPath?: string;
  /** The real conversations the run wrote — the scope of the client's memory-build offer. */
  readonly memoryChatIds: readonly ChatId[];
}

export interface ImportWorkloadDeps extends ImportTokenUsageBackfillDeps {
  /** The staging root the HTTP upload routes wrote under — every staged handle resolves strictly inside it. */
  readonly stagingRoot: string;
  /** The ST profile directory `import-st` reads when the row carries no `stagedDir` override. */
  readonly stProfileDir: string;
  /** The ST profile-directory bulk loop (personas first, then per-bundle character + chats). */
  readonly runProfileDirImport: (args: { profileRoot: string; ownerId: UserId; dryRun: boolean; signal: AbortSignal }) => Promise<ImportPassCounts>;
  /** The single-archive portability import (its own extract belts + caps). */
  readonly runBundleImport: (args: { archive: Uint8Array; ownerId: UserId; stagingRoot: string; signal: AbortSignal }) => Promise<BundleImportWorkloadResult>;
  /** The folder-upload variant: a staged directory tree walked through the SAME entity routing. */
  readonly runStagedDirImport: (args: { stagedPath: string; ownerId: UserId; signal: AbortSignal }) => Promise<BundleImportWorkloadResult>;
  /** Rebuild the freshly-imported owner's stats rollups from canon (the post-settle). The same injected op
   *  the portability descriptors take — one slice, one home. */
  readonly reconcileImportStats: (args: { readonly ownerId: UserId }) => Promise<void>;
  /** Fan the "your library changed" user-bus events (`charactersChanged` + `chatsChanged`) to the target
   *  owner ONCE at the end of a run that wrote canon (#23). A background import runs off-request, so the
   *  import UI's own completion invalidation may never fire (the section was navigated away from) — and the
   *  chat bulk-import write path emits nothing of its own. This terminal fan is the always-on driver that
   *  refreshes the owner's character + chat lists with no manual cache clear. Injected (the domain
   *  sideways-imports no transport); wired at the composition root. */
  readonly emitLibraryChanged: (args: { readonly ownerId: UserId }) => void;
}
