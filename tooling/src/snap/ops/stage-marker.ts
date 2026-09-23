// THE SHARED, REPO-KEYED BAND TABLE — <main-checkout>/.cache/snap-stage/bands.json. Split out of
// ops/stage.ts when that file crossed the tooling line cap (docs/law/Core-Tooling-Law.md §4.3); it is
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
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { STAGE_BAND_COUNT, stageBandForPort } from "../../_shared/ports.ts";
import { runNicedSync } from "../../_shared/proc.ts";
import { pidAlive } from "../../_shared/run-retention.ts";
import type { StageBandClaim, StageBandsFile, StageDbProvenance, StageKeeper, StageRow } from "../contract/stage.ts";
import {
  BANDS_REL,
  LEGACY_ACTIVE_REL,
  markerRootFromCommonDir,
  STAGE_ROOT_REL,
  stageBandClaim,
  stageBandRefusal,
  stageBandSharedNote,
} from "../lib/stage-plan.ts";
import { boundStageRow } from "../lib/stage-run-binding.ts";
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
const LOCK_DEPTH = new Map<string, number>();

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDeath(value: unknown): Pick<StageRow, "dead"> | Record<never, never> {
  return isRecord(value) && typeof value["detectedAt"] === "string" && typeof value["op"] === "string"
    ? { dead: { detectedAt: value["detectedAt"], op: value["op"] } }
    : {};
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

function readDbProvenance(value: unknown): StageDbProvenance | null {
  if (!isRecord(value)) {
    return null;
  }
  const copiedFrom = value["copiedFrom"];
  const copiedAt = value["copiedAt"];
  const devDbMtimeAtCopy = value["devDbMtimeAtCopy"];
  return typeof copiedFrom === "string" && typeof copiedAt === "string" && typeof devDbMtimeAtCopy === "string"
    ? { copiedFrom, copiedAt, devDbMtimeAtCopy }
    : null;
}

/** THE table's env door, read once at module load because every consumer is a FRESH PROCESS (the snap cli,
 *  the session daemon, the stage keeper, each spawned proof) — the same posture ops/session-registry.ts
 *  states for `ORB_SNAP_SESSION_HOME`, and it exists for the same reason: a committed proof that wrote the
 *  box's REAL `bands.json` would evict a live sibling lane's stage. It is also what lets a proof's SPAWNED
 *  child (a keeper) agree with the parent about which table it is keeping, since the child inherits it. */
// biome-ignore lint/style/noProcessEnv: the ambient TOOLING knob this file owns — the scratch band-table home the committed proofs plant, twin of ops/session-registry.ts's ORB_SNAP_SESSION_HOME. The env door the rule points at (packages/server/src/foundation/env) sits ABOVE @orb/tooling in the cake and cannot be imported down here.
const { ORB_SNAP_STAGE_HOME: HOME_OVERRIDE } = process.env;

export function markerRoot(root: string): string {
  if (HOME_OVERRIDE !== undefined && HOME_OVERRIDE !== "") {
    return HOME_OVERRIDE;
  }
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
    ownerPid: typeof value["ownerPid"] === "number" ? value["ownerPid"] : null,
    startedAt,
    // A row written before the heartbeat existed has no `lastUsedAt`. Backfill it from the boot stamp
    // rather than leaving it undefined: every reader then works on a total shape, and the boot stamp is
    // the honest floor — it can only make such a stage look OLDER.
    lastUsedAt: typeof value["lastUsedAt"] === "string" ? value["lastUsedAt"] : startedAt,
    sessions: Array.isArray(value["sessions"]) ? value["sessions"].filter((name): name is string => typeof name === "string") : [],
    dbProvenance: readDbProvenance(value["dbProvenance"]),
    rsyncs: typeof value["rsyncs"] === "number" ? value["rsyncs"] : 0,
    ...readDeath(value["dead"]),
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
  // @orb-waive caught-failure-ownership(catch): optional-read-as-absent — a truncated/garbage legacy marker is treated as "no legacy stage", which is the same clean-rebuild path a missing one takes. Ends if a legacy marker ever carries state the table cannot re-derive.
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
  // @orb-waive caught-failure-ownership(catch): optional-read-as-absent — a truncated/garbage table (a killed mid-write) is treated as "no stages", which triggers the same clean-allocate path an ABSENT table takes, legacy migration included; the operator sees the empty census on the next `--stage-status`. Ends if the sweep/status readers stop tolerating an empty table.
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
  const file: StageBandsFile = { v: BANDS_FILE_VERSION, rows: [...rows].sort((a, b) => a.band - b.band) };
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
export function markStageDead(home: string, band: number, detectedAt: string, op: string): void {
  withBandsLock(home, () => {
    const row = readRowFor(home, band);
    if (row !== null) {
      writeRow(home, { ...row, dead: { detectedAt, op } });
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
      writeRow(home, { ...row, sessions: [...new Set([...row.sessions, name])], lastUsedAt: nowIso });
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

/** A synchronous pause. The whole stage path is sync (spawnSync boots, `ss` probes, JSON writes), so the
 *  waiter cannot yield to an event loop — `Atomics.wait` on a throwaway buffer is node's sanctioned
 *  sync sleep and burns no CPU, unlike a spin. */
function waitSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)), 0, 0, ms);
}

function lockHolderPid(path: string): number | null {
  // @orb-waive caught-failure-ownership(catch): optional-read-as-absent — an unreadable holder file means "I cannot identify the holder", which the age check below then judges. Ends if a lock ever carries state beyond its holder pid.
  try {
    const pid = Number(readFileSync(join(path, "pid"), "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/** Monotonic per-process tie-breaker so two releases of the same lock PATH inside one process (e.g.
 *  successive test cases sharing a pid) never rename to the same `.releasing-*` name. */
let releaseSeq = 0;

/** Physically release a lock directory: RENAME it off its live name first, then remove the renamed copy.
 *  The rename is the atomic step (#1732) — a concurrent `mkdirSync(path)` either lands on the fresh
 *  (post-rename) name outright, or still sees the live directory and fails EEXIST; it can never observe
 *  a half-removed directory. Before this, `rmSync(path, { recursive: true, force: true })` ran directly
 *  against the LIVE name: its internal readdir→unlink→rmdir sequence is not atomic against a concurrent
 *  write into that same still-live path, and a waiter that recreated `pid` in that window (a false-stale
 *  break, or the "give up waiting" takeover below) made the rmdir see a non-empty directory and throw
 *  ENOTEMPTY out of the holder's own release.
 *  `onRenamed` is a TEST SEAM ONLY, firing after the rename and before the removal so a suite can plant
 *  that exact race deterministically instead of chasing real OS-level timing — no production caller
 *  passes it. */
export function releaseLockDir(path: string, onRenamed?: () => void): void {
  releaseSeq += 1;
  const releasing = `${path}.releasing-${process.pid}-${releaseSeq}`;
  // @orb-waive caught-failure-ownership(catch): the rename target is already gone — someone
  // else's break or release beat us to it — which means there is nothing left for THIS caller to remove.
  // Ends if this ever stops being a "someone else already finished the job" race.
  try {
    renameSync(path, releasing);
  } catch {
    return;
  }
  onRenamed?.();
  rmSync(releasing, { recursive: true, force: true });
}

function breakStaleLock(path: string, startedMs: number): void {
  const pid = lockHolderPid(path);
  const dead = pid === null || !pidAlive(pid);
  if (dead || Date.now() - startedMs > LOCK_STALE_MS) {
    releaseLockDir(path);
  }
}

/** Run `fn` holding the table's mutex. The lock is BROKEN rather than waited on forever when its holder is
 *  gone or it has outlived `LOCK_STALE_MS`; when the wait budget runs out the lock is broken and taken
 *  anyway, because refusing to allocate over a stuck lock file would turn a crashed allocator into a
 *  box-wide outage — and the table write itself is a single atomic `writeFileSync`. */
export function withBandsLock<T>(home: string, fn: () => T): T {
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
  const path = lockPath(home);
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    // @orb-waive caught-failure-ownership(catch): EEXIST is the mutex's SUCCESS-of-the-other-caller signal, not a failure — the loop below judges the holder and either waits or breaks it. Ends if mkdir stops being the lock primitive.
    try {
      mkdirSync(path);
      writeFileSync(join(path, "pid"), `${process.pid}\n`);
      break;
    } catch {
      // Held (or unwritable): judge the holder, then wait a beat.
    }
    breakStaleLock(path, Date.now());
    if (Date.now() > deadline) {
      releaseLockDir(path);
      mkdirSync(path, { recursive: true });
      writeFileSync(join(path, "pid"), `${process.pid}\n`);
      break;
    }
    waitSync(LOCK_POLL_MS);
  }
  LOCK_DEPTH.set(home, 1);
  try {
    return fn();
  } finally {
    LOCK_DEPTH.delete(home);
    releaseLockDir(path);
  }
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
  const checkout = opts.checkout ?? repoRoot();
  const readTable = opts.readTable ?? ((): readonly StageRow[] => readBands(markerRoot(checkout)));
  const readBinding = opts.readBinding ?? boundStageRow;
  const rows = readTable();
  const claim = stageBandClaim(url, checkout, rows, readBinding());
  return { claim, refusal: stageBandRefusal(claim, url, checkout, rows), note: stageBandSharedNote(claim, url, rows) };
}
