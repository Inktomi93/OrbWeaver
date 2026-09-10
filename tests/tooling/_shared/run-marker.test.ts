// THE ORPHANED-BROWSER PIN (#1848). A stage child is reaped by its PROCESS GROUP, and Playwright starts
// every browser in its own session — so on 2026-09-06 a timed-out `tests:node` stage left 72
// `chrome-headless-shell` processes alive (some 40 h old, re-parented to the chrome roots themselves) plus
// a CT vite server still holding :3100. Owner: "orphaned chromiums are not acceptable."
//
// THE LOAD-BEARING ARM IS THE LAST ONE: a real child that spawns a DETACHED grandchild (its own session,
// exactly like a browser), a real timeout, and the assertion that the grandchild is GONE. It fails against
// the pre-#1848 proc.ts — the group kill cannot reach a process that left the group — which is what makes
// it a defect proof rather than a description of the fix. Every unit arm above it pins a decision the
// integration arm cannot isolate: what is EXCLUDED (this process and its ancestors — a nested `test:ct`
// inside `pnpm test` inherits the marker and must never sweep its own parents), what escalates (TERM, a
// grace, then KILL), and which foreign runs are fair game (only those whose OWNER PID is gone).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { budget } from "@orb/tooling/_shared/load-budget";
import { spawnNicedTranscript } from "@orb/tooling/_shared/proc";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import type { RunMarkerDeps } from "@orb/tooling/_shared/run-marker";
import {
  describeRunMarkerSweep,
  markedPids,
  mintRunMarker,
  processRunMarker,
  RUN_MARKER_ENV,
  runMarkerArg,
  runMarkerEnv,
  runMarkerOwnerPid,
  sweepAbandonedRunMarkers,
  sweepRunMarker,
} from "@orb/tooling/_shared/run-marker";
import { expect, test } from "../../support/tool-fixtures.ts";

/** The planted child's ceiling. A DELIBERATE short kill: the timeout path IS the subject, so this is the
 *  smallest wall clock that still lets the child spawn its grandchild first. Derived, never a literal. */
const PLANTED_TIMEOUT_BASE_MS = 4000;
/** The whole probe: spawn + the short ceiling + the sweep's own TERM→KILL grace + reaping slack. */
const PROBE_BUDGET_BASE_MS = 60_000;
const SETTLE_BASE_MS = 250;

function fakeTree(
  rows: ReadonlyMap<number, { readonly marker: string | null; readonly parent: number }>,
  self: number,
): RunMarkerDeps & { readonly signalled: [number, NodeJS.Signals][] } {
  const signalled: [number, NodeJS.Signals][] = [];
  const dead = new Set<number>();
  return {
    signalled,
    selfPid: self,
    listPids: (): readonly number[] => [...rows.keys()],
    markerOf: (pid): string | null => rows.get(pid)?.marker ?? null,
    parentOf: (pid): number | null => rows.get(pid)?.parent ?? null,
    alive: (pid): boolean => rows.has(pid) && !dead.has(pid),
    signal: (pid, signal): void => {
      signalled.push([pid, signal]);
    },
    sleep: (): Promise<void> => Promise.resolve(),
  };
}

test("a marker names the run that minted it, and only a well-formed one is ever recognised", () => {
  const marker = mintRunMarker(4242, 1_700_000_000_000);
  expect(runMarkerOwnerPid(marker)).toBe(4242);
  expect(runMarkerEnv(marker)).toEqual({ [RUN_MARKER_ENV]: marker });
  // A hand-set variable is NOT a marker: nothing a human could type may authorize a kill.
  expect(runMarkerOwnerPid("mine")).toBeNull();
  expect(runMarkerOwnerPid("123-456-shrt")).toBeNull();
});

test("a CHROMIUM is found through its cmdline, because it erases its own environ", () => {
  const marker = mintRunMarker(4242, 1_700_000_000_000);
  // Measured 2026-09-06: a chromium's /proc/<pid>/environ comes back EMPTY (it rewrites that area for its
  // process title) and its /proc/<pid>/cmdline is ONE NUL-terminated field holding every switch. Both
  // shapes are reproduced here, because both are why an environ-only, split-on-NUL reader found nothing.
  const chromium = (path: string): Buffer =>
    Buffer.from(path.endsWith("environ") ? "" : `/opt/chrome-headless-shell --headless --no-sandbox ${runMarkerArg(marker)} --user-data-dir=/tmp/x\0`, "utf8");
  expect(processRunMarker(1, chromium)).toBe(marker);
  // …and an ordinary child is still found through the environment, which is the primary channel.
  const nodeChild = (path: string): Buffer =>
    Buffer.from(path.endsWith("environ") ? `PATH=/usr/bin\0${RUN_MARKER_ENV}=${marker}\0HOME=/root\0` : "node\0", "utf8");
  expect(processRunMarker(2, nodeChild)).toBe(marker);
  // A process carrying somebody else's marker is not ours, and an unmarked one answers null.
  expect(processRunMarker(3, () => Buffer.from(`${RUN_MARKER_ENV}=nonsense\0`, "utf8"))).toBeNull();
  expect(processRunMarker(4, () => Buffer.from("PATH=/usr/bin\0", "utf8"))).toBeNull();
});

