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
import { createInterface } from "node:readline";
import { expect, test } from "@orb/testkit/tooling";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { completionProcesses, processCompletion } from "@orb/tooling/floor/host/platform";
import { spawnFullPriorityChild, spawnNicedTranscript } from "@orb/tooling/floor/process/proc";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import type { RunMarkerDeps } from "@orb/tooling/floor/process/run-marker";
import {
  describeRunMarkerSweep,
  joinRunMarkerSweep,
  markedPids,
  mintRunMarker,
  processRunIdentities,
  RUN_LEASE_ENV,
  RUN_MARKER_ENV,
  runLeaseArg,
  runMarkerArg,
  runMarkerEnv,
  runMarkerOwnerPid,
  runMarkerTranscriptTeardown,
  sweepAbandonedRunMarkers,
  sweepRunMarker,
  sweepRunMarkerNow,
} from "@orb/tooling/floor/process/run-marker";

/** The planted child's ceiling. A DELIBERATE short kill: the timeout path IS the subject, so this is the
 *  smallest wall clock that still lets the child spawn its grandchild first. Derived, never a literal. */
const PLANTED_TIMEOUT_BASE_MS = 4000;
/** The whole probe: spawn + the short ceiling + the sweep's own TERM→KILL grace + reaping slack. */
const PROBE_BUDGET_BASE_MS = 60_000;
/** Pipelines in the cascade probe: each holds a `sleep` and a `cat`, and the sweep's TERM to the first ends the second. */
const PIPELINE_CHILDREN = 6;

test("strong sweep waits for observed exit after signalling", async () => {
  const marker = mintRunMarker(800, 1_700_000_000_000);
  const base = fakeTree(new Map([[810, { marker, parent: 1 }]]), 1);
  const release = Promise.withResolvers<void>();
  const reached = Promise.withResolvers<void>();
  let exited = false;
  let joined = false;
  let sleeps = 0;
  const completion = joinRunMarkerSweep(marker, {
    ...base,
    completionOf: () => (exited ? { kind: "gone" } : { kind: "live", identity: "original" }),
    sleep: async () => {
      if (++sleeps > 1) {
        reached.resolve();
        await release.promise;
      }
    },
  }).then(() => {
    joined = true;
  });
  await reached.promise;
  expect(base.signalled).toEqual([
    [810, "SIGTERM"],
    [810, "SIGKILL"],
  ]);
  expect(joined).toBe(false);
  exited = true;
  release.resolve();
  await completion;
  expect(joined).toBe(true);
});

test("strong sweep never signals a PID replacement during grace or a stale first target", async () => {
  const marker = mintRunMarker(800, 1_700_000_000_000);
  const rows = new Map([[810, { marker, parent: 1 }]]);
  const base = fakeTree(rows, 1);
  let replaced = false;
  await joinRunMarkerSweep(marker, {
    ...base,
    completionOf: () => ({ kind: "live", identity: replaced ? "replacement" : "original" }),
    sleep: (): Promise<void> => {
      replaced = true;
      rows.set(810, { marker: mintRunMarker(900, 1_700_000_000_001), parent: 1 });
      return Promise.resolve();
    },
  });
  expect(base.signalled).toEqual([[810, "SIGTERM"]]);
  let scans = 0;
  const stale = fakeTree(new Map([[811, { marker, parent: 1 }]]), 1);
  await expect(
    joinRunMarkerSweep(marker, {
      ...stale,
      identitiesOf: () => (++scans === 1 ? [marker] : []),
      completionOf: () => ({ kind: "live", identity: "foreign" }),
    }),
  ).rejects.toThrow("ownership unavailable");
  expect(stale.signalled).toEqual([]);
});

