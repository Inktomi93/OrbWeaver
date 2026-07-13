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

import type { PortabilityRegistry, PortableEntity, PortableKind } from "@orb/contracts/portability";
import { PORTABLE_IMPORT_ORDER } from "@orb/contracts/portability";
import type { UserId } from "@orb/kit/ids";
import type { ExtractOptions, StagedArchive } from "#infra/storage";
import { extractZip } from "#infra/storage";

// Shared by the HTTP edge and the workload runner-env op (both hand these to extractZip). The decompressed
// cap is disk-usage (10 GiB) so a full-account all-blobs backup fits, while an amplification bomb aborts.
const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = BYTES_PER_KIB * BYTES_PER_KIB;
const IMPORT_MAX_MIB = 256;
const IMPORT_MAX_DECOMPRESSED_MIB = 10_240;
/** The per-request compressed archive cap (256 MiB) — a larger upload is aborted mid-stream, never fully staged. */
export const IMPORT_MAX_TOTAL_BYTES = IMPORT_MAX_MIB * BYTES_PER_MIB;
/** The aggregate decompressed cap (10 GiB, disk-staged) — the amplification-bomb belt for a genuine all-blobs bundle. */
export const IMPORT_MAX_DECOMPRESSED_BYTES = IMPORT_MAX_DECOMPRESSED_MIB * BYTES_PER_MIB;

/** One file's bundle-import outcome, aggregated into the operator-auditable report. `kind: null` marks a
 *  file whose directory matched no registered entity (skipped, not failed). */
export interface BundleImportFileOutcome {
  readonly kind: PortableKind | null;
  /** The file's full path within the archive (e.g. "characters/Aria.png"). */
  readonly path: string;
  readonly ok: boolean;
  /** Set on a successful import: true = a new row, false = deduped/replaced (idempotent re-import). */
  readonly created?: boolean;
  /** Set when ok is false: the skip/failure reason (unknown dir, a per-file importFile error, or a throw). */
  readonly error?: string;
}

/** The per-bundle report the route returns (or the workload records). */
export interface BundleImportReport {
  readonly outcomes: readonly BundleImportFileOutcome[];
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
}

export interface BundleImportDeps {
  readonly registry: PortabilityRegistry;
  readonly ownerId: UserId;
  readonly archive: Uint8Array | ReadableStream<Uint8Array>;
  readonly extractOptions?: ExtractOptions;
  readonly signal?: AbortSignal;
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

/** Import every file routed to one entity, isolating per-file failures into outcomes. */
async function importEntity(
  entity: PortableEntity,
  files: readonly StagedFile[],
  ownerId: UserId,
  signal: AbortSignal | undefined,
): Promise<BundleImportFileOutcome[]> {
  const outcomes: BundleImportFileOutcome[] = [];
  for (const staged of files) {
    if (signal?.aborted === true) {
      break;
    }
    const path = `${entity.dir}${staged.filename}`;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: sequential BY DESIGN — read THIS entry's bytes off the staging disk on demand (never hold the whole decompressed bundle in memory), then one idempotent import with resumable per-file isolation.
      const bytes = await staged.read();
      const result = await entity.importFile(ownerId, { filename: staged.filename, bytes });
      outcomes.push({
        kind: entity.kind,
        path,
        ok: result.ok,
        ...(result.created !== undefined ? { created: result.created } : {}),
        ...(result.error !== undefined ? { error: result.error } : {}),
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
    if (signal?.aborted === true) {
      break;
    }
    const entity = byKind.get(kind);
    const files = entity === undefined ? undefined : byDir.get(entity.dir);
    if (entity === undefined || files === undefined || files.length === 0) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: kinds import sequentially — the dependency order is the whole point (personas before chats, etc.).
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
    } else if (outcome.kind === null) {
      skipped++;
    } else {
      failed++;
    }
  }
  return { imported, skipped, failed };
}

/**
 * Extract an untrusted bundle and import each file to its owning entity in dependency order. Returns the
 * per-file report (imported / deduped vs skipped vs failed). Rejects (from `extractZip`) with a
 * `ZipRejectedError` if the archive itself is hostile — nothing is imported in that case.
 */
export async function runBundleImport(deps: BundleImportDeps): Promise<BundleImportReport> {
  const { registry, ownerId, archive, extractOptions, signal } = deps;
  const staged = await extractZip(archive, extractOptions);
  try {
    const { byDir, unrouted } = groupByDir(staged);
    const outcomes = [
      ...(await importInDepOrder(registry, byDir, ownerId, signal)),
      ...collectSkips(registry, byDir, unrouted),
    ];
    return { outcomes, ...tally(outcomes) };
  } finally {
    await staged.dispose();
  }
}
