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
import type { DataLayout, DataLayoutKeeperKey } from "#foundation/data-layout";
import { DATA_LAYOUT_DIRS, DATA_LAYOUT_SKIP_KEY, DB_FILE_NAME, keeperRemedy, LEGACY_ENTRIES } from "#foundation/data-layout";
import { getLog } from "#foundation/observability";

/** The in-progress marker at the data root: present only between the first rename and the last. */
export const LAYOUT_JOURNAL = ".layout-migration.json";

// The top-level names the current layout owns. A root entry outside this set and `LEGACY_ENTRIES` is the
// operator's and is left where it is.
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

// A move as planned against the current env: `keptBy` names the env key that, once set, leaves the entry
// where it is (null for an entry no key governs).
interface PlannedMove extends DataLayoutMove {
  readonly keptBy: DataLayoutKeeperKey | null;
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
  /** The rename itself; injectable so a test can plant a failure the pre-flight cannot foresee. */
  readonly rename?: Rename;
}

type DeviceOf = (path: string) => number;
type Rename = (from: string, to: string) => void;
interface FsOps {
  readonly deviceOf: DeviceOf;
  readonly rename: Rename;
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

// The moves the current env asks for: the backup files, then `LEGACY_ENTRIES` in its order. An entry whose
// keeper key is set, or that the operator named in `DATA_LAYOUT_SKIP`, is never planned, so a resume
// re-planned against the env drops it too. A `.keep` pin is a meaningful empty file, so backups move on
// presence; the db's sidecars are folded into it before the journal exists.
function planMoves(root: string, layout: DataLayout): PlannedMove[] {
  const entries = new Set(readdirSync(root));
  const moves: PlannedMove[] = [];
  const add = (from: string, to: string, keptBy: DataLayoutKeeperKey | null, requireBytes: boolean): void => {
    if (entries.has(from) && !layout.skip.has(from) && (!requireBytes || holdsData(join(root, from)))) {
      moves.push({ from, to, keptBy });
    }
  };
  for (const name of listBackupFiles(root, DB_FILE_NAME)) {
    add(name, join(DATA_LAYOUT_DIRS.backups, name), null, false);
  }
  for (const [from, entry] of Object.entries(LEGACY_ENTRIES)) {
    if (entry.keptBy === null || !layout.explicit.has(entry.keptBy)) {
      add(from, entry.to, entry.keptBy, entry.requireBytes);
    }
  }
  return moves;
}

// Where a target's bytes would land: the target itself when it exists (an empty mount point is a legal-looking
// rename target that fails), else its nearest existing ancestor, followed through symlinks in both cases,
// because a link onto another filesystem fails the rename exactly like a foreign source.
function landingPath(target: string): string {
  let probe = target;
  while (!exists(probe)) {
    probe = dirname(probe);
  }
  return realpathSync(probe);
}

// The one remedy that needs no hand move and no journal edit: the env key that keeps a keyed entry, or the
// skip list for the rest. A skipped entry is one the app no longer reads, and the text says so.
function wayOut(root: string, move: PlannedMove): string {
  const from = join(root, move.from);
  return move.keptBy === null
    ? `add ${move.from} to ${DATA_LAYOUT_SKIP_KEY} to leave it at ${from}, where the app will not see it until it is moved into ${join(root, move.to)} by hand`
    : keeperRemedy(move.keptBy, from);
}

// rename(2) cannot cross a filesystem, and a mount point at either end fails it too. Refuse BEFORE the
// journal exists, naming each entry and its way out, so nothing is half-moved. The root is resolved first:
// a DATA_DIR that is itself a symlink has its entries on the link's target, not beside the link.
function refuseCrossDevice(root: string, moves: readonly PlannedMove[], deviceOf: DeviceOf): void {
  const rootDevice = deviceOf(realpathSync(root));
  const reasons: string[] = [];
  for (const move of moves) {
    const from = join(root, move.from);
    if (deviceOf(from) !== rootDevice) {
      reasons.push(`${from} sits on another filesystem than ${root} (${wayOut(root, move)}, or move it onto the data root's filesystem by hand)`);
      continue;
    }
    const landing = landingPath(join(root, move.to));
    if (deviceOf(landing) !== rootDevice) {
      reasons.push(
        `${from} would land at ${landing}, which sits on another filesystem than ${root} (${wayOut(root, move)}, or put ${landing} on the data root's filesystem)`,
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
// folds the sidecars into the main file, so the db then moves as one file. The snapshot is taken after the
// claim, so a refusal writes nothing, and only on the first boot: a resume's claim changes the file's mtime,
// which names the copy, so a snapshot per resume would fill the volume under a restart policy.
async function claimLegacyDb(root: string, layout: DataLayout, snapshot: boolean): Promise<void> {
  const path = join(root, DB_FILE_NAME);
  const url = `file:${path}`;
  const db = await createDb(url);
  let sole: boolean;
  try {
    sole = (await detachWal(db)).sole;
    if (sole && snapshot) {
      await backupBeforeMigrate(db, url, layout.backups);
    }
  } finally {
    closeDb(db);
  }
  if (!sole) {
    throw new Error(`boot/data-layout: another process has ${path} open; stop it, then start again. Nothing was moved.`);
  }
}

// A rename the pre-flight did not foresee (EBUSY on a same-device mount, EPERM, anything) surfaces as a named
// refusal with its way out, never a raw errno: the journal keeps this entry pending, so the next boot either
// retries it or, once the env names the remedy, leaves it in place.
function applyMove(root: string, move: PlannedMove, rename: Rename): void {
  const from = join(root, move.from);
  const to = join(root, move.to);
  try {
    mkdirSync(dirname(to), { recursive: true });
    rename(from, to);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? "unknown error";
    throw new Error(
      `boot/data-layout: could not move ${from} to ${to} (${code}): ${wayOut(root, move)}, or fix ${to} and start again. ${join(root, LAYOUT_JOURNAL)} keeps the remaining moves for the next boot.`,
      { cause: err },
    );
  }
}

// A journal entry's state decides it: a rename either happened or did not, so any other combination means
// something else touched the tree and the operator has to look. The pending entries are read against the
// CURRENT plan, so a slot key or a skip set after a failed move drops its entry instead of failing again.
function classifyJournal(
  root: string,
  journal: readonly DataLayoutMove[],
  planned: ReadonlyMap<string, PlannedMove>,
): { pending: PlannedMove[]; done: DataLayoutMove[] } {
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
  return { pending, done };
}

// A db still pending is claimed again before it moves (the claim before the first boot's journal says nothing
// about who has the file open now) but not snapshotted again: the first boot's snapshot still covers it.
async function resumeMoves(root: string, layout: DataLayout, journal: readonly DataLayoutMove[], fs: FsOps): Promise<DataLayoutMove[]> {
  const planned = new Map(planMoves(root, layout).map((move) => [move.from, move]));
  const { pending, done } = classifyJournal(root, journal, planned);
  refuseCrossDevice(root, pending, fs.deviceOf);
  if (pending.some((move) => move.from === DB_FILE_NAME)) {
    await claimLegacyDb(root, layout, false);
  }
  for (const move of pending) {
    applyMove(root, move, fs.rename);
    done.push({ from: move.from, to: move.to });
  }
  return done;
}

function leftInPlace(root: string): string[] {
  return readdirSync(root)
    .filter((name) => !OWNED_ROOT_ENTRIES.has(name))
    .sort();
}

function logReport(root: string, layout: DataLayout, report: DataLayoutMigrationReport): void {
  const log = getLog();
  log.info(
    { root, resumed: report.resumed, moves: report.moved.map((move) => `${move.from} -> ${move.to}`) },
    `boot/data-layout: moved ${report.moved.length} entries of ${root} into the current layout`,
  );
  if (report.leftInPlace.length > 0) {
    log.warn({ root, entries: report.leftInPlace }, "boot/data-layout: root entries the layout does not name were left in place");
  }
  const skipped = report.leftInPlace.filter((name) => layout.skip.has(name));
  if (skipped.length > 0) {
    log.warn(
      { root, entries: skipped },
      `boot/data-layout: ${DATA_LAYOUT_SKIP_KEY} leaves these entries at their old paths under ${root}; the app will not see them until they are moved by hand`,
    );
  }
}

/**
 * Move a legacy data dir into the current layout, or do nothing on a tree already in it.
 * @throws Error before any rename when a legacy path and its target both hold data, when either end of a move
 * sits on another filesystem, when another process holds the db or the journal, or when a journal entry's
 * state matches neither "done" nor "pending"; and after a rename fails, naming the entry and its way out.
 */
export async function migrateDataLayout(deps: MigrateDataLayoutDeps): Promise<DataLayoutMigrationReport> {
  const root = deps.layout.root;
  const ownPid = deps.pid ?? process.pid;
  const isAlive = deps.isPidAlive ?? pidAlive;
  const fs: FsOps = { deviceOf: deps.deviceOf ?? deviceOfPath, rename: deps.rename ?? renameSync };
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
    const moved = await resumeMoves(root, deps.layout, journal.moves, fs);
    rmSync(journalPath);
    ensureContainerDirs(root, new Set());
    const report = { moved, leftInPlace: leftInPlace(root), resumed: true };
    logReport(root, deps.layout, report);
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
  refuseCrossDevice(root, planned, fs.deviceOf);
  if (planned.some((move) => move.from === DB_FILE_NAME)) {
    await claimLegacyDb(root, deps.layout, true);
  }
  const moves = planned.map((move): DataLayoutMove => ({ from: move.from, to: move.to }));
  ensureContainerDirs(root, new Set(moves.map((move) => move.to)));
  writeJournal(journalPath, { pid: ownPid, moves });
  for (const move of planned) {
    applyMove(root, move, fs.rename);
  }
  rmSync(journalPath);
  const report = { moved: moves, leftInPlace: leftInPlace(root), resumed: false };
  logReport(root, deps.layout, report);
  return report;
}
