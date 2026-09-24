// Boot step: move a legacy flat data dir into the tree `foundation/data-layout` describes, BEFORE the db
// opens. Every move is a same-filesystem rename recorded in a journal first, so a crash mid-way resumes on
// the next boot; a legacy path whose target already holds data is a refusal, never a merge.

import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { backupBeforeMigrate, createDb, listBackupFiles, preCloseHousekeeping } from "@orb/db";
import { isPlainObject } from "@orb/kit/guards";
import type { DataLayout } from "#foundation/data-layout";
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

interface Journal {
  readonly pid: number;
  readonly moves: readonly DataLayoutMove[];
}

export interface MigrateDataLayoutDeps {
  readonly layout: DataLayout;
  /** This process's pid for the journal; injectable so a test can plant a live or dead holder. */
  readonly pid?: number;
  readonly isPidAlive?: (pid: number) => boolean;
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

function exists(path: string): boolean {
  return lstatSync(path, { throwIfNoEntry: false }) !== undefined;
}

// A file of any size holds data; a directory holds data when it has an entry. An empty directory is a
// legal rename target (rename(2) replaces it), so it does not count.
function holdsData(path: string): boolean {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat === undefined) {
    return false;
  }
  return stat.isDirectory() ? readdirSync(path).length > 0 : true;
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

function planMoves(root: string, layout: DataLayout): DataLayoutMove[] {
  const entries = new Set(readdirSync(root));
  const moves: DataLayoutMove[] = [];
  const add = (from: string, to: string): void => {
    if (entries.has(from)) {
      moves.push({ from, to });
    }
  };
  if (!layout.explicit.has("DATABASE_URL")) {
    for (const suffix of DB_SIDECARS) {
      add(`${DB_FILE_NAME}${suffix}`, join(DATA_LAYOUT_DIRS.db, `${DB_FILE_NAME}${suffix}`));
    }
  }
  for (const name of listBackupFiles(root, DB_FILE_NAME)) {
    moves.push({ from: name, to: join(DATA_LAYOUT_DIRS.backups, name) });
  }
  add(LEGACY.credentialsKey, join(DATA_LAYOUT_DIRS.secrets, SECRET_FILE_NAMES.credentialsKey));
  add(LEGACY.sessionSecret, join(DATA_LAYOUT_DIRS.secrets, SECRET_FILE_NAMES.sessionSecret));
  add(LEGACY.variants, DATA_LAYOUT_DIRS.variants);
  if (!layout.explicit.has("LOCAL_LIGHT_CACHE_DIR")) {
    add(LEGACY.models, dirname(DATA_LAYOUT_DIRS.models));
  }
  if (!layout.explicit.has("IMPORT_STAGING_DIR")) {
    add(LEGACY.importStaging, DATA_LAYOUT_DIRS.importStaging);
  }
  add(LEGACY.importReports, DATA_LAYOUT_DIRS.reports);
  return moves;
}

function ensureContainerDirs(root: string, moveTargets: ReadonlySet<string>): void {
  for (const dir of CONTAINER_DIRS) {
    if (!moveTargets.has(dir)) {
      mkdirSync(join(root, dir), { recursive: true });
    }
  }
}

// The db moves only with no connection open and an empty WAL: open the legacy file, snapshot it into the
// new backups dir, then checkpoint-truncate and close. Whatever sidecars remain afterwards are empty.
async function snapshotLegacyDb(root: string, layout: DataLayout): Promise<void> {
  const url = `file:${join(root, DB_FILE_NAME)}`;
  const db = await createDb(url);
  try {
    await backupBeforeMigrate(db, url, layout.backups);
  } finally {
    await preCloseHousekeeping(db);
  }
}

function applyMove(root: string, move: DataLayoutMove): void {
  const to = join(root, move.to);
  mkdirSync(dirname(to), { recursive: true });
  renameSync(join(root, move.from), to);
}

// A journal entry's state decides it: a rename either happened or did not, so any other combination means
// something else touched the tree and the operator has to look.
function resumeMoves(root: string, moves: readonly DataLayoutMove[]): DataLayoutMove[] {
  const applied: DataLayoutMove[] = [];
  for (const move of moves) {
    const from = join(root, move.from);
    const to = join(root, move.to);
    const fromExists = exists(from);
    const toExists = exists(to);
    if (fromExists && !holdsData(to)) {
      applyMove(root, move);
      applied.push(move);
    } else if (!fromExists && toExists) {
      applied.push(move);
    } else {
      throw new Error(
        `boot/data-layout: cannot resume the interrupted layout migration under ${root}: ${from} and ${to} ${fromExists ? "both hold data" : "are both missing"}. Sort the two out by hand, then delete ${join(root, LAYOUT_JOURNAL)} and start again.`,
      );
    }
  }
  return applied;
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
 * @throws Error before any rename when a legacy path and its target both hold data, when another live
 * process holds the journal, or when a journal entry's state matches neither "done" nor "pending".
 */
export async function migrateDataLayout(deps: MigrateDataLayoutDeps): Promise<DataLayoutMigrationReport> {
  const root = deps.layout.root;
  const isAlive = deps.isPidAlive ?? pidAlive;
  if (!existsSync(root)) {
    ensureContainerDirs(root, new Set());
    return NO_MIGRATION;
  }
  const journalPath = join(root, LAYOUT_JOURNAL);
  if (existsSync(journalPath)) {
    const journal = readJournal(journalPath);
    if (isAlive(journal.pid)) {
      throw new Error(
        `boot/data-layout: another process (pid ${journal.pid}) is migrating the data layout under ${root}; wait for it to finish, then start again.`,
      );
    }
    const moved = resumeMoves(root, journal.moves);
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
    const pairs = conflicts.map((move) => `${join(root, move.from)} and ${join(root, move.to)}`).join("; ");
    throw new Error(
      `boot/data-layout: ${root} holds a legacy path and its new location, and both hold data: ${pairs}. Keep the one in use and move or delete the other by hand, then start again. Nothing was moved.`,
    );
  }
  if (planned.some((move) => move.from === DB_FILE_NAME)) {
    await snapshotLegacyDb(root, deps.layout);
  }
  // The close above may have removed an empty sidecar; move only what is still there.
  const moves = planned.filter((move) => exists(join(root, move.from)));
  ensureContainerDirs(root, new Set(moves.map((move) => move.to)));
  writeJournal(journalPath, { pid: deps.pid ?? process.pid, moves });
  for (const move of moves) {
    applyMove(root, move);
  }
  rmSync(journalPath);
  const report = { moved: moves, leftInPlace: leftInPlace(root), resumed: false };
  logReport(root, report);
  return report;
}
