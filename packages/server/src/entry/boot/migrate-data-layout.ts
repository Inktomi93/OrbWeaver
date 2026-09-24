// Boot step: move a legacy flat data dir into the tree `foundation/data-layout` describes, BEFORE the db
// opens. Every move is a same-filesystem rename recorded in a journal first, so a crash mid-way resumes on
// the next boot; a legacy path whose target already holds data is a refusal, never a merge.

import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { backupBeforeMigrate, closeDb, createDb, listBackupFiles, truncateWal } from "@orb/db";
import { isPlainObject } from "@orb/kit/guards";
import type { DataLayout, DataLayoutSlotKey } from "#foundation/data-layout";
import { DATA_LAYOUT_DIRS, DB_FILE_NAME, SECRET_FILE_NAMES } from "#foundation/data-layout";
import { getLog } from "#foundation/observability";

/** The in-progress marker at the data root: present only between the first rename and the last. */
export const LAYOUT_JOURNAL = ".layout-migration.json";

const DB_SIDECARS = ["", "-wal", "-shm"] as const;

// The legacy names at the root, and the top-level names the current layout owns. A root entry in neither
// set is the operator's and is left where it is.
const LEGACY = {
  credentialsKey: ".credentials-key",
  sessionSecret: ".session-secret",
  variants: "variants",
  models: "models",
  importStaging: "import-staging",
  importReports: "import-reports",
} as const;
const OWNED_ROOT_ENTRIES: ReadonlySet<string> = new Set([
  DATA_LAYOUT_DIRS.db,
  DATA_LAYOUT_DIRS.backups,
  DATA_LAYOUT_DIRS.assets,
  DATA_LAYOUT_DIRS.users,
  DATA_LAYOUT_DIRS.secrets,
  DATA_LAYOUT_DIRS.reports,
  DATA_LAYOUT_DIRS.cache,
  LAYOUT_JOURNAL,
]);
// The container directories a move lands inside. `reports` and the `cache/*` leaves are rename TARGETS when a
// legacy dir moves, so they are created only when nothing is moving onto them.
const CONTAINER_DIRS = [DATA_LAYOUT_DIRS.db, DATA_LAYOUT_DIRS.backups, DATA_LAYOUT_DIRS.secrets, DATA_LAYOUT_DIRS.cache, DATA_LAYOUT_DIRS.reports] as const;

/** One planned rename, both ends relative to the data root. */
export interface DataLayoutMove {
  readonly from: string;
  readonly to: string;
}

// A move as planned against the current env: `keptBy` names the slot key that, once set, leaves the entry
// where it is (null for an entry no key governs).
interface PlannedMove extends DataLayoutMove {
  readonly keptBy: DataLayoutSlotKey | null;
}

interface Journal {
  readonly pid: number;
  readonly moves: readonly DataLayoutMove[];
}

export interface MigrateDataLayoutDeps {
  readonly layout: DataLayout;
  /** This process's pid, written to the journal and recognised on resume; injectable so a test can plant
   *  a live or dead holder. */
  readonly pid?: number;
  readonly isPidAlive?: (pid: number) => boolean;
  /** The filesystem device of a path (`lstat().dev`); injectable so a test can plant a mount boundary. */
  readonly deviceOf?: (path: string) => number;
}

export interface DataLayoutMigrationReport {
  readonly moved: readonly DataLayoutMove[];
  /** Root entries the layout does not own, named so an operator can see what the move did not touch. */
  readonly leftInPlace: readonly string[];
  readonly resumed: boolean;
}

const NO_MIGRATION: DataLayoutMigrationReport = { moved: [], leftInPlace: [], resumed: false };

// @orb-waive caught-failure-ownership(err): `kill(pid, 0)` ASKS a question and throws to answer it — ESRCH is "dead", and EPERM is a live process under another uid, which must read as alive so its journal is never resumed under it. Ends if the answer needs more than alive/dead.
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function deviceOfPath(path: string): number {
  return lstatSync(path).dev;
}

