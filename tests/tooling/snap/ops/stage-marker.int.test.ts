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
//  • the LIVE-SESSION FENCE is exercised through the REAL registry: a child binds its session name onto a
//    band row and registers a session whose daemon pid IS ALIVE (its own), and the row past its TTL still
//    reads `live`; the same child with a DEAD daemon pid reads `stranded`. That is the binding
//    ops/session-daemon.ts performs, not a hand-written `liveSessions` array;
//  • the legacy `active.json` migrates ONCE and is gone — and a second read does not resurrect it.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REPO_ROOT } from "@orb/tooling/_shared/artifacts";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { vi } from "vitest";
import { stageBandPorts } from "../../../../tooling/src/_shared/ports.ts";
import type { StageBandsFile, StageRow } from "../../../../tooling/src/snap/contract/stage.ts";
import { BANDS_REL, LEGACY_ACTIVE_REL, STAGE_ROOT_REL } from "../../../../tooling/src/snap/lib/stage-plan.ts";
import { stageBindingAlive } from "../../../../tooling/src/snap/ops/stage-census.ts";
import {
  bindSessionToBand,
  clearRow,
  markStageDead,
  readBands,
  releaseLockDir,
  touchRow,
  unbindSessionFromBand,
  writeBands,
  writeRow,
} from "../../../../tooling/src/snap/ops/stage-marker.ts";
import { FROZEN_AT_MS } from "../../../support/clock.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

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
  readonly env?: Readonly<Record<string, string>>;
  readonly args?: readonly string[];
}): Promise<{ readonly stdout: string; readonly code: number | null }> {
  const path = join(child.home, `${child.name}.ts`);
  writeFileSync(path, child.body);
  const res = await spawnNiced("node", [path, ...(child.args ?? [])], { env: child.env ?? {}, timeoutMs: CASE_BUDGET_MS });
  return { stdout: `${res.stdout}${res.stderr}`, code: res.code };
}

const MARKER_SRC = join(REPO_ROOT, "tooling/src/snap/ops/stage-marker.ts");
const BANDS_SRC = join(REPO_ROOT, "tooling/src/snap/lib/stage-bands.ts");
const PORTS_SRC = join(REPO_ROOT, "tooling/src/_shared/ports.ts");
const REGISTRY_SRC = join(REPO_ROOT, "tooling/src/snap/ops/session-registry.ts");

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
  const both = new Map([
    [live.serverPort, 1001],
    [live.vitePort, 1002],
  ]);
  expect(stageBindingAlive(home, 7, both)).toBe(true);

  // The killed-half plant: server remains, vite is gone. A one-port check would lie green here.
  expect(stageBindingAlive(home, 7, new Map([[live.serverPort, 1001]]))).toBe(false);
  markStageDead(home, 7, FROZEN_ISO, "--goto settings");
  expect(readBands(home).find((entry) => entry.band === 7)?.dead).toEqual({ detectedAt: FROZEN_ISO, op: "--goto settings" });
  expect(readBands(home).find((entry) => entry.band === 2)).toEqual(sibling);
});

// ── the LIVE-SESSION fence, through the real session registry ─────────────────────────────────────────

const FENCE_CHILD = (home: string, sessionHome: string, alive: boolean): string => `
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { bindSessionToBand, readBands, writeRow } from ${JSON.stringify(MARKER_SRC)};
import { stageSweepVerdict } from ${JSON.stringify(BANDS_SRC)};
import { liveSessionNames } from ${JSON.stringify(REGISTRY_SRC)};

const HOME = ${JSON.stringify(home)};
const NAME = "p-live-lane";
const FROZEN = ${FROZEN_AT_MS};
// The daemon's own call: bind the session name onto the band row it drives. Binding is itself an
// interaction, so it stamps the heartbeat — which would hide the very thing this arm measures. Re-age the
// row afterwards so the ONLY thing that can save it is the session ref.
bindSessionToBand(HOME, 0, NAME, new Date(FROZEN).toISOString());
const bound = readBands(HOME).find((r) => r.band === 0);
writeRow(HOME, { ...bound, lastUsedAt: new Date(FROZEN - 6 * 60 * 60 * 1000).toISOString() });
// …and the registry row a live daemon would have written. A pid of 1 is alive but not ours; ${alive ? "this child's own pid IS the daemon" : "a pid nothing owns is DEAD"}.
const daemonPid = ${alive ? "process.pid" : "2147483646"};
writeFileSync(join(${JSON.stringify(sessionHome)}, NAME + ".json"), JSON.stringify({
  v: 1, name: NAME, ownerCheckout: "/repo", daemonPid, pgid: daemonPid, socket: "/tmp/x.sock",
  cdpEndpoint: null, slotDir: "/tmp/slot", binding: { kind: "stage", url: "http://localhost:5273" },
  environment: {
    viewport: { width: 1280, height: 720 },
    device: null,
    colorScheme: null,
    reducedMotion: false,
    contrast: null,
    reducedTransparency: false,
    deviceScaleFactor: null,
  },
  bootArgv: [], createdAt: new Date(FROZEN).toISOString(), lastUsedAt: new Date(FROZEN).toISOString(),
  inflightOp: null, lastOp: null, ttlMs: 1800000, headless: true, calls: 0,
}));

const row = readBands(HOME).find((r) => r.band === 0);
const live = liveSessionNames("/repo");
const verdict = stageSweepVerdict({
  row,
  bandBound: true,
  bandIsStageRooted: true,
  bandProcessAgeSeconds: null,
  liveSessions: row.sessions.filter((n) => live.has(n)),
  nowMs: FROZEN,
}, 60 * 60 * 1000);
console.log("BOUND " + row.sessions.join(","));
console.log("VERDICT " + verdict);
`;

test("A STAGE WITH A LIVE SESSION SURVIVES ITS IDLE TTL — the binding, the registry and the fence, end to end", async () => {
  const home = scratchHome("fence-live");
  const sessionHome = scratchHome("fence-live-sessions");
  // The row is SIX HOURS idle: nothing but the session ref can save it.
  writeRow(home, row(0, { lastUsedAt: AGED_ISO }));
  const child = await runChild({ home, name: "fence", body: FENCE_CHILD(home, sessionHome, true), env: { [SESSION_HOME_KEY]: sessionHome } });
  expect(child.code, child.stdout).toBe(0);
  // The daemon's bind really landed on the row…
  expect(child.stdout).toContain("BOUND p-live-lane");
  // …and the reaper leaves it standing. A reaper that eats a live stage is worse than no reaper.
  expect(child.stdout).toContain("VERDICT live");
});

test("…and the SAME six-hour-idle row is STRANDED the moment that daemon is gone", async () => {
  const home = scratchHome("fence-dead");
  const sessionHome = scratchHome("fence-dead-sessions");
  writeRow(home, row(0, { lastUsedAt: AGED_ISO }));
  const child = await runChild({ home, name: "fence", body: FENCE_CHILD(home, sessionHome, false), env: { [SESSION_HOME_KEY]: sessionHome } });
  expect(child.code, child.stdout).toBe(0);
  expect(child.stdout).toContain("BOUND p-live-lane");
  expect(child.stdout).toContain("VERDICT stranded");
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
