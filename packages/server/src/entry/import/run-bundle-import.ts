// entry/import/run-bundle-import — the ENTITY-AGNOSTIC bundle-import COMPOSITION DRIVER
// (export-import-portability.md §3). The generalization of `run-profile-import` from "a set of character
// cards" to "any registry of portable entities": it extracts an UNTRUSTED archive through the
// `infra/storage/zip` belt battery, routes each file to its owning entity's `importFile` by the file's
// leading directory, and imports in the fixed `PORTABLE_IMPORT_ORDER` dependency order so cross-entity
// attachments resolve (personas + tags + world-info before characters; characters + personas before chats).
//
// SCOPE / boundaries:
//   • It consumes the INJECTED `PortabilityRegistry` (assembled at entry/compose from each domain's export/
//     import verbs). The driver knows NOTHING about any specific entity — adding an entity appends a
//     descriptor upstream and this driver routes it for free (the delivery-core one-home principle).
//   • Per-file isolation (the card `failures[]` precedent): a descriptor's `importFile` NEVER throws for a
//     malformed file (it returns `{ok:false, error}`), but the driver also try/catches so a throwing
//     descriptor can't abort the bundle. One bad file is recorded and skipped; the rest still import.
//   • A file whose leading dir matches no registered entity is recorded as SKIPPED (unknown dir) — benign,
//     never fatal (a forward-compat bundle carrying a kind this deployment doesn't know).
//   • A HOSTILE archive (zip-slip, bomb, lying header, bad method, oversize) is rejected WHOLE by
//     `extractZip` — the driver never sees a single entry, so nothing is written (fail-closed).
//
// MEMORY: `extractZip` STAGES the decompressed entries to a temp DISK dir and returns disk-backed handles.
// The driver groups those handles by dir before the ordered import pass (the cross-kind dependency order
// can't be honored while streaming central-directory order) — but it holds only the handles, and reads each
// entry's bytes back off the staging disk JUST BEFORE its `importFile`, so peak memory is ONE entry, not the
// whole decompressed bundle (a full all-blobs bundle can exceed RAM). It MUST `dispose()` the staged archive
// in a try/finally so the staging dir is removed on success AND error. The `infra/storage/zip` caps bound the
// compressed buffer + the staging disk; the untrusted-upload route tightens them and runs this behind the
// single-active workload lock.
//
// CANCELLATION is the driver's job (the contract intentionally carries no signal — it is isomorphic): the
// optional `signal` is checked between files, so a cancelled workload stops pulling more importFile work.

import type { PortabilityRegistry, PortableEntity, PortableKind } from "@orb/contracts/portability";
import { PORTABLE_IMPORT_ORDER } from "@orb/contracts/portability";
import type { UserId } from "@orb/kit/ids";
import type { ExtractOptions, StagedArchive } from "#infra/storage";
import { extractZip } from "#infra/storage";

// The untrusted-upload extract caps (the PD-94 posture) — ONE home, shared by the HTTP edge (the route caps
// the streamed-to-disk upload at `IMPORT_MAX_TOTAL_BYTES`) AND the workload runner-env op (which hands both to
// `extractZip`). The compressed cap bounds the staged zip; the decompressed cap (a DISK-usage cap — extractZip
// stages entries to a temp dir, ONE ≤64 MiB entry in RAM at a time) is raised to 10 GiB so a full-account
// all-blobs "backup everything" bundle (every avatar/gallery/sprite/imagery/databank blob the owner references)
// fits, while the all-zero amplification bomb still aborts mid-extraction.
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
  /** The injected registry (assembled at entry/compose). Only its registered entities can be routed to. */
  readonly registry: PortabilityRegistry;
  /** The owner every imported row is scoped to (the route resolved the caller; the workload carries it). */
  readonly ownerId: UserId;
  /** The untrusted archive bytes / body stream — handed straight to the belt battery. */
  readonly archive: Uint8Array | ReadableStream<Uint8Array>;
  /** The extract caps for THIS upload (the route tightens them from the zip defaults). */
  readonly extractOptions?: ExtractOptions;
  /** Cancellation — checked between files so a cancelled workload stops pulling importFile work. */
  readonly signal?: AbortSignal;
}

/** The leading directory of an archive path, INCLUDING the trailing slash (so it matches a descriptor's
 *  `dir`), or null for a top-level file (no slash) — which is always an unknown-dir skip. */
function leadingDir(path: string): string | null {
  const slash = path.indexOf("/");
  return slash === -1 ? null : path.slice(0, slash + 1);
}

/** One staged file routed to an entity: its dir-relative name + a lazy reader over the staging disk (NOT the
 *  bytes — the whole decompressed bundle is never held in memory at once). */
interface StagedFile {
  readonly filename: string;
  readonly read: () => Promise<Uint8Array>;
}

/** Group the staged entries by their leading directory (the ONLY routing key), holding lazy read HANDLES.
 *  Files whose path has no directory are collected under the null key as unroutable skips. Synchronous — the
 *  staged archive is already a concrete list of handles (the disk write happened in `extractZip`). */
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
    // The filename handed to importFile is relative to the entity's dir (the descriptor's contract).
    bucket.push({ filename: entry.path.slice(dir.length), read: entry.read });
    byDir.set(dir, bucket);
  }
  return { byDir, unrouted };
}

/** Import every file routed to one entity, isolating per-file failures into outcomes. Reads each file's bytes
 *  off the staging disk JUST BEFORE its importFile, so only one entry is in memory at a time. */
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

/** Import every registered entity in the fixed dependency order (the ONE cross-entity rule, as data). A
 *  kind with no registered descriptor, or no files in the bundle, is simply absent from the pass. */
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

/** Record every file that matched no registered entity as a SKIP (unknown dir, or a top-level file). */
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

/** Tally the per-file outcomes into the report's summary counts. */
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
  // extractZip stages the decompressed entries to a temp DISK dir (or rejects a hostile archive WHOLE, having
  // already cleaned up after itself). We own the staging dir from here — dispose it on success AND error.
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
