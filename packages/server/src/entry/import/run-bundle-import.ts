// The entity-agnostic bundle-import composition driver: extracts an untrusted archive through the
// infra/storage/zip belt battery, routes each file to its owning entity's importFile by leading
// directory, and imports in the fixed PORTABLE_IMPORT_ORDER dependency order so cross-entity attachments
// resolve. Consumes the injected PortabilityRegistry — knows nothing about any specific entity.
//
// Per-file isolation: a descriptor's importFile never throws for a malformed file, but the driver also
// try/catches so a throwing descriptor can't abort the bundle. A file whose leading dir matches no
// registered entity is a benign skip. A hostile archive is rejected whole by extractZip — nothing written.
//
// Memory: extractZip stages decompressed entries to a temp disk dir; the driver holds only lazy read
// handles and reads each entry's bytes off disk just before its importFile, so peak memory is one entry.
// Must dispose() the staged archive in a try/finally.
//
// Cancellation is the driver's job: the optional signal is checked between files.

import type { PortabilityRegistry, PortableEntity, PortableImportOutcome, PortableKind } from "@orb/contracts/portability";
import { PORTABLE_IMPORT_ORDER } from "@orb/contracts/portability";
import type { UserId } from "@orb/kit/ids";
import type { ExtractOptions, StagedArchive } from "#infra/storage";
import { extractZip } from "#infra/storage";

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

/** Every per-file {@link BundleImportFileOutcome.notes} in the report, flattened in file order (#1710). This
 *  is the ONE derivation of "what did a bundle import leave behind" — a caller that needs the operator-facing
 *  notes (the workload result, a future sync route) reads them off HERE rather than re-walking `outcomes`
 *  itself, so a new note-carrying entity plane is visible everywhere without a second traversal to update. */
export function bundleImportNotes(report: BundleImportReport): readonly string[] {
  return report.outcomes.flatMap((outcome) => outcome.notes ?? []);
}

/** The leading directory of an archive path, including the trailing slash, or null for a top-level file. */
function leadingDir(path: string): string | null {
  const slash = path.indexOf("/");
  return slash === -1 ? null : path.slice(0, slash + 1);
}

/** One staged file routed to an entity: its dir-relative name + a lazy reader over the staging disk. */
interface StagedFile {
  readonly filename: string;
  readonly read: () => Promise<Uint8Array>;
}

/** Group the staged entries by their leading directory. Files with no directory are unroutable skips. */
function groupByDir(staged: StagedArchive): {
  readonly byDir: Map<string, StagedFile[]>;
  readonly unrouted: string[];
} {
  const byDir = new Map<string, StagedFile[]>();
  const unrouted: string[] = [];
  for (const entry of staged.entries) {
    const dir = leadingDir(entry.path);
    if (dir === null) {
      unrouted.push(entry.path);
      continue;
    }
    const bucket = byDir.get(dir) ?? [];
    bucket.push({ filename: entry.path.slice(dir.length), read: entry.read });
    byDir.set(dir, bucket);
  }
  return { byDir, unrouted };
}

/** The unreached files of one entity, as `notAttempted` outcomes — the abort's honest tail. */
function notAttemptedFrom(entity: PortableEntity, files: readonly StagedFile[]): BundleImportFileOutcome[] {
  return files.map((staged) => ({
    kind: entity.kind,
    path: `${entity.dir}${staged.filename}`,
    ok: false,
    error: "not imported — the bundle import was aborted before this file",
    notAttempted: true as const,
  }));
}

