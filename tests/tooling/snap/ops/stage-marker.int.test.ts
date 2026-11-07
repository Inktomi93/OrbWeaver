// THE BAND TABLE's I/O and its concurrency (tooling/src/snap/ops/stage-marker.ts, design §3.6 / #1276) —
// real files over a tmpdir and real child PROCESSES over the real mutex. Nothing here boots a stack: the
// table is JSON, the lock is a directory, and the parts that need genuine parallelism get genuine
// processes rather than a promise that pretends.
//
// A SUITE NEVER WRITES THE BOX'S REAL TABLE. Every case passes an explicit tmpdir home (the same rule the
// pre-#1276 marker cases followed): writing `<main>/.cache/snap-stage/bands.json` from a test would evict a
// live sibling lane's stage.
//
// PLANTED CONTROLS, BOTH DIRECTIONS:
//  • FOUR concurrent processes allocating through `withBandsLock` claim FOUR DISTINCT bands — and the
//    positive control that makes that meaningful is that a single process claims band 0, so "distinct" is
//    not being satisfied by an allocator that refuses everyone;
//  • the LIVE-USE guard is exercised through the REAL registry, census and evidence builder: a child
//    (`_stage-sweep-child.ts`) binds its session name onto a band row and registers a session whose daemon
//    pid IS ALIVE (its own), and the row past its TTL still reads `live`; the same child with a DEAD daemon
//    pid reads `stranded`, and a running holder keeps it `live` with no session at all;
//  • the legacy `active.json` migrates ONCE and is gone — and a second read does not resurrect it.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { FROZEN_AT_MS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/tooling";
import { REPO_ROOT } from "@orb/tooling/floor/artifacts/artifacts";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { vi } from "vitest";
import type { PortOwner } from "../../../../tooling/src/floor/host/platform.ts";
import { stageBandPorts } from "../../../../tooling/src/floor/host/ports.ts";
import { releaseLockDir } from "../../../../tooling/src/floor/process/dir-lock.ts";
import type { StageBandsFile, StageRow } from "../../../../tooling/src/snap/contract/stage.ts";
import { diskSafeOp } from "../../../../tooling/src/snap/lib/disk-safe-argv.ts";
import { BANDS_REL, LEGACY_ACTIVE_REL, STAGE_ROOT_REL } from "../../../../tooling/src/snap/lib/stage-plan.ts";
import { stageBindingAlive } from "../../../../tooling/src/snap/ops/stage-census.ts";
import { holdStageUse } from "../../../../tooling/src/snap/ops/stage-holders.ts";
import {
  bindSessionToBand,
  clearRow,
  markStageDead,
  readBands,
  touchRow,
  unbindSessionFromBand,
  withBandsLock,
  writeBands,
  writeRow,
} from "../../../../tooling/src/snap/ops/stage-marker.ts";
import { scaledBudget } from "../../_load-budget.ts";
import type { SweepChildMode, SweepChildReport } from "./_stage-sweep-child.ts";

// Wall clock only — every arm asserts a STRUCTURAL fact (a file's contents, a band index, a verdict
// string), so this file stays in the parallel lane and scales its budget rather than withholding.
const CASE_BUDGET_MS = scaledBudget(60_000, 4);
vi.setConfig({ testTimeout: CASE_BUDGET_MS, hookTimeout: CASE_BUDGET_MS });

const SHA = "0123456789abcdef0123456789abcdef01234567";
const MAIN_CHECKOUT = "/home/dev/orbweaver";
const LANE_CHECKOUT = "/home/dev/orbweaver/.claude/worktrees/agent-lane";
const MS_PER_MINUTE = 60_000;
const CONCURRENT_CLAIMERS = 4;
/** Long enough that four children genuinely overlap inside the critical section on a loaded box — the
 *  whole point is that the lock, not luck, is what serializes them. */