function exists(path: string): boolean {
  return lstatSync(path, { throwIfNoEntry: false }) !== undefined;
}

// A file holds data when it has bytes; a directory when it has an entry. A 0-byte file is not data (a
// holder that reopened a moved db by its old path leaves one), and an empty directory is a legal rename
// target (rename(2) replaces it), so neither counts.
function holdsData(path: string): boolean {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat === undefined) {
    return false;
  }
  return stat.isDirectory() ? readdirSync(path).length > 0 : stat.size > 0;
}

// What a refusal prints beside a path, so an operator can tell a stray empty file from the real thing.
function describeEntry(path: string): string {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (stat === undefined) {
    return "missing";
  }
  return stat.isDirectory() ? `${readdirSync(path).length} entries` : `${stat.size} bytes`;
}

function readJournal(path: string): Journal {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
  const moves = isPlainObject(parsed) ? parsed["moves"] : undefined;
  if (!(isPlainObject(parsed) && typeof parsed["pid"] === "number" && Array.isArray(moves))) {
    throw new Error(`boot/data-layout: ${path} is not a layout journal; move it aside and start again`);
  }
  return {
    pid: parsed["pid"],
    moves: moves.map((entry: unknown, index): DataLayoutMove => {
      if (!(isPlainObject(entry) && typeof entry["from"] === "string" && typeof entry["to"] === "string")) {
        throw new Error(`boot/data-layout: ${path} entry ${index} is not a { from, to } move; move the journal aside and start again`);
      }
      return { from: entry["from"], to: entry["to"] };
    }),
  };
}

// `wx`: the journal is the lock. A second boot that finds it reads the pid and either waits out a live
// holder (a refusal) or resumes a dead one's moves.
function writeJournal(path: string, journal: Journal): void {
  const fd = openSync(path, "wx");
  try {
    writeFileSync(fd, JSON.stringify(journal));
  } finally {
    closeSync(fd);
  }
}

// The moves the current env asks for. A legacy db or keyfile moves only when it holds bytes: an empty one is
// what a holder that reopened a moved file by its old path leaves behind, not data. Every other entry moves
// on presence (a `.keep` pin is a meaningful empty file; the db's sidecars belong to it empty or not). The db
// goes LAST, so a failure on any other entry never strands it.
function planMoves(root: string, layout: DataLayout): PlannedMove[] {
  const entries = new Set(readdirSync(root));
  const moves: PlannedMove[] = [];
  const add = (from: string, to: string, keptBy: DataLayoutSlotKey | null = null, requireBytes = false): void => {
    if (entries.has(from) && (!requireBytes || holdsData(join(root, from)))) {
      moves.push({ from, to, keptBy });
    }
  };
  for (const name of listBackupFiles(root, DB_FILE_NAME)) {
    add(name, join(DATA_LAYOUT_DIRS.backups, name));
  }
  add(LEGACY.credentialsKey, join(DATA_LAYOUT_DIRS.secrets, SECRET_FILE_NAMES.credentialsKey), null, true);
  add(LEGACY.sessionSecret, join(DATA_LAYOUT_DIRS.secrets, SECRET_FILE_NAMES.sessionSecret), null, true);
  add(LEGACY.variants, DATA_LAYOUT_DIRS.variants);
  if (!layout.explicit.has("LOCAL_LIGHT_CACHE_DIR")) {
    add(LEGACY.models, dirname(DATA_LAYOUT_DIRS.models), "LOCAL_LIGHT_CACHE_DIR");
  }
  if (!layout.explicit.has("IMPORT_STAGING_DIR")) {
    add(LEGACY.importStaging, DATA_LAYOUT_DIRS.importStaging, "IMPORT_STAGING_DIR");
  }
  add(LEGACY.importReports, DATA_LAYOUT_DIRS.reports);
  if (!layout.explicit.has("DATABASE_URL") && holdsData(join(root, DB_FILE_NAME))) {
    for (const suffix of DB_SIDECARS) {
      add(`${DB_FILE_NAME}${suffix}`, join(DATA_LAYOUT_DIRS.db, `${DB_FILE_NAME}${suffix}`), "DATABASE_URL");
    }
  }
  return moves;
}

