// Import orchestration runs in the owner; composition supplies the foreign operations and external edges.

import type { FileHandle } from "node:fs/promises";
import type { CompareAndSetImportedTokenUsage, ImportWindow, ListImportedTokenUsageCandidates } from "@orb/contracts/chat";
import type { PersonaCollisionChoices } from "@orb/contracts/import";
import type { BundleImportWorkloadResult, ImportTokenUsageBackfillResult, ReportProgress } from "@orb/contracts/workloads";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { Logger } from "#foundation/observability";

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
  /** Folded names of personas merged into an owned persona of the same name (not a skip, not new canon). */
  readonly mergedKeys?: readonly string[];
  /** Path to the written import report (what landed / what didn't). Absent on a dry run (nothing written). */
  readonly reportPath?: string;
  /** The span in which the run wrote real conversations (null = none): the client's memory-build offer scope. */
  readonly memoryScope: ImportWindow | null;
}

/** Close an import's memory scope once its writes are done: `from` is the server clock read before the import
 *  started. Returns the span as the import's scope handle, or null when the import wrote no real conversation.
 *  Every import door (the workload runs and the synchronous chat route) settles through the one composed op. */
export type SettleImportMemory = (args: {
  readonly ownerId: UserId;
  readonly from: number;
  readonly memoryChatIds: readonly ChatId[];
}) => Promise<ImportWindow | null>;

export interface ImportWorkloadDeps extends ImportTokenUsageBackfillDeps {
  readonly logger: Logger;
  /** The staging root the HTTP upload routes wrote under — every staged handle resolves strictly inside it. */
  readonly stagingRoot: string;
  /** The ST profile directory `import-st` reads when the row carries no `stagedDir` override. */
  readonly stProfileDir: string;
  /** The ST profile-directory bulk loop (personas first, then per-bundle character + chats). */
  readonly runProfileDirImport: (args: {
    profileRoot: string;
    ownerId: UserId;
    dryRun: boolean;
    signal: AbortSignal;
    personaCollisions: PersonaCollisionChoices | undefined;
  }) => Promise<ImportPassCounts>;
  /** The single-archive portability import (its own extract belts + caps). `archive` is the open staged upload,
   *  read by position and closed by the caller. */
  readonly runBundleImport: (args: { archive: FileHandle; ownerId: UserId; stagingRoot: string; signal: AbortSignal }) => Promise<BundleImportWorkloadResult>;
  /** The folder-upload variant: a staged directory tree walked through the SAME entity routing. */
  readonly runStagedDirImport: (args: { stagedPath: string; ownerId: UserId; signal: AbortSignal }) => Promise<BundleImportWorkloadResult>;
  /** Rebuild the freshly-imported owner's stats rollups from canon (the post-settle). The same injected op
   *  the portability descriptors take — one slice, one home. */
  readonly reconcileImportStats: (args: { readonly ownerId: UserId }) => Promise<void>;
  /** System planner maintenance, once after a completed bulk import, never per entity. */
  readonly refreshPlannerStats: (args: { readonly ownerId: UserId }) => Promise<void>;
  /** Fan the "your library changed" user-bus events (`charactersChanged` + `chatsChanged`) to the target
   *  owner ONCE at the end of a run that wrote canon (#23). A background import runs off-request, so the
   *  import UI's own completion invalidation may never fire (the section was navigated away from) — and the
   *  chat bulk-import write path emits nothing of its own. This terminal fan is the always-on driver that
   *  refreshes the owner's character + chat lists with no manual cache clear. Injected (the domain
   *  sideways-imports no transport); wired at the composition root. */
  readonly emitLibraryChanged: (args: { readonly ownerId: UserId }) => void;
}