const CLAIM_HOLD_MS = 150;
/** EVERY timestamp in this file is stamped from the house frozen instant, and the two arms that judge an
 *  IDLE AGE hand the verdict the same instant — so "six hours idle" is exactly six hours rather than six
 *  hours minus however long the run took, and a re-run cannot drift. Nothing here has elapsed WALL CLOCK
 *  as its subject: the concurrency arm's overlap is enforced by a held lock (`Atomics.wait` inside the
 *  child's critical section), not by reading a clock, and the live-session fence's subject is a DAEMON PID's
 *  liveness. The child scripts interpolate this same number, so both processes agree on "now". */
const FROZEN_ISO = new Date(FROZEN_AT_MS).toISOString();
/** Six hours before the frozen instant — past every TTL these arms use. */
const AGED_ISO = new Date(FROZEN_AT_MS - 6 * 60 * MS_PER_MINUTE).toISOString();
/** The session registry's scratch-home knob (ops/session-registry.ts) — spelled once, so the fence arms
 *  point the REAL `liveSessionNames` reader at a tmpdir instead of the box's live session registry. */
const SESSION_HOME_KEY = "ORB_SNAP_SESSION_HOME";

function scratchHome(label: string): string {
  const home = mkdtempSync(join(tmpdir(), `ae-tooling2-bands-${label}-`));
  // The shipped writers mkdir before every write; a case that plants a file by hand does it explicitly.
  mkdirSync(join(home, STAGE_ROOT_REL), { recursive: true });
  return home;
}

function row(band: number, over: Partial<StageRow> = {}): StageRow {
  const ports = stageBandPorts(band);
  return {
    band,
    sha: SHA,
    dir: `${MAIN_CHECKOUT}/.cache/snap-stage/0123456789ab`,
    serverPort: ports.server,
    vitePort: ports.vite,
    checkout: MAIN_CHECKOUT,
    ownerPid: 4242,
    startedAt: FROZEN_ISO,
    lastUsedAt: FROZEN_ISO,
    sessions: [],
    dbProvenance: null,
    rsyncs: 0,
    ...over,
  };
}

/** Write a throwaway node script beside the scratch home and run it, returning its stdout. Absolute
 *  imports into this checkout, so the child exercises the SHIPPED modules. */
async function runChild(child: {
  readonly home: string;
  readonly name: string;
  readonly body: string;
  readonly args?: readonly string[];
}): Promise<{ readonly stdout: string; readonly code: number | null }> {
  const path = join(child.home, `${child.name}.ts`);
  writeFileSync(path, child.body);
  const res = await spawnNiced("node", [path, ...(child.args ?? [])], { timeoutMs: CASE_BUDGET_MS });
  return { stdout: `${res.stdout}${res.stderr}`, code: res.code };
}

const MARKER_SRC = join(REPO_ROOT, "tooling/src/snap/ops/stage-marker.ts");
const BANDS_SRC = join(REPO_ROOT, "tooling/src/snap/lib/stage-bands.ts");
const PORTS_SRC = join(REPO_ROOT, "tooling/src/floor/host/ports.ts");

// ── the table's shape ─────────────────────────────────────────────────────────────────────────────────

test("a row written under one checkout's table home is read back under another's (the #108 contract, per row)", () => {
  const home = scratchHome("shared");
  writeRow(home, row(2, { checkout: LANE_CHECKOUT }));
  const rows = readBands(home);
  expect(rows).toHaveLength(1);
  expect(rows[0]?.checkout).toBe(LANE_CHECKOUT);
  expect(rows[0]?.band).toBe(2);
  expect(rows[0]?.serverPort).toBe(stageBandPorts(2).server);
  // The file is versioned, and the rows are sorted by band so a human diff of the table is stable.
  const file = JSON.parse(readFileSync(join(home, BANDS_REL), "utf8")) as StageBandsFile;
  expect(file.v).toBe(1);
});

test("a row's clone flag survives the table, so a --stage-db stage still reads as a clone", () => {
  const home = scratchHome("clone-flag");
  const dbProvenance = { copiedFrom: "/box/prod.db", cloned: true as const, copiedAt: FROZEN_ISO, devDbMtimeAtCopy: AGED_ISO };
  writeRow(home, row(1, { dbProvenance }));
  expect(readBands(home)[0]?.dbProvenance).toEqual(dbProvenance);
});