// rename(2) cannot cross a filesystem, and a mount point at the source fails it too. Refuse BEFORE the
// journal exists, naming each entry and the slot key that opts it out, so nothing is half-moved.
function refuseCrossDevice(root: string, moves: readonly PlannedMove[], deviceOf: (path: string) => number): void {
  const rootDevice = deviceOf(root);
  const foreign = moves.filter((move) => deviceOf(join(root, move.from)) !== rootDevice);
  if (foreign.length === 0) {
    return;
  }
  const named = foreign
    .map(
      (move) =>
        `${join(root, move.from)} (${move.keptBy === null ? "no env key keeps it; move it onto the data root's filesystem by hand" : `set ${move.keptBy} to keep it there`})`,
    )
    .join("; ");
  throw new Error(`boot/data-layout: ${named}: a rename cannot cross a filesystem or a mount point, so the layout migration refuses before moving anything.`);
}

function ensureContainerDirs(root: string, moveTargets: ReadonlySet<string>): void {
  for (const dir of CONTAINER_DIRS) {
    if (!moveTargets.has(dir)) {
      mkdirSync(join(root, dir), { recursive: true });
    }
  }
}

// The db moves only with no connection open and an empty WAL: open the legacy file, snapshot it into the
// new backups dir, then checkpoint-truncate and close. A holder that blocks the checkpoint, or a WAL that
// still carries bytes after the close, is a refusal: the move would pull the file out from under a live
// writer, which then reopens by the old path and leaves an empty db there.
async function snapshotLegacyDb(root: string, layout: DataLayout): Promise<void> {
  const path = join(root, DB_FILE_NAME);
  const url = `file:${path}`;
  const db = await createDb(url);
  let busy: boolean;
  try {
    await backupBeforeMigrate(db, url, layout.backups);
    busy = (await truncateWal(db)).busy;
  } finally {
    closeDb(db);
  }
  const wal = `${path}-wal`;
  if (busy || holdsData(wal)) {
    throw new Error(
      `boot/data-layout: another process holds ${path} (${busy ? "the checkpoint reported it busy" : `${wal} still carries ${describeEntry(wal)} after the close`}); stop it, then start again. Nothing was moved.`,
    );
  }
}

function applyMove(root: string, move: DataLayoutMove): void {
  const to = join(root, move.to);
  mkdirSync(dirname(to), { recursive: true });
  renameSync(join(root, move.from), to);
}

// A journal entry's state decides it: a rename either happened or did not, so any other combination means
// something else touched the tree and the operator has to look. The pending entries are replayed against the
// CURRENT plan, so a slot key set after a failed move keeps its entry in place instead of failing again.
function resumeMoves(root: string, journal: readonly DataLayoutMove[], current: readonly PlannedMove[], deviceOf: (path: string) => number): DataLayoutMove[] {
  const planned = new Map(current.map((move) => [move.from, move]));
  const pending: PlannedMove[] = [];
  const done: DataLayoutMove[] = [];
  for (const move of journal) {
    const from = join(root, move.from);
    const to = join(root, move.to);
    const fromExists = exists(from);
    if (fromExists && !holdsData(to)) {
      const still = planned.get(move.from);
      if (still !== undefined) {
        pending.push(still);
      }
    } else if (!fromExists && exists(to)) {
      done.push(move);
    } else {
      throw new Error(
        `boot/data-layout: cannot resume the interrupted layout migration under ${root}: ${from} (${describeEntry(from)}) and ${to} (${describeEntry(to)}) ${fromExists ? "both hold data" : "are both missing"}. Sort the two out by hand, then delete ${join(root, LAYOUT_JOURNAL)} and start again.`,
      );
    }
  }
  refuseCrossDevice(root, pending, deviceOf);
  for (const move of pending) {
    applyMove(root, move);
    done.push({ from: move.from, to: move.to });
  }
  return done;
}

