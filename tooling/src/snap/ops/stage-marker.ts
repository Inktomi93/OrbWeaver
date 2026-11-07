// THE SHARED, REPO-KEYED BAND TABLE — <main-checkout>/.cache/snap-stage/bands.json. Split out of
// ops/stage.ts when that file crossed the tooling line cap; it is
// one command family, and the one every other stage module reads.
//
// Every function here takes the TABLE ROOT (`markerRoot(repoRoot())`), never a checkout root: that is the
// whole of issue #108. A band is a port pair for the whole box, so the file naming its owner must be one
// every checkout agrees on — `git rev-parse --git-common-dir` answers `<main>/.git` from every linked
// worktree. Stage DIRS stay per-checkout (they are worktrees of that checkout); only this ONE table is
// shared, and each row names the checkout its dir belongs to.
//
// THE TABLE REPLACED A SINGLE MARKER (#1276, design §3.6). `active.json` held ONE stage because there was
// ONE band; `bands.json` holds one row per band in `floor/host/ports.ts` `STAGE_BANDS`. The old file is read
// ONCE by `readBands` as a legacy row and then DELETED — there is no compat shim and nothing ever writes it
// again: half a migration is the named rot.
//
// ALLOCATION IS LOCKED, AND IT HAS TO BE. Two lanes reading "band 0 is free" in the same millisecond would
// both boot onto band 0 and the second would kill the first — which is the exact contention this table
// exists to end. `withBandsLock` is the mkdir-based mutex of `floor/process/dir-lock.ts`, held across the
// read-decide-claim window, so a band is CLAIMED by a written row before its 55 s stack boot starts.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { runGit } from "../../floor/git/git.ts";
import { STAGE_BAND_COUNT, stageBandForPort } from "../../floor/host/ports.ts";
import { DIR_LOCK_WAIT_MS, withDirLock } from "../../floor/process/dir-lock.ts";
import { processEnvValue } from "../../floor/process/process-env.ts";
import type { DiskSafeOp } from "../contract/disk-safe-argv.ts";
import type { StageBandClaim, StageBandsFile, StageHolder, StageKeeper, StageRow } from "../contract/stage.ts";
import { storedDiskSafeOp } from "../lib/disk-safe-argv.ts";
import { liveHoldersOf } from "../lib/stage-bands.ts";
import { parseStageDbProvenance } from "../lib/stage-identity.ts";
import {
  BANDS_REL,
  LEGACY_ACTIVE_REL,
  markerRootFromCommonDir,
  STAGE_ROOT_REL,
  stageBandClaim,
  stageBandRefusal,
  stageBandSharedNote,
} from "../lib/stage-plan.ts";
import { boundStageRow, stageBindingRefusal } from "../lib/stage-run-binding.ts";
import { repoRoot, stageCallerOwner } from "./stage-git.ts";
import { holderProcessRunning } from "./stage-probe.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

const BANDS_FILE_VERSION = 1;
const LOCK_REL = join(STAGE_ROOT_REL, "bands.lock");
const LOCK_DEPTH = new Map<string, number>();

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDeath(value: unknown): Pick<StageRow, "dead"> | Record<never, never> {
  return isRecord(value) && typeof value["detectedAt"] === "string" && typeof value["op"] === "string"
    ? { dead: { detectedAt: value["detectedAt"], op: storedDiskSafeOp(value["op"]) } }
    : {};
}

function readWarming(value: unknown): Pick<StageRow, "warming"> | Record<never, never> {
  return isRecord(value) && typeof value["since"] === "string" ? { warming: { since: value["since"] } } : {};
}

/** The armed idle timer, when the row has one (#1163 arm b). Absent stays absent — a keeper is a fact
 *  about a running process, never something to invent from a partial row. */
function readKeeper(value: unknown): Pick<StageRow, "keeper"> | Record<never, never> {
  if (!(isRecord(value) && typeof value["pid"] === "number" && typeof value["armedAt"] === "string")) {
    return {};
  }
  const keeper: StageKeeper = { pid: value["pid"], armedAt: value["armedAt"] };
  return { keeper };
}

/** THE table's env door, read once at module load because every consumer is a FRESH PROCESS (the snap cli,
 *  the session daemon, the stage keeper, each spawned proof) — the same posture ops/session-registry.ts
 *  states for `ORB_SNAP_SESSION_HOME`, and it exists for the same reason: a committed proof that wrote the
 *  box's REAL `bands.json` would evict a live sibling lane's stage. It is also what lets a proof's SPAWNED
 *  child (a keeper) agree with the parent about which table it is keeping, since the child inherits it. */
