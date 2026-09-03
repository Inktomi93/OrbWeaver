// THE SHARED, REPO-KEYED BAND TABLE — <main-checkout>/.cache/snap-stage/bands.json. Split out of
// ops/stage.ts when that file crossed the tooling line cap (docs/architecture/core/Core-Tooling-Law.md §4.3); it is
// one command family, and the one every other stage module reads.
//
// Every function here takes the TABLE ROOT (`markerRoot(repoRoot())`), never a checkout root: that is the
// whole of issue #108. A band is a port pair for the whole box, so the file naming its owner must be one
// every checkout agrees on — `git rev-parse --git-common-dir` answers `<main>/.git` from every linked
// worktree. Stage DIRS stay per-checkout (they are worktrees of that checkout); only this ONE table is
// shared, and each row names the checkout its dir belongs to.
//
// THE TABLE REPLACED A SINGLE MARKER (#1276, design §3.6). `active.json` held ONE stage because there was
// ONE band; `bands.json` holds one row per band in `_shared/ports.ts` `STAGE_BANDS`. The old file is read
// ONCE by `readBands` as a legacy row and then DELETED — there is no compat shim and nothing ever writes it
// again (`Core-Tooling-Law.md` §1: half a migration is the named rot).
//
// ALLOCATION IS LOCKED, AND IT HAS TO BE. Two lanes reading "band 0 is free" in the same millisecond would
// both boot onto band 0 and the second would kill the first — which is the exact contention this table
// exists to end. `withBandsLock` is a mkdir-based mutex (mkdir is atomic on every filesystem we run on)
// held across the read-decide-claim window, so a band is CLAIMED by a written row before its 55 s stack
// boot starts. A lock whose holder pid is gone, or which is older than `LOCK_STALE_MS`, is broken rather
// than inherited: a crashed allocator must not wedge the box forever.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pidAlive } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { STAGE_BAND_COUNT, stageBandForPort } from "../../_shared/ports.ts";
import { runNicedSync } from "../../_shared/proc.ts";
import type { StageBandsFile, StageRow } from "../contract/stage.ts";
import { BANDS_REL, LEGACY_ACTIVE_REL, markerRootFromCommonDir, STAGE_ROOT_REL, stageBandClaim, stageBandRefusal } from "../lib/stage-plan.ts";
import { repoRoot } from "./stage-git.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

const BANDS_FILE_VERSION = 1;
const LOCK_REL = join(STAGE_ROOT_REL, "bands.lock");
/** How long a held lock may live before the next allocator breaks it. Generous relative to the work it
 *  guards (a read, a decide and a write — milliseconds), tight relative to a stage boot, so a crashed
 *  allocator costs one waiter a short pause and never a wedged box. */
const LOCK_STALE_MS = 30_000;
const LOCK_POLL_MS = 25;
const LOCK_WAIT_MS = 5000;

export function markerRoot(root: string): string {
  const res = runNicedSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: root });
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
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const row = value as Partial<StageRow>;
  const bandOk = typeof row.band === "number" && Number.isInteger(row.band) && row.band >= 0 && row.band < STAGE_BAND_COUNT;
  if (!(bandOk && typeof row.checkout === "string" && typeof row.sha === "string" && typeof row.dir === "string")) {
    return null;
  }
  const startedAt = typeof row.startedAt === "string" ? row.startedAt : new Date(0).toISOString();
  return {
    band: row.band as number,
    sha: row.sha,
    dir: row.dir,
    serverPort: typeof row.serverPort === "number" ? row.serverPort : 0,
    vitePort: typeof row.vitePort === "number" ? row.vitePort : 0,
    checkout: row.checkout,
    ownerPid: typeof row.ownerPid === "number" ? row.ownerPid : null,
    startedAt,
    // A row written before the heartbeat existed has no `lastUsedAt`. Backfill it from the boot stamp
    // rather than leaving it undefined: every reader then works on a total shape, and the boot stamp is
    // the honest floor — it can only make such a stage look OLDER.
    lastUsedAt: typeof row.lastUsedAt === "string" ? row.lastUsedAt : startedAt,
    sessions: Array.isArray(row.sessions) ? row.sessions.filter((name): name is string => typeof name === "string") : [],
    dbProvenance: typeof row.dbProvenance === "object" && row.dbProvenance !== null ? row.dbProvenance : null,
    rsyncs: typeof row.rsyncs === "number" ? row.rsyncs : 0,
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
  // @orb-gate-ignore caught-failure-ownership(default:catch): optional-read-as-absent — a truncated/garbage legacy marker is treated as "no legacy stage", which is the same clean-rebuild path a missing one takes. Ends if a legacy marker ever carries state the table cannot re-derive.
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
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
  // @orb-gate-ignore caught-failure-ownership(empty:catch): optional-read-as-absent — a truncated/garbage table (a killed mid-write) is treated as "no stages", which triggers the same clean-allocate path an ABSENT table takes, legacy migration included; the operator sees the empty census on the next `--stage-status`. Ends if the sweep/status readers stop tolerating an empty table.
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<StageBandsFile>;
    const rows = Array.isArray(parsed.rows) ? parsed.rows.map(readRow).filter((row): row is StageRow => row !== null) : [];
    return migrateLegacyMarker(home, rows);
  } catch {
    return migrateLegacyMarker(home, []);
  }
}

/** Exported beside `readBands` because the pair IS the cross-checkout contract (#108): the suite proves a
 *  table written under one checkout's `markerRoot` is read back under another's. */