test("strong sweep refuses unknown identity without signalling and bounded unknown or live completion", async () => {
  const marker = mintRunMarker(800, 1_700_000_000_000);
  const base = fakeTree(new Map([[810, { marker, parent: 1 }]]), 1);
  await expect(joinRunMarkerSweep(marker, { ...base, completionOf: () => ({ kind: "unknown" }) })).rejects.toThrow("identity unavailable");
  expect(base.signalled).toEqual([]);
  await expect(joinRunMarkerSweep(marker, { ...base, completionOf: () => ({ kind: "live", identity: "original" }) })).rejects.toThrow(
    "completion not established",
  );
  let unknown = false;
  await expect(
    joinRunMarkerSweep(marker, {
      ...base,
      completionOf: () => (unknown ? { kind: "unknown" } : { kind: "live", identity: "original" }),
      signal: (_pid, kind) => {
        if (kind === "SIGKILL") {
          unknown = true;
        }
      },
    }),
  ).rejects.toThrow("completion not established");
});

test("strong sweep accepts a zombie but refuses a newly owned survivor and an unreadable final table", async () => {
  const marker = mintRunMarker(800, 1_700_000_000_000);
  const base = fakeTree(new Map([[810, { marker, parent: 1 }]]), 1);
  await joinRunMarkerSweep(marker, { ...base, completionOf: () => ({ kind: "zombie", identity: "original" }) });
  const rows = new Map([[810, { marker, parent: 1 }]]);
  let exited = false;
  await expect(
    joinRunMarkerSweep(marker, {
      ...fakeTree(rows, 1),
      completionOf: (pid) => (exited && pid === 810 ? { kind: "gone" } : { kind: "live", identity: String(pid) }),
      alive: () => !exited,
      sleep: (): Promise<void> => {
        exited = true;
        rows.set(811, { marker, parent: 1 });
        return Promise.resolve();
      },
    }),
  ).rejects.toThrow("owned process completion not established");
  let scans = 0;
  await expect(
    joinRunMarkerSweep(marker, {
      processTable: () => {
        if (++scans === 1) {
          return [];
        }
        throw new Error("unreadable final table");
      },
    }),
  ).rejects.toThrow("unreadable final table");
});

// The weak door: the timeout teardown that surface-walk and the corpus scripts hand to the transcript runner.
test("the timeout teardown never KILLs a pid that was replaced during the grace", async () => {
  const marker = mintRunMarker(800, 1_700_000_000_000);
  const base = fakeTree(new Map([[810, { marker, parent: 1 }]]), 1);
  let replaced = false;
  const line = await runMarkerTranscriptTeardown(marker, {
    ...base,
    completionOf: () => ({ kind: "live", identity: replaced ? "replacement" : "original" }),
    sleep: (): Promise<void> => {
      replaced = true;
      return Promise.resolve();
    },
  }).afterTimeoutKill();
  expect(base.signalled).toEqual([[810, "SIGTERM"]]);
  expect(line, "the receipt names only what was signalled").not.toContain("SIGKILL");
});

test("the timeout teardown still KILLs a survivor of the same incarnation, and refuses an unreadable identity", async () => {
  const marker = mintRunMarker(800, 1_700_000_000_000);
  const survivor = fakeTree(new Map([[810, { marker, parent: 1 }]]), 1);
  const line = await runMarkerTranscriptTeardown(marker, { ...survivor, completionOf: () => ({ kind: "live", identity: "original" }) }).afterTimeoutKill();
  expect(survivor.signalled).toEqual([
    [810, "SIGTERM"],
    [810, "SIGKILL"],
  ]);
  expect(line).toContain("SIGKILL 810");
  const unreadable = fakeTree(new Map([[810, { marker, parent: 1 }]]), 1);
  await expect(runMarkerTranscriptTeardown(marker, { ...unreadable, completionOf: () => ({ kind: "unknown" }) }).afterTimeoutKill()).rejects.toThrow(
    "identity unavailable",
  );
  expect(unreadable.signalled).toEqual([]);
});