const HOME_OVERRIDE = processEnvValue("ORB_SNAP_STAGE_HOME");

export function markerRoot(root: string): string {
  if (HOME_OVERRIDE !== undefined && HOME_OVERRIDE !== "") {
    return HOME_OVERRIDE;
  }
  const res = runGit(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  // No git answer at all ⇒ keep the table local: a per-checkout table is worse than none, but one
  // written to a guessed path would be invisible to every reader including this one.
  return res.status === 0 ? markerRootFromCommonDir(res.stdout) : root;
}

function bandsPath(home: string): string {
  return join(home, BANDS_REL);
}

/** A row we cannot reason about is not a row. Every field the access/allocation rules read is checked:
 *  a row with no owner cannot be arbitrated across checkouts, and a row naming a band outside the registry
 *  would hand out ports nobody reserved. Anything else in the file is dropped rather than repaired. */
function readRow(value: unknown): StageRow | null {
  if (!isRecord(value)) {
    return null;
  }
  const band = value["band"];
  const checkout = value["checkout"];
  const sha = value["sha"];
  const dir = value["dir"];
  const bandOk = Number.isInteger(band) && Number(band) >= 0 && Number(band) < STAGE_BAND_COUNT;
  if (!(bandOk && typeof checkout === "string" && typeof sha === "string" && typeof dir === "string")) {
    return null;
  }
  const startedAt = typeof value["startedAt"] === "string" ? value["startedAt"] : new Date(0).toISOString();
  return {
    band: Number(band),
    sha,
    dir,
    serverPort: typeof value["serverPort"] === "number" ? value["serverPort"] : 0,
    vitePort: typeof value["vitePort"] === "number" ? value["vitePort"] : 0,
    checkout,
    ...(typeof value["owner"] === "string" ? { owner: value["owner"] } : {}),
    ownerPid: typeof value["ownerPid"] === "number" ? value["ownerPid"] : null,
    startedAt,
    // A row written before the heartbeat existed has no `lastUsedAt`. Backfill it from the boot stamp
    // rather than leaving it undefined: every reader then works on a total shape, and the boot stamp is
    // the honest floor — it can only make such a stage look OLDER.
    lastUsedAt: typeof value["lastUsedAt"] === "string" ? value["lastUsedAt"] : startedAt,
    ...readHolders(value["holders"]),
    sessions: Array.isArray(value["sessions"]) ? value["sessions"].filter((name): name is string => typeof name === "string") : [],
    dbProvenance: parseStageDbProvenance(value["dbProvenance"]),
    rsyncs: typeof value["rsyncs"] === "number" ? value["rsyncs"] : 0,
    ...readDeath(value["dead"]),
    ...readWarming(value["warming"]),
    ...readKeeper(value["keeper"]),
  };
}

/** THE ONE-TIME LEGACY READ (§3.6). The pre-#1276 `active.json` is adopted as the row for whichever band
 *  its ports name (band 0 in practice — that was the only pair), and then DELETED. A second run finds no
 *  file and resurrects nothing; a legacy row landing on a band the table already occupies is dropped, not
 *  merged, because the live table is the fresher evidence. */
function migrateLegacyMarker(home: string, rows: readonly StageRow[]): readonly StageRow[] {
  const legacyPath = join(home, LEGACY_ACTIVE_REL);
  if (!existsSync(legacyPath)) {
    return rows;
  }
  const legacy = readLegacyRow(legacyPath);
  rmSync(legacyPath, { force: true });
  if (legacy === null || rows.some((row) => row.band === legacy.band)) {
    return rows;
  }
  const migrated = [...rows, legacy];
  writeBands(home, migrated);
  return migrated;
}

function readLegacyRow(path: string): StageRow | null {
  // optional-read-as-absent — a truncated/garbage legacy marker is treated as "no legacy stage", which is the same clean-rebuild path a missing one takes. Ends if a legacy marker ever carries state the table cannot re-derive.
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isRecord(parsed)) {
      return null;
    }
    const vitePort = typeof parsed["vitePort"] === "number" ? parsed["vitePort"] : 0;
    const band = stageBandForPort(vitePort);
    return band === null ? null : readRow({ ...parsed, band, sessions: [], rsyncs: 0, dbProvenance: null });
  } catch {
    return null;
  }
}