export function writeBands(home: string, rows: readonly StageRow[]): void {
  mkdirSync(join(home, STAGE_ROOT_REL), { recursive: true });
  const file: StageBandsFile = { v: BANDS_FILE_VERSION, rows: [...rows].sort((a, b) => a.band - b.band) };
  writeFileSync(bandsPath(home), `${JSON.stringify(file, null, 2)}\n`);
}

function readRowFor(home: string, band: number): StageRow | null {
  return readBands(home).find((row) => row.band === band) ?? null;
}

/** Write one row, replacing whatever held its band. Read-modify-write, so a concurrent allocator's row on
 *  ANOTHER band survives (the whole table is one file; a blind overwrite would drop it). */
export function writeRow(home: string, row: StageRow): void {
  writeBands(home, [...readBands(home).filter((existing) => existing.band !== row.band), row]);
}

export function clearRow(home: string, band: number): void {
  const kept = readBands(home).filter((row) => row.band !== band);
  writeBands(home, kept);
}

/** Stamp the heartbeat (#324) without disturbing anything else the row says — called by every
 *  `ensureStage`, every session call bound to the band and every attached sibling run, including a
 *  `shared-reuse` of a SIBLING checkout's stage: a band's liveness is USE, and our use is as good as
 *  theirs. A missing row is a no-op (there is nothing to keep alive). */
export function touchRow(home: string, band: number, nowIso: string): void {
  const row = readRowFor(home, band);
  if (row !== null) {
    writeRow(home, { ...row, lastUsedAt: nowIso });
  }
}

/** Bind/unbind a session name to the band it drives — the list `stageSweepVerdict` fences the reaper on.
 *  Idempotent in both directions: a daemon that re-binds after a reclaim must not double the name, and a
 *  close that runs twice must not fail. */
export function bindSessionToBand(home: string, band: number, name: string, nowIso: string): void {
  const row = readRowFor(home, band);
  if (row !== null) {
    writeRow(home, { ...row, sessions: [...new Set([...row.sessions, name])], lastUsedAt: nowIso });
  }
}

export function unbindSessionFromBand(home: string, band: number, name: string): void {
  const row = readRowFor(home, band);
  if (row !== null) {
    writeRow(home, { ...row, sessions: row.sessions.filter((bound) => bound !== name) });
  }
}

// ── the allocation mutex ──────────────────────────────────────────────────────────────────────────────

function lockPath(home: string): string {
  return join(home, LOCK_REL);
}

/** A synchronous pause. The whole stage path is sync (spawnSync boots, `ss` probes, JSON writes), so the
 *  waiter cannot yield to an event loop — `Atomics.wait` on a throwaway buffer is node's sanctioned
 *  sync sleep and burns no CPU, unlike a spin. */
function waitSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)), 0, 0, ms);
}

function lockHolderPid(path: string): number | null {
  // @orb-gate-ignore caught-failure-ownership(default:catch): optional-read-as-absent — an unreadable holder file means "I cannot identify the holder", which the age check below then judges. Ends if a lock ever carries state beyond its holder pid.
  try {
    const pid = Number(readFileSync(join(path, "pid"), "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function breakStaleLock(path: string, startedMs: number): void {
  const pid = lockHolderPid(path);
  const dead = pid === null || !pidAlive(pid);
  if (dead || Date.now() - startedMs > LOCK_STALE_MS) {
    rmSync(path, { recursive: true, force: true });
  }
}

/** Run `fn` holding the table's mutex. The lock is BROKEN rather than waited on forever when its holder is
 *  gone or it has outlived `LOCK_STALE_MS`; when the wait budget runs out the lock is broken and taken
 *  anyway, because refusing to allocate over a stuck lock file would turn a crashed allocator into a
 *  box-wide outage — and the table write itself is a single atomic `writeFileSync`. */
export function withBandsLock<T>(home: string, fn: () => T): T {
  mkdirSync(join(home, STAGE_ROOT_REL), { recursive: true });
  const path = lockPath(home);
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    // @orb-gate-ignore caught-failure-ownership(empty:catch): EEXIST is the mutex's SUCCESS-of-the-other-caller signal, not a failure — the loop below judges the holder and either waits or breaks it. Ends if mkdir stops being the lock primitive.
    try {
      mkdirSync(path);
      writeFileSync(join(path, "pid"), `${process.pid}\n`);
      break;
    } catch {
      // Held (or unwritable): judge the holder, then wait a beat.
    }
    breakStaleLock(path, Date.now());
    if (Date.now() > deadline) {
      rmSync(path, { recursive: true, force: true });
      mkdirSync(path, { recursive: true });
      writeFileSync(join(path, "pid"), `${process.pid}\n`);
      break;
    }
    waitSync(LOCK_POLL_MS);
  }
  try {
    return fn();
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
}

/** The band-ownership door every `--base`/`--url` instrument enters before it measures anything (#1186).
 *  Returns the refusal text (exit-2 class — nothing was measured) or null when the URL is ours to read.
 *  Both readers are injectable so a suite can plant a FOREIGN owner without touching the box's real,
 *  shared table — writing that file from a test would evict a live sibling stage. */
export function stageBandRefusalFor(url: string, opts: { readonly checkout?: string; readonly readTable?: () => readonly StageRow[] } = {}): string | null {
  const checkout = opts.checkout ?? repoRoot();
  const readTable = opts.readTable ?? ((): readonly StageRow[] => readBands(markerRoot(checkout)));
  const rows = readTable();
  return stageBandRefusal(stageBandClaim(url, checkout, rows), url, checkout, rows);
}