/** Import every file routed to one entity, isolating per-file failures into outcomes. */
async function importEntity(
  entity: PortableEntity,
  files: readonly StagedFile[],
  ownerId: UserId,
  signal: AbortSignal | undefined,
): Promise<BundleImportFileOutcome[]> {
  const outcomes: BundleImportFileOutcome[] = [];
  for (const [i, staged] of files.entries()) {
    if (signal?.aborted === true) {
      // Everything from HERE on is unreached, not skipped-by-routing and not failed. Naming it is what keeps
      // a cancelled bundle from reporting the same shape as a complete one.
      outcomes.push(...notAttemptedFrom(entity, files.slice(i)));
      break;
    }
    const path = `${entity.dir}${staged.filename}`;
    // @orb-waive caught-failure-ownership(err): bookkeeping — the failure is recorded as an
    // `ok: false` outcome (with message) pushed into `outcomes`, the function's own return value; one bad
    // file never aborts the batch. Ends if `outcomes` stops being read by the caller.
    try {
      const bytes = await staged.read();
      const result = await entity.importFile(ownerId, { filename: staged.filename, bytes });
      outcomes.push({
        kind: entity.kind,
        path,
        ok: result.ok,
        ...(result.created !== undefined ? { created: result.created } : {}),
        ...(result.error !== undefined ? { error: result.error } : {}),
        // Forwarded only when the descriptor said something: an empty list on every clean file would bury the
        // one file that has a note.
        ...(result.notes !== undefined && result.notes.length > 0 ? { notes: result.notes } : {}),
      });
    } catch (err) {
      outcomes.push({
        kind: entity.kind,
        path,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return outcomes;
}

/** Import every registered entity in the fixed dependency order. A kind with no registered descriptor, or
 *  no files in the bundle, is simply absent from the pass. */
async function importInDepOrder(
  registry: PortabilityRegistry,
  byDir: ReadonlyMap<string, readonly StagedFile[]>,
  ownerId: UserId,
  signal: AbortSignal | undefined,
): Promise<BundleImportFileOutcome[]> {
  const byKind = new Map<PortableKind, PortableEntity>();
  for (const entity of registry) {
    byKind.set(entity.kind, entity);
  }
  const outcomes: BundleImportFileOutcome[] = [];
  for (const kind of PORTABLE_IMPORT_ORDER) {
    const entity = byKind.get(kind);
    const files = entity === undefined ? undefined : byDir.get(entity.dir);
    if (entity === undefined || files === undefined || files.length === 0) {
      continue;
    }
    if (signal?.aborted === true) {
      // A WHOLE wave the abort landed before: every one of its files is named, not dropped.
      outcomes.push(...notAttemptedFrom(entity, files));
      continue;
    }
    outcomes.push(...(await importEntity(entity, files, ownerId, signal)));
  }
  return outcomes;
}

/** Record every file that matched no registered entity as a skip. */
function collectSkips(
  registry: PortabilityRegistry,
  byDir: ReadonlyMap<string, readonly StagedFile[]>,
  unrouted: readonly string[],
): BundleImportFileOutcome[] {
  const registeredDirs = new Set(registry.map((e) => e.dir));
  const outcomes: BundleImportFileOutcome[] = [];
  for (const [dir, files] of byDir) {
    if (registeredDirs.has(dir)) {
      continue;
    }
    for (const file of files) {
      outcomes.push({
        kind: null,
        path: `${dir}${file.filename}`,
        ok: false,
        error: `no registered entity for directory "${dir}"`,
      });
    }
  }
  for (const path of unrouted) {
    outcomes.push({ kind: null, path, ok: false, error: "file is not under any entity directory" });
  }
  return outcomes;
}

function tally(outcomes: readonly BundleImportFileOutcome[]): {
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
} {
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  for (const outcome of outcomes) {
    if (outcome.ok) {
      imported++;
      // A file nobody routed, and a file the abort never reached, are both SKIPS — neither was attempted, so
      // neither is a failure the operator should chase.
    } else if (outcome.kind === null || outcome.notAttempted === true) {
      skipped++;
    } else {
      failed++;
    }
  }
  return { imported, skipped, failed };
}

/** What {@link importStagedArchive} needs: an already-staged tree (from `extractZip` OR `stageDirectory`)
 *  plus the routing registry + target owner. `staged.dispose()` runs in the finally regardless of outcome. */
export interface StagedBundleImportDeps {
  readonly registry: PortabilityRegistry;
  readonly ownerId: UserId;
  readonly staged: StagedArchive;
  readonly signal?: AbortSignal;
}

/**
 * Import an already-staged tree: route each entry to its owning entity by leading dir and import in
 * dependency order, then dispose the staging dir. The seam BOTH sources funnel through — an extracted zip
 * (`runBundleImport`) and an uploaded folder (`stageDirectory`) — so the entity routing lives in one place.
 */
export async function importStagedArchive(deps: StagedBundleImportDeps): Promise<BundleImportReport> {
  const { registry, ownerId, staged, signal } = deps;
  try {
    const { byDir, unrouted } = groupByDir(staged);
    const outcomes = [...(await importInDepOrder(registry, byDir, ownerId, signal)), ...collectSkips(registry, byDir, unrouted)];
    return { outcomes, ...tally(outcomes), aborted: signal?.aborted === true };
  } finally {
    await staged.dispose();
  }
}

/**
 * Extract an untrusted bundle and import each file to its owning entity in dependency order. Returns the
 * per-file report (imported / deduped vs skipped vs failed). Rejects (from `extractZip`) with a
 * `ZipRejectedError` if the archive itself is hostile — nothing is imported in that case.
 */
export async function runBundleImport(deps: BundleImportDeps): Promise<BundleImportReport> {
  const { registry, ownerId, archive, extractOptions, signal } = deps;
  const staged = await extractZip(archive, extractOptions);
  return await importStagedArchive({
    registry,
    ownerId,
    staged,
    ...(signal !== undefined ? { signal } : {}),
  });
}