function leftInPlace(root: string): string[] {
  return readdirSync(root)
    .filter((name) => !OWNED_ROOT_ENTRIES.has(name))
    .sort();
}

function logReport(root: string, report: DataLayoutMigrationReport): void {
  const log = getLog();
  log.info(
    { root, resumed: report.resumed, moves: report.moved.map((move) => `${move.from} -> ${move.to}`) },
    `boot/data-layout: moved ${report.moved.length} entries of ${root} into the current layout`,
  );
  if (report.leftInPlace.length > 0) {
    log.warn({ root, entries: report.leftInPlace }, "boot/data-layout: root entries the layout does not name were left in place");
  }
}

/**
 * Move a legacy data dir into the current layout, or do nothing on a tree already in it.
 * @throws Error before any rename when a legacy path and its target both hold data, when a source sits on
 * another filesystem, when another process holds the db or the journal, or when a journal entry's state
 * matches neither "done" nor "pending".
 */
export async function migrateDataLayout(deps: MigrateDataLayoutDeps): Promise<DataLayoutMigrationReport> {
  const root = deps.layout.root;
  const ownPid = deps.pid ?? process.pid;
  const isAlive = deps.isPidAlive ?? pidAlive;
  const deviceOf = deps.deviceOf ?? deviceOfPath;
  if (!existsSync(root)) {
    ensureContainerDirs(root, new Set());
    return NO_MIGRATION;
  }
  const journalPath = join(root, LAYOUT_JOURNAL);
  if (existsSync(journalPath)) {
    const journal = readJournal(journalPath);
    // A container restart hands node the SAME pid it had, so the journal's own pid is never a live holder.
    if (journal.pid !== ownPid && isAlive(journal.pid)) {
      throw new Error(
        `boot/data-layout: ${journalPath} says process ${journal.pid} is migrating the data layout under ${root}, and that pid is alive. Wait for it to finish and start again; if nothing is migrating, delete ${journalPath} and start again.`,
      );
    }
    const moved = resumeMoves(root, journal.moves, planMoves(root, deps.layout), deviceOf);
    rmSync(journalPath);
    ensureContainerDirs(root, new Set());
    const report = { moved, leftInPlace: leftInPlace(root), resumed: true };
    logReport(root, report);
    return report;
  }

  const planned = planMoves(root, deps.layout);
  if (planned.length === 0) {
    ensureContainerDirs(root, new Set());
    return NO_MIGRATION;
  }
  const conflicts = planned.filter((move) => holdsData(join(root, move.to)));
  if (conflicts.length > 0) {
    const pairs = conflicts
      .map((move) => `${join(root, move.from)} (${describeEntry(join(root, move.from))}) and ${join(root, move.to)} (${describeEntry(join(root, move.to))})`)
      .join("; ");
    throw new Error(
      `boot/data-layout: ${root} holds a legacy path and its new location, and both hold data: ${pairs}. Keep the one in use and move or delete the other by hand, then start again. Nothing was moved.`,
    );
  }
  refuseCrossDevice(root, planned, deviceOf);
  if (planned.some((move) => move.from === DB_FILE_NAME)) {
    await snapshotLegacyDb(root, deps.layout);
  }
  // The close above may have removed an empty sidecar; move only what is still there.
  const moves = planned.filter((move) => exists(join(root, move.from))).map((move): DataLayoutMove => ({ from: move.from, to: move.to }));
  ensureContainerDirs(root, new Set(moves.map((move) => move.to)));
  writeJournal(journalPath, { pid: ownPid, moves });
  for (const move of moves) {
    applyMove(root, move);
  }
  rmSync(journalPath);
  const report = { moved: moves, leftInPlace: leftInPlace(root), resumed: false };
  logReport(root, report);
  return report;
}