test("writeRow REPLACES one band and leaves every sibling row standing — a blind overwrite would drop a lane's stage", () => {
  const home = scratchHome("replace");
  writeRow(home, row(0));
  writeRow(home, row(1, { checkout: LANE_CHECKOUT }));
  writeRow(home, row(0, { sha: "f".repeat(40) }));
  const rows = readBands(home);
  expect(rows.map((entry) => entry.band)).toEqual([0, 1]);
  expect(rows.find((entry) => entry.band === 0)?.sha).toBe("f".repeat(40));
  expect(rows.find((entry) => entry.band === 1)?.checkout).toBe(LANE_CHECKOUT);
  clearRow(home, 0);
  expect(readBands(home).map((entry) => entry.band)).toEqual([1]);
});

test("touchRow stamps the heartbeat and disturbs NOTHING else the row says", () => {
  const home = scratchHome("touch");
  const original = row(3, { lastUsedAt: AGED_ISO, rsyncs: 7 });
  writeRow(home, original);
  // A DIFFERENT instant from the row's, or "the heartbeat moved" would pass on an unchanged field.
  const stamped = new Date(FROZEN_AT_MS + MS_PER_MINUTE).toISOString();
  touchRow(home, 3, stamped);
  const after = readBands(home)[0];
  expect(after?.lastUsedAt).toBe(stamped);
  expect(after?.startedAt).toBe(original.startedAt);
  expect(after?.rsyncs).toBe(7);
  // A band with no row is a no-op — there is nothing to keep alive.
  touchRow(home, 9, stamped);
  expect(readBands(home)).toHaveLength(1);
});

test("a run holding a stage is listed as a holder while it runs and removed when it lets go", async () => {
  const home = scratchHome("hold");
  const stage = row(3, { lastUsedAt: AGED_ISO, holders: [] });
  writeRow(home, stage);
  const release = holdStageUse(home, stage, LANE_CHECKOUT, 20);
  try {
    // Stamped at once, not one interval later: a sibling deciding right now must already see the hold.
    expect(readBands(home)[0]?.holders).toEqual([expect.objectContaining({ pid: process.pid, checkout: LANE_CHECKOUT })]);
    const first = readBands(home)[0]?.lastUsedAt;
    await expect.poll(() => readBands(home)[0]?.lastUsedAt).not.toBe(first);
  } finally {
    release();
  }
  expect(readBands(home)[0]?.holders).toEqual([]);
});

test("a holder whose stage was replaced on its band stops, and never stamps the new stage", async () => {
  const home = scratchHome("hold-replaced");
  const stage = row(3, { lastUsedAt: AGED_ISO, holders: [] });
  writeRow(home, stage);
  const release = holdStageUse(home, stage, MAIN_CHECKOUT, 20);
  try {
    // The old stage is torn down and another checkout boots a new one on the same band.
    clearRow(home, 3);
    const replacement = row(3, {
      sha: "a".repeat(40),
      dir: "/lane/.cache/snap-stage/aaaaaaaaaaaa",
      checkout: LANE_CHECKOUT,
      startedAt: AGED_ISO,
      lastUsedAt: AGED_ISO,
      holders: [],
    });
    writeRow(home, replacement);
    await sleep(150);
    expect(readBands(home)[0]?.holders).toEqual([]);
    expect(readBands(home)[0]?.lastUsedAt).toBe(AGED_ISO);
  } finally {
    release();
  }
  expect(readBands(home)[0]?.holders).toEqual([]);
});

test("the owner's warm touch keeps a sibling's hold on the row", () => {
  const home = scratchHome("hold-race");
  const stage = row(3, { checkout: LANE_CHECKOUT, lastUsedAt: AGED_ISO, holders: [] });
  writeRow(home, stage);
  const release = holdStageUse(home, stage, MAIN_CHECKOUT, 60_000);
  try {
    touchRow(home, 3, new Date(FROZEN_AT_MS + MS_PER_MINUTE).toISOString());
    expect(readBands(home)[0]?.holders).toEqual([expect.objectContaining({ checkout: MAIN_CHECKOUT, pid: process.pid })]);
  } finally {
    release();
  }
});