// A marked process that exits on its own, or because the sweep's TERM ended its pipe partner, leaves the table
// between the guard's first sight of it and the re-selection. That is a normal outcome, never a custody failure.
for (const door of ["timeout teardown", "strong sweep"] as const) {
  test(`the ${door} skips a marked pid that exits before its signal and still reaches the rest`, async () => {
    const marker = mintRunMarker(800, 1_700_000_000_000);
    const rows = new Map([
      [810, { marker, parent: 1 }],
      [811, { marker, parent: 1 }],
    ]);
    const base = fakeTree(rows, 1);
    let scans = 0;
    const deps: RunMarkerDeps = {
      ...base,
      listPids: (): readonly number[] => {
        scans += 1;
        if (scans === 2) {
          rows.delete(810);
        }
        return [...rows.keys()];
      },
      completionOf: (pid) => (rows.has(pid) ? { kind: "live", identity: `start-${String(pid)}` } : { kind: "gone" }),
      signal: (pid, kind): void => {
        base.signalled.push([pid, kind]);
        if (kind === "SIGKILL") {
          rows.delete(pid);
        }
      },
    };
    const sweep = door === "strong sweep" ? await joinRunMarkerSweep(marker, deps) : await runMarkerTranscriptTeardown(marker, deps).afterTimeoutKill();
    expect(base.signalled).toEqual([
      [811, "SIGTERM"],
      [811, "SIGKILL"],
    ]);
    expect(sweep, "a clean sweep verdict").not.toBeNull();
  });
}

// The reviewer's repro on real processes: nothing exits by itself, and the sweep's TERM to `sleep` ends its `cat`.
test("a sweep over pipelines whose members exit from its own TERM completes", async () => {
  const marker = mintRunMarker();
  const children = Array.from({ length: PIPELINE_CHILDREN }, () =>
    spawnFullPriorityChild("sh", ["-c", "sleep 30 | cat"], { env: inheritedProcessEnv(runMarkerEnv(marker)), stdio: "ignore" }),
  );
  const exits = children.map((child) => child.wait());
  try {
    await expect.poll(() => markedPids(marker).length, { timeout: budget(PROBE_BUDGET_BASE_MS), interval: 20 }).toBeGreaterThanOrEqual(PIPELINE_CHILDREN * 2);
    const sweep = await sweepRunMarker(marker, { sleep: () => new Promise((resolve) => setTimeout(resolve, 10)) });
    expect(sweep.terminated.length).toBeGreaterThan(0);
    await expect.poll(() => markedPids(marker), { timeout: budget(PROBE_BUDGET_BASE_MS), interval: 20 }).toEqual([]);
  } finally {
    sweepRunMarkerNow(marker);
    for (const child of children) {
      child.kill("SIGKILL");
    }
    await Promise.all(exits);
  }
});

test("a darwin ps that exits 0 with no process table is no verdict, so the strong sweep rejects instead of resolving clean", async () => {
  const marker = mintRunMarker();
  const processTable = (): ReturnType<typeof completionProcesses> =>
    completionProcesses({ platform: "darwin", run: () => ({ status: 0, stdout: "", stderr: "" }) });
  await expect(joinRunMarkerSweep(marker, { processTable })).rejects.toThrow("table unreadable");
});

// The identity read is per platform; these drive the real reader with the tool output each OS documents.
// Never captured from a macOS or Windows host here.
const cimRow = (identity: string): string => `[{"pid":810,"identity":"${identity}"}]`;
const IDENTITY_READS = [
  { platform: "darwin", before: "Ss   Thu Nov  6 14:03:22 2026\n", after: "Ss   Thu Nov  6 14:09:41 2026\n" },
  { platform: "win32", before: cimRow("639000000000000001"), after: cimRow("639000000000000002") },
] as const;

for (const { platform, before, after } of IDENTITY_READS) {
  for (const replaced of [true, false]) {
    test(`on ${platform} the timeout teardown ${replaced ? "never KILLs a replaced pid" : "still KILLs the same incarnation"}`, async () => {
      const marker = mintRunMarker(800, 1_700_000_000_000);
      const base = fakeTree(new Map([[810, { marker, parent: 1 }]]), 1);
      let graced = false;
      await runMarkerTranscriptTeardown(marker, {
        ...base,
        completionOf: (pid) => processCompletion(pid, { platform, run: () => ({ status: 0, stdout: graced && replaced ? after : before, stderr: "" }) }),
        sleep: (): Promise<void> => {
          graced = true;
          return Promise.resolve();
        },
      }).afterTimeoutKill();
      expect(base.signalled).toEqual(
        replaced
          ? [[810, "SIGTERM"]]
          : [
              [810, "SIGTERM"],
              [810, "SIGKILL"],
            ],
      );
    });
  }
}