/** Every row in the table. The legacy marker is folded in (and deleted) on the first read of a checkout's
 *  life; a truncated/garbage table reads as EMPTY, which sends every caller down the same clean-allocate
 *  path a missing table takes. */
export function readBands(home: string): readonly StageRow[] {
  const path = bandsPath(home);
  if (!existsSync(path)) {
    return migrateLegacyMarker(home, []);
  }
  // optional-read-as-absent — a truncated/garbage table (a killed mid-write) is treated as "no stages", which triggers the same clean-allocate path an ABSENT table takes, legacy migration included; the operator sees the empty census on the next `--stage-status`. Ends if the sweep/status readers stop tolerating an empty table.
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    const rows =
      isRecord(parsed) && parsed["v"] === BANDS_FILE_VERSION && Array.isArray(parsed["rows"])
        ? parsed["rows"].map(readRow).filter((row): row is StageRow => row !== null)
        : [];
    return migrateLegacyMarker(home, rows);
  } catch {
    return migrateLegacyMarker(home, []);
  }
}

/** Exported beside `readBands` because the pair IS the cross-checkout contract (#108): the suite proves a
 *  table written under one checkout's `markerRoot` is read back under another's. */
export function writeBands(home: string, rows: readonly StageRow[]): void {
  mkdirSync(join(home, STAGE_ROOT_REL), { recursive: true });
  // Every write prunes holders that are no longer live, so the list stays bounded across runs.
  const nowMs = Date.now();
  const pruned = rows.map((row) => (row.holders === undefined ? row : { ...row, holders: liveHoldersOf(row, nowMs, holderProcessRunning) }));
  const file: StageBandsFile = { v: BANDS_FILE_VERSION, rows: pruned.sort((a, b) => a.band - b.band) };
  const path = bandsPath(home);
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temp, `${JSON.stringify(file, null, 2)}\n`);
    renameSync(temp, path);
  } finally {
    rmSync(temp, { force: true });
  }
}

function readRowFor(home: string, band: number): StageRow | null {
  return readBands(home).find((row) => row.band === band) ?? null;
}

/** Write one row, replacing whatever held its band. Read-modify-write, so a concurrent allocator's row on
 *  ANOTHER band survives (the whole table is one file; a blind overwrite would drop it). */
export function writeRow(home: string, row: StageRow): void {
  withBandsLock(home, () => {
    writeBands(home, [...readBands(home).filter((existing) => existing.band !== row.band), row]);
  });
}

export function clearRow(home: string, band: number): void {
  withBandsLock(home, () => {
    const kept = readBands(home).filter((row) => row.band !== band);
    writeBands(home, kept);
  });
}

/** Stamp the heartbeat (#324) without disturbing anything else the row says — called by every
 *  `ensureStage`, every session call bound to the band and every attached sibling run, including a
 *  `shared-reuse` of a SIBLING checkout's stage: a band's liveness is USE, and our use is as good as
 *  theirs. A missing row is a no-op (there is nothing to keep alive). */
export function touchRow(home: string, band: number, nowIso: string): void {
  withBandsLock(home, () => {
    const row = readRowFor(home, band);
    if (row !== null) {
      writeRow(home, { ...row, lastUsedAt: nowIso });
    }
  });
}

function readHolders(value: unknown): { readonly holders?: readonly StageHolder[] } {
  if (!Array.isArray(value)) {
    return {};
  }
  const holders = value.filter(
    (entry): entry is StageHolder =>
      isRecord(entry) &&
      Number.isInteger(entry["pid"]) &&
      typeof entry["checkout"] === "string" &&
      typeof entry["stampedAt"] === "string" &&
      (entry["pidStart"] === undefined || typeof entry["pidStart"] === "string"),
  );
  return { holders };
}

/** Record the band's armed idle timer (#1163 arm b). Written by `armStageKeeper` alone, and read by the
 *  keeper itself (to recognise that a rebuild replaced it) and by `--stage-status`. A missing row is a
 *  no-op: there is no stage to keep. */
export function setStageKeeper(home: string, band: number, keeper: StageKeeper): void {
  withBandsLock(home, () => {
    const row = readRowFor(home, band);
    if (row !== null) {
      writeRow(home, { ...row, keeper });
    }
  });
}