test("a later heartbeat that cannot take the table lock is skipped without waiting, never thrown into the run", async () => {
  const home = scratchHome("hold-contended");
  const stage = row(3, { lastUsedAt: AGED_ISO, holders: [] });
  writeRow(home, stage);
  const release = holdStageUse(home, stage, LANE_CHECKOUT, 20);
  const lockDir = join(home, STAGE_ROOT_REL, "bands.lock");
  mkdirSync(lockDir);
  writeFileSync(join(lockDir, "pid"), `${process.pid}\n`);
  try {
    // Beats keep firing against the held lock; a waiting beat would block this timer for its whole budget.
    // the subject is elapsed real time — a beat that waits blocks the event loop.
    const started = Date.now();
    await sleep(200);
    // the same elapsed-time measurement's end.
    expect(Date.now() - started).toBeLessThan(2000);
    expect(readBands(home)[0]?.holders).toEqual([expect.objectContaining({ pid: process.pid })]);
  } finally {
    releaseLockDir(lockDir);
    release();
  }
});

test("a row with no owner, or naming a band outside the registry, is DROPPED rather than reasoned about", () => {
  const home = scratchHome("garbage");
  writeBands(home, [row(0)]);
  const path = join(home, BANDS_REL);
  const { checkout: _dropped, ...ownerless } = row(1);
  writeFileSync(path, JSON.stringify({ v: 1, rows: [ownerless, { ...row(2), band: 99 }, row(0)] }));
  expect(readBands(home).map((entry) => entry.band)).toEqual([0]);
});

test("a truncated table reads as NO stages — the same clean-allocate path a missing one takes", () => {
  const home = scratchHome("truncated");
  writeBands(home, [row(0)]);
  writeFileSync(join(home, BANDS_REL), '{"v":1,"rows":[{');
  expect(readBands(home)).toEqual([]);
});

// ── the one-time legacy migration (no compat shim) ────────────────────────────────────────────────────

test("the pre-#1276 active.json is adopted ONCE as a row and DELETED — and a second read does not resurrect it", () => {
  const home = scratchHome("legacy");
  const ports = stageBandPorts(0);
  writeFileSync(
    join(home, LEGACY_ACTIVE_REL),
    JSON.stringify({
      sha: SHA,
      shortSha: "0123456789ab",
      dir: `${LANE_CHECKOUT}/.cache/snap-stage/0123456789ab`,
      serverPort: ports.server,
      vitePort: ports.vite,
      baseUrl: `http://localhost:${ports.vite}`,
      checkout: LANE_CHECKOUT,
      ownerPid: 1234,
      startedAt: "2026-08-16T12:00:00.000Z",
      lastUsedAt: "2026-08-16T12:30:00.000Z",
    }),
  );
  const migrated = readBands(home);
  expect(migrated).toHaveLength(1);
  expect(migrated[0]?.band).toBe(0);
  expect(migrated[0]?.checkout).toBe(LANE_CHECKOUT);
  expect(migrated[0]?.lastUsedAt).toBe("2026-08-16T12:30:00.000Z");
  // The derived fields are NOT carried across — the row stores ports and derives the rest.
  expect(Object.keys(migrated[0] ?? {})).not.toContain("baseUrl");
  expect(existsSync(join(home, LEGACY_ACTIVE_REL))).toBe(false);

  // Second read: the file is gone and nothing re-creates it. Clearing the row leaves an EMPTY table, not a
  // resurrected marker — half a migration is the rot this arm exists to catch.
  clearRow(home, 0);
  expect(readBands(home)).toEqual([]);
  expect(existsSync(join(home, LEGACY_ACTIVE_REL))).toBe(false);
});