test("the abandoned sweep never KILLs a pid replaced during the grace", async () => {
  const dead = mintRunMarker(600, 1_700_000_000_000);
  const base = fakeTree(new Map([[601, { marker: dead, parent: 1 }]]), 1);
  let replaced = false;
  await sweepAbandonedRunMarkers({
    ...base,
    alive: (pid) => pid !== 600,
    completionOf: () => ({ kind: "live", identity: replaced ? "replacement" : "original" }),
    sleep: (): Promise<void> => {
      replaced = true;
      return Promise.resolve();
    },
  });
  expect(base.signalled).toEqual([[601, "SIGTERM"]]);
});

function fakeTree(
  rows: ReadonlyMap<number, { readonly marker: string | null; readonly lease?: string; readonly parent: number }>,
  self: number,
): RunMarkerDeps & { readonly signalled: [number, NodeJS.Signals][] } {
  const signalled: [number, NodeJS.Signals][] = [];
  const dead = new Set<number>();
  return {
    signalled,
    selfPid: self,
    listPids: (): readonly number[] => [...rows.keys()],
    identitiesOf: (pid): readonly string[] => [rows.get(pid)?.marker ?? null, rows.get(pid)?.lease ?? null].filter((v): v is string => v !== null),
    parentOf: (pid): number | null => rows.get(pid)?.parent ?? null,
    alive: (pid): boolean => rows.has(pid) && !dead.has(pid),
    completionOf: (pid) => (rows.has(pid) && !dead.has(pid) ? { kind: "live", identity: `start-${String(pid)}` } : { kind: "gone" }),
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
  const chromium = { environ: "", cmdline: `/opt/chrome-headless-shell --headless --no-sandbox ${runMarkerArg(marker)} --user-data-dir=/tmp/x` };
  expect(processRunIdentities(chromium)).toEqual([marker]);
  // …and an ordinary child is still found through the environment, which is the primary channel.
  const nodeChild = { environ: `PATH=/usr/bin ${RUN_MARKER_ENV}=${marker} HOME=/root`, cmdline: "node" };
  expect(processRunIdentities(nodeChild)).toEqual([marker]);
  // A process carrying somebody else's marker is not ours, and an unmarked one answers nothing; a platform
  // with no readable environment (win32) answers through the command line alone.
  expect(processRunIdentities({ environ: `${RUN_MARKER_ENV}=nonsense`, cmdline: "node" })).toEqual([]);
  expect(processRunIdentities({ environ: "PATH=/usr/bin", cmdline: "node" })).toEqual([]);
  expect(processRunIdentities({ environ: null, cmdline: `node ${runMarkerArg(marker)}` })).toEqual([marker]);
});

