import type { PortabilityRegistry, PortableEntity, PortableImportOutcome, PortableKind } from "@orb/contracts/portability";
import { PORTABLE_IMPORT_ORDER } from "@orb/contracts/portability";
import type { UserId } from "@orb/kit/ids";
import type { StagedArchive } from "#infra/storage";
import { extractZip } from "#infra/storage";

import type { BundleImportDeps, BundleImportFileOutcome, BundleImportReport, StagedBundleImportDeps } from "../contract/bundle.ts";

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

/** One descriptor answer as the report's file outcome. The two lists are forwarded only when the descriptor
 *  said something: an empty list on every clean file would bury the one file that has a note. */
function fileOutcome(entity: PortableEntity, path: string, result: PortableImportOutcome): BundleImportFileOutcome {
  return {
    kind: entity.kind,
    path,
    ok: result.ok,
    ...(result.created !== undefined ? { created: result.created } : {}),
    ...(result.error !== undefined ? { error: result.error } : {}),
    ...(result.notes !== undefined && result.notes.length > 0 ? { notes: result.notes } : {}),
    ...(result.memoryChatIds !== undefined && result.memoryChatIds.length > 0 ? { memoryChatIds: result.memoryChatIds } : {}),
  };
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
    // the catch pushes an `ok: false` outcome with the message onto
    // `outcomes`, which `importEntity` returns; `tally` counts it as `failed` in the `BundleImportReport`.
    // Ends if `outcomes` stops being returned or `tally` stops counting it.
    try {
      const bytes = await staged.read();
      outcomes.push(fileOutcome(entity, path, await entity.importFile(ownerId, { filename: staged.filename, bytes })));
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