test("a legacy marker on a band the table already holds is dropped — the live table is the fresher evidence", () => {
  const home = scratchHome("legacy-collide");
  writeRow(home, row(0, { sha: "a".repeat(40) }));
  writeFileSync(
    join(home, LEGACY_ACTIVE_REL),
    JSON.stringify({ sha: SHA, dir: "/old", serverPort: stageBandPorts(0).server, vitePort: stageBandPorts(0).vite, checkout: LANE_CHECKOUT, startedAt: "x" }),
  );
  const rows = readBands(home);
  expect(rows).toHaveLength(1);
  expect(rows[0]?.sha).toBe("a".repeat(40));
  expect(existsSync(join(home, LEGACY_ACTIVE_REL))).toBe(false);
});

// ── concurrency: the mutex is what makes "a band of your own" true ────────────────────────────────────

const CLAIM_CHILD = (home: string, holdMs: number): string => `
const FROZEN = ${FROZEN_AT_MS};
import { readBands, withBandsLock, writeRow } from ${JSON.stringify(MARKER_SRC)};
import { allocateStageBand } from ${JSON.stringify(BANDS_SRC)};
import { STAGE_BANDS, stageBandPorts } from ${JSON.stringify(PORTS_SRC)};

const HOME = ${JSON.stringify(home)};
const claimed = withBandsLock(HOME, () => {
  const rows = readBands(HOME);
  const views = STAGE_BANDS.map((band) => ({
    band,
    row: rows.find((r) => r.band === band) ?? null,
    bandBound: false,
    bandIsStageRooted: false,
    healthy: false,
    liveSessions: [],
  }));
  const allocation = allocateStageBand({
    views,
    checkout: process.argv[2],
    targetSha: process.argv[2],
    dirty: false,
    fresh: false,
    limits: { ttlMs: 3_600_000, cap: 10 },
    nowMs: FROZEN,
  });
  if (allocation.kind !== "free") {
    return -1;
  }
  // HOLD the critical section: without the lock, four children read the same table here and all four
  // decide on the same band.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${holdMs});
  const ports = stageBandPorts(allocation.band);
  writeRow(HOME, {
    band: allocation.band,
    sha: process.argv[2],
    dir: "/tmp/" + process.argv[2],
    serverPort: ports.server,
    vitePort: ports.vite,
    checkout: process.argv[2],
    ownerPid: process.pid,
    startedAt: new Date(FROZEN).toISOString(),
    lastUsedAt: new Date(FROZEN).toISOString(),
    sessions: [],
    dbProvenance: null,
    rsyncs: 0,
  });
  return allocation.band;
});
console.log("CLAIMED " + claimed);
`;

test("ONE process claims band 0 — the positive control for the concurrent arm below", async () => {
  const home = scratchHome("claim-one");
  const child = await runChild({ home, name: "claim", body: CLAIM_CHILD(home, 0), args: ["lane-solo"] });
  expect(child.code, child.stdout).toBe(0);
  expect(child.stdout).toContain("CLAIMED 0");
  expect(readBands(home).map((entry) => entry.band)).toEqual([0]);
});