/** Persist the stage death a session observed; status/sweep read this same row. */
export function markStageDead(home: string, band: number, detectedAt: string, op: DiskSafeOp): void {
  withBandsLock(home, () => {
    const row = readRowFor(home, band);
    if (row !== null) {
      writeRow(home, { ...row, dead: { detectedAt, op } });
    }
  });
}

/** Record that the stage's first navigation missed readiness while it still answered: kept for one warm retry. */
export function markStageWarming(home: string, band: number, since: string): void {
  withBandsLock(home, () => {
    const row = readRowFor(home, band);
    if (row !== null) {
      writeRow(home, { ...row, warming: { since } });
    }
  });
}

/** The warm retry settled: the stage is an ordinary warm stage again. */
export function clearStageWarming(home: string, band: number): void {
  withBandsLock(home, () => {
    const row = readRowFor(home, band);
    if (row !== null) {
      const { warming: _warming, ...settled } = row;
      writeRow(home, settled);
    }
  });
}

/** Bind/unbind a session name to the band it drives — the list `stageSweepVerdict` fences the reaper on.
 *  Idempotent in both directions: a daemon that re-binds after a reclaim must not double the name, and a
 *  close that runs twice must not fail. */
export function bindSessionToBand(home: string, band: number, name: string, nowIso: string): void {
  withBandsLock(home, () => {
    const row = readRowFor(home, band);
    if (row !== null) {
      writeRow(home, { ...row, lastUsedAt: nowIso, sessions: [...new Set([...row.sessions, name])] });
    }
  });
}

export function unbindSessionFromBand(home: string, band: number, name: string): void {
  withBandsLock(home, () => {
    const row = readRowFor(home, band);
    if (row !== null) {
      writeRow(home, { ...row, sessions: row.sessions.filter((bound) => bound !== name) });
    }
  });
}

// ── the allocation mutex ──────────────────────────────────────────────────────────────────────────────

function lockPath(home: string): string {
  return join(home, LOCK_REL);
}

/** Run `fn` holding the table's mutex, re-entrant within this process. The mutex discipline is `floor/process/dir-lock.ts`. */
export function withBandsLock<T>(home: string, fn: () => T, waitMs: number = DIR_LOCK_WAIT_MS): T {
  const depth = LOCK_DEPTH.get(home) ?? 0;
  if (depth > 0) {
    LOCK_DEPTH.set(home, depth + 1);
    try {
      return fn();
    } finally {
      LOCK_DEPTH.set(home, depth);
    }
  }
  mkdirSync(join(home, STAGE_ROOT_REL), { recursive: true });
  return withDirLock(
    lockPath(home),
    "the stage band table lock",
    () => {
      LOCK_DEPTH.set(home, 1);
      try {
        return fn();
      } finally {
        LOCK_DEPTH.delete(home);
      }
    },
    waitMs,
  );
}

/** The band-ownership door every `--base`/`--url` instrument enters before it measures anything (#1186).
 *  `refusal` is the exit-2 text (nothing was measured) or null when the URL is ours to read; `note` is the
 *  one line a `shared` read owes its operator (#2441) and is null on every other arm — a verdict is never
 *  both. All three readers are injectable so a suite can plant a FOREIGN owner, or this run's own stage
 *  binding, without touching the box's real shared table — writing that file from a test would evict a
 *  live sibling stage. */
export function stageBandVerdictFor(
  url: string,
  opts: {
    readonly checkout?: string;
    readonly readTable?: () => readonly StageRow[];
    readonly readBinding?: () => StageRow | null;
  } = {},
): { readonly claim: StageBandClaim; readonly refusal: string | null; readonly note: string | null } {
  const root = opts.checkout ?? repoRoot();
  const checkout = opts.checkout ?? stageCallerOwner(root);
  const readTable = opts.readTable ?? ((): readonly StageRow[] => readBands(markerRoot(root)));
  const readBinding = opts.readBinding ?? boundStageRow;
  const rows = readTable();
  const binding = readBinding();
  const claim = stageBandClaim(url, checkout, rows, binding);
  const refusal = (binding === null ? null : stageBindingRefusal(url, binding, rows)) ?? stageBandRefusal(claim, url, checkout, rows);
  return { claim, refusal, note: stageBandSharedNote(claim, url, rows) };
}