test("BOTH identities are read, in both channels — a leased browser answers with its run AND its lease (#2504)", () => {
  const marker = mintRunMarker(4242, 1_700_000_000_000);
  const lease = mintRunMarker(4343, 1_700_000_000_001);
  // The production shape: a chromium stamped with both switches, environ erased by its own title rewrite.
  const leasedChromium = { environ: "", cmdline: `/opt/chrome-headless-shell --headless ${runMarkerArg(marker)} ${runLeaseArg(lease)}` };
  expect(processRunIdentities(leasedChromium)).toEqual([marker, lease]);
  // …and an ordinary child, where both ride the environment.
  const leasedChild = { environ: `${RUN_MARKER_ENV}=${marker} ${RUN_LEASE_ENV}=${lease}`, cmdline: "node" };
  expect(processRunIdentities(leasedChild)).toEqual([marker, lease]);
  // A LEASE ALONE is a complete identity: the CT vite server started before any marker existed still answers.
  expect(processRunIdentities({ environ: `${RUN_LEASE_ENV}=${lease}`, cmdline: "node" })).toEqual([lease]);
  // A hand-typed lease authorizes nothing, exactly as a hand-typed marker does not.
  expect(processRunIdentities({ environ: `${RUN_LEASE_ENV}=mine`, cmdline: "node" })).toEqual([]);
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

// ── #2504: the two stamps, and which one a teardown is allowed to sweep ─────────────────────────────
// `tests:tooling` under a marker died at 11 files with exit 137 and NO summary; the same command unmarked
// published 556. The killer was a REPARENTED launcher (a snap session daemon, whose ancestor chain is just
// itself, so `selfAndAncestors` excluded nothing) sweeping the marker it had INHERITED — every sibling
// vitest worker and the top-level pnpm carried that exact value. Both arms below plant the same tree; the
// only variable is which identity the sweep is handed.
const OUTER = mintRunMarker(100, 1_700_000_000_000);
const LEASE = mintRunMarker(300, 1_700_000_000_001);
/** pnpm(100) → vitest(101) → a worker(102), all carrying the outer marker; 300 is the reparented daemon
 *  (parent 1) and 301 its browser, both carrying the outer marker AND the daemon's lease. */
function batteryUnderADaemon(): ReturnType<typeof fakeTree> {
  return fakeTree(
    new Map([
      [100, { marker: OUTER, parent: 1 }],
      [101, { marker: OUTER, parent: 100 }],
      [102, { marker: OUTER, parent: 101 }],
      [300, { marker: OUTER, lease: LEASE, parent: 1 }],
      [301, { marker: OUTER, lease: LEASE, parent: 1 }],
    ]),
    300,
  );
}

test("the INHERITED marker reaches the whole battery — the planted control for the sweep that killed it (#2504)", () => {
  // THE POSITIVE CONTROL, in the same file as the fix: from the reparented daemon, the outer marker names
  // pnpm, vitest and the worker as well as the browser. A narrowed sweep proves nothing unless the wide one
  // is shown to have been wide, and this is the exact set that took exit 137.
  expect(markedPids(OUTER, batteryUnderADaemon())).toEqual([100, 101, 102, 301]);
});

test("a teardown sweeps the LEASE IT MINTED and leaves the run that contains it standing (#2504)", () => {
  const deps = batteryUnderADaemon();
  // The daemon's own shutdown subject: only what IT started. pnpm, vitest and the worker are untouched.
  expect(markedPids(LEASE, deps)).toEqual([301]);
  const sweep = sweepRunMarkerNow(LEASE, deps);
  expect(sweep.killed).toEqual([301]);
  expect(deps.signalled).toEqual([[301, "SIGKILL"]]);
});

test("#1848 IS PRESERVED: the outer run's own kill path still reaches a leased browser (#2504)", () => {
  // The browser carries BOTH stamps, so the run that contains the daemon loses nothing by the narrowing —
  // asked from the outer runner (pid 101, whose ancestors are pnpm and init), pid 301 is still in range.
  const deps = fakeTree(
    new Map([
      [100, { marker: OUTER, parent: 1 }],
      [101, { marker: OUTER, parent: 100 }],
      [301, { marker: OUTER, lease: LEASE, parent: 1 }],
    ]),
    101,
  );
  expect(markedPids(OUTER, deps)).toEqual([301]);
});

test("the abandoned sweep reaps a DEAD LEASE owner's browser while its outer run is still alive (#2504)", async () => {
  // THE STRENGTHENING the second channel buys. A SIGKILLed daemon inside a live battery used to leave a
  // browser no sweep could justify: its marker's owner (the battery) answers, so the abandoned arm passes
  // it over. Its LEASE's owner is the daemon, and the daemon is gone — which is a complete proof on its own.
  const liveOuter = mintRunMarker(100, 1_700_000_000_000);
  const deadDaemonLease = mintRunMarker(999_999, 1_700_000_000_001);
  const deps = fakeTree(
    new Map([
      [100, { marker: liveOuter, parent: 1 }],
      [301, { marker: liveOuter, lease: deadDaemonLease, parent: 1 }],
    ]),
    1,
  );
  const sweeps = await sweepAbandonedRunMarkers(deps);
  expect(sweeps.map((sweep) => sweep.marker)).toEqual([deadDaemonLease]);
  expect(deps.signalled).toEqual([
    [301, "SIGTERM"],
    [301, "SIGKILL"],
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
    teardown: runMarkerTranscriptTeardown(marker),
  });
  const planted = existsSync(pidFile) ? Number(readFileSync(pidFile, "utf8").trim()) : null;
  try {
    expect(result.transcript).toContain("[proc] TIMED OUT");
    expect(planted, "the probe's detached grandchild never recorded its pid — the fixture, not the sweep, is broken").not.toBeNull();
    await joinRunMarkerSweep(marker);
    // THE DEFECT ASSERTION, first: a process that left the group must be gone anyway. Against the
    // pre-#1848 proc.ts this is the line that fails, naming the surviving pid.
    expect(pidIsAlive(planted), `pid ${String(planted)} survived a timed-out stage — an orphaned browser is exactly this`).toBe(false);
    // …and the teardown SAYS what it reaped, so an operator reading only the transcript learns it happened.
    expect(result.transcript).toContain("[run-marker] swept");
  } finally {
    await joinRunMarkerSweep(marker);
  }
});

// A same-user process pair this user cannot read: PR_SET_DUMPABLE 0 makes the kernel refuse both environs, and the
// fork keeps the flag. The parent prints the child's pid once both exist; neither carries a run marker.
const UNREADABLE_PAIR = `import ctypes, os, signal, sys
PR_SET_DUMPABLE = 4
if ctypes.CDLL(None, use_errno=True).prctl(PR_SET_DUMPABLE, 0, 0, 0, 0) != 0:
    sys.exit(ctypes.get_errno())
child = os.fork()
if child == 0:
    signal.pause()
    os._exit(0)
print(child, flush=True)
signal.pause()
`;

test.skipIf(process.platform !== "linux")(
  "a sweep skips another program's unreadable processes and still reaps its own",
  { timeout: budget(PROBE_BUDGET_BASE_MS) },
  async () => {
    const marker = mintRunMarker();
    const planted = spawnFullPriorityChild("python3", ["-c", UNREADABLE_PAIR], { env: inheritedProcessEnv(), detached: true, stdio: "pipe-stdout" });
    const owned = spawnFullPriorityChild("sleep", ["600"], { env: inheritedProcessEnv(runMarkerEnv(marker)), stdio: "ignore" });
    // Joined from the spawn on, because the sweep ends `owned` before the cleanup below asks for its exit.
    const exits = [planted.wait(), owned.wait()];
    try {
      if (planted.stdout === null) {
        throw new Error("the planted pair has no stdout pipe");
      }
      let unreadable = Number.NaN;
      for await (const line of createInterface({ input: planted.stdout })) {
        unreadable = Number(line);
        break;
      }
      // The control: the planted child really is unreadable to this user, so the sweep below meets one.
      expect(() => readFileSync(`/proc/${String(unreadable)}/environ`)).toThrow(/EACCES/u);
      const sweep = await joinRunMarkerSweep(marker);
      expect(sweep.terminated).toEqual([owned.pid]);
      expect(pidIsAlive(owned.pid ?? null)).toBe(false);
      expect(pidIsAlive(unreadable)).toBe(true);
    } finally {
      planted.killGroup("SIGKILL");
      owned.kill("SIGKILL");
      await Promise.all(exits);
    }
  },
);

function pidIsAlive(pid: number | null): boolean {
  if (pid === null) {
    return false;
  }
  const state = processCompletion(pid);
  return state.kind === "live" || state.kind === "unknown";
}