test("an allocator does not steal the lock between mkdir and its holder's pid write", async () => {
  const home = scratchHome("pending-pid");
  const lockDir = join(home, STAGE_ROOT_REL, "bands.lock");
  const attempted = join(home, "attempted");
  mkdirSync(lockDir);
  const childPath = join(home, "pending-pid-child.ts");
  writeFileSync(
    childPath,
    `import { writeFileSync } from "node:fs";
import { withBandsLock } from ${JSON.stringify(MARKER_SRC)};
writeFileSync(${JSON.stringify(attempted)}, "ready");
withBandsLock(${JSON.stringify(home)}, () => console.log("CLAIMED"));
`,
  );
  const child = spawnNiced("node", [childPath], { timeoutMs: CASE_BUDGET_MS });
  try {
    for (let poll = 0; poll < 200 && !existsSync(attempted); poll += 1) {
      await sleep(25);
    }
    expect(existsSync(attempted)).toBe(true);
    await sleep(CLAIM_HOLD_MS);
    expect(existsSync(lockDir), "the new lock must survive its ownerless creation window").toBe(true);
  } finally {
    releaseLockDir(lockDir);
  }
  const result = await child;
  expect(result.code, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toContain("CLAIMED");
});

// The holder file leads with the pid and may carry the holder's kernel start time after it.
const holderPidOf = (lockDir: string): number => Number(readFileSync(join(lockDir, "pid"), "utf8").trim().split(/\s+/u)[0]);

test("a dead holder is reaped and the new holder releases its own lock", () => {
  const home = scratchHome("dead-holder");
  const lockDir = join(home, STAGE_ROOT_REL, "bands.lock");
  mkdirSync(lockDir);
  writeFileSync(join(lockDir, "pid"), "2147483647\n");

  expect(withBandsLock(home, () => holderPidOf(lockDir))).toBe(process.pid);
  expect(existsSync(lockDir)).toBe(false);
});

test("an aged ownerless directory is reaped, but a fresh ownerless directory remains held", () => {
  const home = scratchHome("ownerless-age");
  const lockDir = join(home, STAGE_ROOT_REL, "bands.lock");
  mkdirSync(lockDir);
  expect(() => withBandsLock(home, () => "unexpected")).toThrow("timed out waiting for the stage band table lock");
  expect(existsSync(lockDir)).toBe(true);

  utimesSync(lockDir, new Date(0), new Date(0));
  expect(withBandsLock(home, () => holderPidOf(lockDir))).toBe(process.pid);
  expect(existsSync(lockDir)).toBe(false);
});

test("a live holder is never stolen when a waiter exhausts its budget", () => {
  const home = scratchHome("live-holder-timeout");
  const lockDir = join(home, STAGE_ROOT_REL, "bands.lock");
  mkdirSync(lockDir);
  writeFileSync(join(lockDir, "pid"), `${process.pid}\n`);

  expect(() => withBandsLock(home, () => "unexpected")).toThrow("timed out waiting for the stage band table lock");
  expect(readFileSync(join(lockDir, "pid"), "utf8")).toBe(`${process.pid}\n`);
  releaseLockDir(lockDir);
});

test("a nested throw unwinds lock depth and releases the outer holder", () => {
  const home = scratchHome("nested-throw");
  const lockDir = join(home, STAGE_ROOT_REL, "bands.lock");
  expect(() =>
    withBandsLock(home, () =>
      withBandsLock(home, () => {
        throw new Error("nested failure");
      }),
    ),
  ).toThrow("nested failure");
  expect(existsSync(lockDir)).toBe(false);
  expect(withBandsLock(home, () => "reacquired")).toBe("reacquired");
});

test("FOUR CONCURRENT PROCESSES CLAIM FOUR DISTINCT BANDS, and no two share a port", async () => {
  const home = scratchHome("claim-many");
  const body = CLAIM_CHILD(home, CLAIM_HOLD_MS);
  const children = await Promise.all(
    Array.from({ length: CONCURRENT_CLAIMERS }, (_unused, index) => {
      const path = join(home, `claim-${index}.ts`);
      writeFileSync(path, body);
      return spawnNiced("node", [path, `lane-${index}`], { timeoutMs: CASE_BUDGET_MS });
    }),
  );
  for (const child of children) {
    expect(child.code, child.stdout + child.stderr).toBe(0);
  }
  const claimed = children.map((child) => Number(/CLAIMED (-?\d+)/u.exec(child.stdout)?.[1]));
  expect(new Set(claimed).size, `four lanes must land on four bands, got ${claimed.join(",")}`).toBe(CONCURRENT_CLAIMERS);
  const rows = readBands(home);
  expect(rows).toHaveLength(CONCURRENT_CLAIMERS);
  const ports = rows.flatMap((entry) => [entry.serverPort, entry.vitePort]);
  expect(new Set(ports).size, "no two stages may share a port").toBe(ports.length);
});

// ── the lock's own release, racing a concurrent allocator (#1732) ────────────────────────────────────
//
// A direct `rmSync(lockDir, { recursive: true, force: true })` on the LIVE lock name is not atomic
// against a concurrent write into that same path: its readdir→unlink→rmdir sequence can see `pid`
// reappear between the unlink and the rmdir and throw ENOTEMPTY. Reproduced mechanically against the
// unmodified pre-fix shape (raw fs calls, same call order `rmSync` performs internally): mkdir a lock
// dir, write `pid`, unlink it, have a "concurrent allocator" recreate `pid`, then `rmdirSync` — THREW
// `ENOTEMPTY: directory not empty, rmdir '.../bands.lock'`. The fix renames the lock dir off its live
// name FIRST (`releaseLockDir`), so the removal targets a name nothing else can see or write into; the
// pin below exercises the SHIPPED function via its `onRenamed` test hook, which fires in exactly that
// window.

test("releaseLockDir survives a concurrent allocator recreating the lock's live name mid-release (#1732)", () => {
  const home = scratchHome("release-race");
  const lockDir = join(home, STAGE_ROOT_REL, "bands.lock");
  mkdirSync(lockDir);
  writeFileSync(join(lockDir, "pid"), "111\n");

  expect(() => {
    releaseLockDir(lockDir, () => {
      // The concurrent allocator: by the time `onRenamed` fires, `lockDir`'s live name is already
      // free (the rename happened), so recreating it here lands on a FRESH directory disjoint from
      // the renamed copy `releaseLockDir` is about to remove — the exact race that threw ENOTEMPTY
      // pre-fix.
      mkdirSync(lockDir);
      writeFileSync(join(lockDir, "pid"), "222\n");
    });
  }).not.toThrow();

  // The concurrent allocator's fresh lock is untouched by the release it raced.
  expect(existsSync(lockDir)).toBe(true);
  expect(readFileSync(join(lockDir, "pid"), "utf8")).toBe("222\n");
});

test("releaseLockDir on an already-vanished path is a no-op, not a throw", () => {
  const home = scratchHome("release-gone");
  const lockDir = join(home, STAGE_ROOT_REL, "bands.lock");
  expect(existsSync(lockDir)).toBe(false);
  expect(() => releaseLockDir(lockDir)).not.toThrow();
});

const TOUCH_CHILD = (home: string, band: number): string => `
import { readBands, touchRow } from ${JSON.stringify(MARKER_SRC)};
const HOME = ${JSON.stringify(home)};
for (let index = 0; index < 24; index += 1) {
  touchRow(HOME, ${band}, new Date(${FROZEN_AT_MS} + index).toISOString());
  if (readBands(HOME).length !== 4) throw new Error("lost a sibling row");
}
console.log("TOUCHED ${band}");
`;

test("concurrent heartbeat writers keep every band and readers never observe a truncated table", async () => {
  const home = scratchHome("touch-many");
  for (let band = 0; band < CONCURRENT_CLAIMERS; band += 1) {
    writeRow(home, row(band));
  }
  const children = await Promise.all(
    Array.from({ length: CONCURRENT_CLAIMERS }, (_unused, band) => {
      const path = join(home, `touch-${band}.ts`);
      writeFileSync(path, TOUCH_CHILD(home, band));
      return spawnNiced("node", [path], { timeoutMs: CASE_BUDGET_MS });
    }),
  );
  for (const child of children) {
    expect(child.code, child.stdout + child.stderr).toBe(0);
  }
  expect(readBands(home).map((entry) => entry.band)).toEqual([0, 1, 2, 3]);
});

test("T4 — one vanished port marks the registered band dead with the operation and preserves its siblings", () => {
  const home = scratchHome("stage-death");
  const live = row(7, { sessions: ["p-stage-owner"] });
  const sibling = row(2);
  writeBands(home, [sibling, live]);
  const both = new Map<number, PortOwner>([
    [live.serverPort, { kind: "pid", pid: 1001 }],
    [live.vitePort, { kind: "pid", pid: 1002 }],
  ]);
  expect(stageBindingAlive(home, 7, both)).toBe(true);
  const unnamed = new Map<number, PortOwner>([
    [live.serverPort, { kind: "unknown" }],
    [live.vitePort, { kind: "unknown" }],
  ]);
  expect(stageBindingAlive(home, 7, unnamed), "a port bound by an owner the OS will not name is still bound").toBe(true);

  // The killed-half plant: server remains, vite is gone. A one-port check would lie green here.
  expect(stageBindingAlive(home, 7, new Map<number, PortOwner>([[live.serverPort, { kind: "pid", pid: 1001 }]]))).toBe(false);
  markStageDead(home, 7, FROZEN_ISO, diskSafeOp(["--goto", "settings"], ""));
  expect(readBands(home).find((entry) => entry.band === 7)?.dead).toEqual({ detectedAt: FROZEN_ISO, op: "--goto settings" });
  expect(readBands(home).find((entry) => entry.band === 2)).toEqual(sibling);
});

// ── the LIVE-USE guard, through the real session registry, census and evidence builder ────────────────

const SWEEP_CHILD = fileURLToPath(new URL("./_stage-sweep-child.ts", import.meta.url));

/** Run the sweep child over a six-hour-idle row on band 0, from a stage-rooted cwd, and read its report. */
async function sweepChild(label: string, mode: SweepChildMode): Promise<SweepChildReport> {
  const home = scratchHome(label);
  const sessionHome = scratchHome(`${label}-sessions`);
  // The cwd is what makes the child's own pid a stage-rooted holder of the band it plants as bound.
  const cwd = join(home, STAGE_ROOT_REL, "sweep-child");
  mkdirSync(cwd, { recursive: true });
  writeRow(home, row(0, { lastUsedAt: AGED_ISO, holders: [] }));
  const child = await spawnNiced("node", [SWEEP_CHILD, home, mode, String(FROZEN_AT_MS)], {
    cwd,
    env: { [SESSION_HOME_KEY]: sessionHome },
    timeoutMs: CASE_BUDGET_MS,
  });
  expect(child.code, child.stdout + child.stderr).toBe(0);
  return JSON.parse(child.stdout) as SweepChildReport;
}

test("A STAGE WITH A LIVE SESSION SURVIVES ITS IDLE TTL — the binding, the registry and the guard, end to end", async () => {
  // The daemon's bind really landed on the row, and the reaper leaves it standing.
  expect(await sweepChild("fence-live", "session-live")).toEqual({ sessions: ["p-live-lane"], verdict: "live" });
});

test("…and the SAME six-hour-idle row is STRANDED the moment that daemon is gone", async () => {
  expect(await sweepChild("fence-dead", "session-dead")).toEqual({ sessions: ["p-live-lane"], verdict: "stranded" });
});

test("a running holder keeps the same six-hour-idle row live with no session bound", async () => {
  expect(await sweepChild("fence-holder", "holder-live")).toEqual({ sessions: [], verdict: "live" });
});

test("unbindSessionFromBand releases the fence without disturbing the row", () => {
  const home = scratchHome("unbind");
  writeRow(home, row(0, { sessions: ["a", "b"], rsyncs: 3 }));
  unbindSessionFromBand(home, 0, "a");
  const after = readBands(home)[0];
  expect(after?.sessions).toEqual(["b"]);
  expect(after?.rsyncs).toBe(3);
  // Idempotent: a close that runs twice must not fail or corrupt the list.
  unbindSessionFromBand(home, 0, "a");
  expect(readBands(home)[0]?.sessions).toEqual(["b"]);
  bindSessionToBand(home, 0, "b", FROZEN_ISO);
  expect(readBands(home)[0]?.sessions).toEqual(["b"]);
});

test("the table lives under the gitignored .cache/ root, so no stage state can be committed", () => {
  expect(BANDS_REL.startsWith(STAGE_ROOT_REL)).toBe(true);
  expect(readFileSync(join(REPO_ROOT, ".gitignore"), "utf8")).toMatch(/^\.cache\/$/m);
});
