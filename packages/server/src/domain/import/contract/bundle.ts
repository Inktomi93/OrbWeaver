import type { PortabilityRegistry, PortableImportOutcome, PortableKind } from "@orb/contracts/portability";
import type { UserId } from "@orb/kit/ids";
import type { ExtractOptions, StagedArchive, ZipSource } from "#infra/storage";

/** One file's bundle-import outcome, aggregated into the operator-auditable report. `kind: null` marks a
 *  file whose directory matched no registered entity (skipped, not failed); `notes` carries what a file that
 *  DID import still left behind (#1688). */
export type BundleImportFileOutcome =
  | (Extract<PortableImportOutcome, { readonly ok: true }> & { readonly kind: PortableKind; readonly path: string; readonly notAttempted?: never })
  | (Extract<PortableImportOutcome, { readonly ok: false }> & { readonly kind: PortableKind | null; readonly path: string; readonly notAttempted?: true });

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
  readonly archive: ZipSource;
  /** The staging extractor the root wires from `infra/storage` (it writes the staging tree to disk). */
  readonly extractArchive: (archive: BundleImportDeps["archive"], options?: ExtractOptions) => Promise<StagedArchive>;
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