test("the sweep NEVER signals this process or its ancestors, whatever marker they carry", async () => {
  const marker = mintRunMarker(900, 1_700_000_000_000);
  // 900 (the runner) → 901 (pnpm) → 902 (THIS process): the whole chain carries the marker, as it does
  // when `test:ct` runs inside `pnpm test`. 950 is the escaped browser; 960 belongs to a sibling lane.
  const deps = fakeTree(
    new Map([
      [900, { marker, parent: 1 }],
      [901, { marker, parent: 900 }],
      [902, { marker, parent: 901 }],
      [950, { marker, parent: 1 }],
      [960, { marker: mintRunMarker(700, 1_700_000_000_001), parent: 1 }],
    ]),
    902,
  );
  expect(markedPids(marker, deps)).toEqual([950]);
  const sweep = await sweepRunMarker(marker, deps);
  expect(deps.signalled).toEqual([
    [950, "SIGTERM"],
    [950, "SIGKILL"],
  ]);
  expect(sweep.killed).toEqual([950]);
  expect(describeRunMarkerSweep(sweep)).toContain("swept 1 process(es)");
});

test("a survivor of the grace is escalated to SIGKILL; a clean exit is not", async () => {
  const marker = mintRunMarker(800, 1_700_000_000_000);
  const rows = new Map([
    [810, { marker, parent: 1 }],
    [811, { marker, parent: 1 }],
  ]);
  const deps = fakeTree(rows, 1);
  // 810 leaves on TERM, 811 does not — only 811 may be killed.
  const base = deps.alive ?? ((): boolean => true);
  const withExit: RunMarkerDeps = { ...deps, alive: (pid): boolean => pid !== 810 && base(pid) };
  const sweep = await sweepRunMarker(marker, withExit);
  expect(sweep.terminated).toEqual([810, 811]);
  expect(sweep.killed).toEqual([811]);
  expect(deps.signalled).toEqual([
    [810, "SIGTERM"],
    [811, "SIGTERM"],
    [811, "SIGKILL"],
  ]);
});

test("the abandoned sweep reaps a DEAD run's processes and leaves a LIVE sibling's alone", async () => {
  const deadOwnerMarker = mintRunMarker(600, 1_700_000_000_000);
  const liveOwnerMarker = mintRunMarker(700, 1_700_000_000_001);
  const rows = new Map([
    [700, { marker: liveOwnerMarker, parent: 1 }],
    [701, { marker: liveOwnerMarker, parent: 700 }],
    [601, { marker: deadOwnerMarker, parent: 1 }],
  ]);
  const deps = fakeTree(rows, 1);
  const sweeps = await sweepAbandonedRunMarkers(deps);
  expect(sweeps.map((sweep) => sweep.marker)).toEqual([deadOwnerMarker]);
  expect(deps.signalled).toEqual([
    [601, "SIGTERM"],
    [601, "SIGKILL"],
  ]);
});

test("a TIMED-OUT stage child leaves NO detached grandchild alive", { timeout: budget(PROBE_BUDGET_BASE_MS) }, async ({ scratch }) => {
  const marker = mintRunMarker();
  const pidFile = join(scratch, "grandchild.pid");
  // `setsid` is what a Playwright browser does to itself: the grandchild gets its OWN session and process
  // group, so the stage's group kill cannot reach it. It records its pid, then sleeps far past the ceiling.
  // ITS STDIO GOES TO /dev/null DELIBERATELY: a grandchild holding the transcript pipe would make the OLD
  // code fail as a 60s HANG instead of as a survivor, and this pin must fail on the thing it names.
  const script = `setsid bash -c 'echo $$ > ${pidFile}; exec sleep 600' > /dev/null 2>&1 & sleep 600`;
  const result = await spawnNicedTranscript("bash", ["-c", script], {
    cwd: scratch,
    env: inheritedProcessEnv(runMarkerEnv(marker)),
    timeoutMs: budget(PLANTED_TIMEOUT_BASE_MS),
    runMarker: marker,
  });
  const planted = existsSync(pidFile) ? Number(readFileSync(pidFile, "utf8").trim()) : null;
  try {
    expect(result.transcript).toContain("[proc] TIMED OUT");
    expect(planted, "the probe's detached grandchild never recorded its pid — the fixture, not the sweep, is broken").not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, budget(SETTLE_BASE_MS)));
    // THE DEFECT ASSERTION, first: a process that left the group must be gone anyway. Against the
    // pre-#1848 proc.ts this is the line that fails, naming the surviving pid.
    expect(pidIsAlive(planted), `pid ${String(planted)} survived a timed-out stage — an orphaned browser is exactly this`).toBe(false);
    // …and the teardown SAYS what it reaped, so an operator reading only the transcript learns it happened.
    expect(result.transcript).toContain("[run-marker] swept");
  } finally {
    if (planted !== null && pidIsAlive(planted)) {
      process.kill(planted, "SIGKILL");
    }
  }
});

function pidIsAlive(pid: number | null): boolean {
  if (pid === null) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
