// Boot step: move a legacy flat data dir into the tree `foundation/data-layout` describes, BEFORE the db opens.
// Every move is a same-filesystem rename journaled first, so a crash mid-way resumes on the next boot; a target
// that holds data is a refusal, never a merge. Assumes one migrator per volume: two containers can share a pid.

import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { backupBeforeMigrate, closeDb, createDb, detachWal, listBackupFiles } from "@orb/db";
import { isPlainObject } from "@orb/kit/guards";
import type { DataLayout, DataLayoutSlotKey } from "#foundation/data-layout";
import { DATA_LAYOUT_DIRS, DB_FILE_NAME, SECRET_FILE_NAMES } from "#foundation/data-layout";
import { getLog } from "#foundation/observability";

/** The in-progress marker at the data root: present only between the first rename and the last. */
export const LAYOUT_JOURNAL = ".layout-migration.json";

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
  readonly deviceOf?: DeviceOf;
}

type DeviceOf = (path: string) => number;

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
// on presence (a `.keep` pin is a meaningful empty file). The db goes LAST, so a failure on any other entry
// never strands it; its sidecars are folded into it before the journal exists (`snapshotLegacyDb`).
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
  if (!layout.explicit.has("DATABASE_URL")) {
    add(DB_FILE_NAME, join(DATA_LAYOUT_DIRS.db, DB_FILE_NAME), "DATABASE_URL", true);
  }
  return moves;
}

// The directory a target's bytes would land in: its nearest existing ancestor, followed through symlinks,
// because a container that is a link onto another filesystem fails the rename exactly like a foreign source.
function landingDir(target: string): string {
  let probe = dirname(target);
  while (!exists(probe)) {
    probe = dirname(probe);
  }
  return realpathSync(probe);
}

// rename(2) cannot cross a filesystem, and a mount point at either end fails it too. Refuse BEFORE the
// journal exists, naming each entry and its way out, so nothing is half-moved. The root is resolved first:
// a DATA_DIR that is itself a symlink has its entries on the link's target, not beside the link.
function refuseCrossDevice(root: string, moves: readonly PlannedMove[], deviceOf: DeviceOf): void {
  const rootDevice = deviceOf(realpathSync(root));
  const reasons: string[] = [];
  for (const move of moves) {
    const from = join(root, move.from);
    const keep = move.keptBy === null ? null : `set ${move.keptBy} to keep it where it is`;
    if (deviceOf(from) !== rootDevice) {
      reasons.push(
        `${from} sits on another filesystem than ${root} (${keep === null ? "no env key keeps it there;" : `${keep}, or`} move it onto the data root's filesystem by hand)`,
      );
      continue;
    }
    const landing = landingDir(join(root, move.to));
    if (deviceOf(landing) !== rootDevice) {
      reasons.push(
        `${from} would land in ${landing}, which sits on another filesystem than ${root} (${keep === null ? "" : `${keep}, or `}move it there by hand, or put ${landing} on the data root's filesystem)`,
      );
    }
  }
  if (reasons.length > 0) {
    throw new Error(
      `boot/data-layout: a rename cannot cross a filesystem or a mount point, so the layout migration refuses before moving anything: ${reasons.join("; ")}`,
    );
  }
}

function ensureContainerDirs(root: string, moveTargets: ReadonlySet<string>): void {
  for (const dir of CONTAINER_DIRS) {
    if (!moveTargets.has(dir)) {
      mkdirSync(join(root, dir), { recursive: true });
    }
  }
}

// The db moves only as its sole holder: open the legacy file and leave WAL, which SQLite grants only when no
// other connection has the file open, busy or idle. Any other holder is a refusal, because the move would
// pull the file out from under it and it would reopen by the old path into an empty db. Leaving WAL also
// folds the sidecars into the main file, so the db then moves as one file; the snapshot is taken after the
// claim, so a refusal writes nothing.
async function snapshotLegacyDb(root: string, layout: DataLayout): Promise<void> {
  const path = join(root, DB_FILE_NAME);
  const url = `file:${path}`;
  const db = await createDb(url);
  let sole: boolean;
  try {
    sole = (await detachWal(db)).sole;
    if (sole) {
      await backupBeforeMigrate(db, url, layout.backups);
    }
  } finally {
    closeDb(db);
  }
  if (!sole) {
    throw new Error(`boot/data-layout: another process has ${path} open; stop it, then start again. Nothing was moved.`);
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
function resumeMoves(root: string, journal: readonly DataLayoutMove[], current: readonly PlannedMove[], deviceOf: DeviceOf): DataLayoutMove[] {
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
  const moves = planned.map((move): DataLayoutMove => ({ from: move.from, to: move.to }));
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
