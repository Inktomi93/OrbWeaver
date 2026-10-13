import type { PortabilityRegistry, PortableImportOutcome, PortableKind } from "@orb/contracts/portability";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { ExtractOptions, StagedArchive } from "#infra/storage";

/** One file's bundle-import outcome, aggregated into the operator-auditable report. `kind: null` marks a
 *  file whose directory matched no registered entity (skipped, not failed); `notes` carries what a file that
 *  DID import still left behind (#1688). */
export interface BundleImportFileOutcome {
  readonly kind: PortableKind | null;
  /** The file's full path within the archive (e.g. "characters/Aria.png"). */
  readonly path: string;
  readonly ok: boolean;
  /** Set on a successful import: true = a new row, false = deduped/replaced (idempotent re-import). */
  readonly created?: boolean;
  /** Set when ok is false: the skip/failure reason (unknown dir, a per-file importFile error, or a throw). */
  readonly error?: string;
  /** The descriptor's own {@link PortableImportOutcome.notes} — what a file that DID import deliberately left
   *  behind (#1688). Absent ⇒ the entity restored whole. Carried per file rather than tallied: a note names a
   *  plane of ONE file, and a count would tell the operator a campaign was dropped without saying which. */
  readonly notes?: readonly string[];
  /** The descriptor's own {@link PortableImportOutcome.memoryChatIds}; absent ⇒ the file wrote no real conversation. */
  readonly memoryChatIds?: readonly ChatId[];
  /** Set when the driver never even TRIED this file — the run was aborted before reaching it. It is a SKIP,
   *  not a failure: nothing was attempted, so nothing failed. Before this the unreached files vanished from
   *  the report entirely and a cancelled half-import read as a complete one. */
  readonly notAttempted?: true;
}

/** The per-bundle report the route returns (or the workload records). */
export interface BundleImportReport {
  readonly outcomes: readonly BundleImportFileOutcome[];
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
  /** True when the signal fired mid-run: the counts describe a PARTIAL import, and every file the driver did
   *  not reach is present in `outcomes` with `notAttempted`. */
  readonly aborted: boolean;
}

export interface BundleImportDeps {
  readonly registry: PortabilityRegistry;
  readonly ownerId: UserId;
  readonly archive: Uint8Array | ReadableStream<Uint8Array>;
  readonly extractOptions?: ExtractOptions;
  readonly signal?: AbortSignal;
}

/** What {@link importStagedArchive} needs: an already-staged tree (from `extractZip` OR `stageDirectory`)
 *  plus the routing registry + target owner. `staged.dispose()` runs in the finally regardless of outcome. */
export interface StagedBundleImportDeps {
  readonly registry: PortabilityRegistry;
  readonly ownerId: UserId;
  readonly staged: StagedArchive;
  readonly signal?: AbortSignal;
}
