// The stage stops over planted socket-table reads: `stopStage`, the sweep's reap and the row-less teardown each
// claim a stop only when a read taken after it shows the band ports free. The launcher, the reads, the
// signals and the waits are injected, so no process is touched and no real time passes.

import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/tooling";
import { vi } from "vitest";
import type { ListeningPortsRead, PortOwner, ProcessCompletion } from "../../../../tooling/src/floor/host/platform.ts";
import { DEV_PORTS, stageBandPorts } from "../../../../tooling/src/floor/host/ports.ts";
import { observeProcessGroup } from "../../../../tooling/src/floor/process/proc.ts";
import type { RunNicedSyncResult } from "../../../../tooling/src/floor/process/proc-contract.ts";
import type { StageBandView, StageStopDeps } from "../../../../tooling/src/snap/contract/stage.ts";
import { reapStrandedBand, stopStage, tearDownRowlessBand } from "../../../../tooling/src/snap/ops/stage-teardown.ts";
import { STACK_CLI_REL, stackPorts } from "../../../../tooling/src/stack/index.ts";

const PORTS = { server: 47_811, vite: 47_812 } as const;
const STAGE_PID = 4242;
const STAGE_GROUP = 4200;

function table(owners: ReadonlyMap<number, PortOwner>): ListeningPortsRead {
  return { kind: "read", value: owners };
}

const FREE = table(new Map());
const HELD_BY_STAGE = table(new Map([[PORTS.server, { kind: "pid", pid: STAGE_PID }]]));

/** Deps that answer `reads` in order (the last one repeats), treat `STAGE_PID` as stage-rooted in group
 *  `STAGE_GROUP`, and record every signal and wait instead of acting. The group has members until `groupAlive` says
 *  otherwise. */
function planted(
  reads: readonly ListeningPortsRead[],
  incarnationOf: (signals: readonly string[]) => ProcessCompletion = () => ({ kind: "live", identity: "original" }),
  groupAlive: (signals: readonly string[]) => boolean = () => true,
): { readonly deps: StageStopDeps; readonly signals: string[]; readonly waits: number[] } {
  const signals: string[] = [];
  const waits: number[] = [];
  let next = 0;
  const deps: StageStopDeps = {
    incarnationOf: () => incarnationOf(signals),
    readPorts: (): ListeningPortsRead => {
      const read = reads[Math.min(next, reads.length - 1)] ?? FREE;
      next += 1;
      return read;
    },
    isStageRooted: (pid) => pid === STAGE_PID,
    captureGroup: (pid) =>
      pid === STAGE_PID
        ? {
            alive: () => groupAlive(signals),
            signal: (kind) => {
              signals.push(`${String(STAGE_GROUP)} ${kind}`);
            },
          }
        : null,
    wait: (ms) => {
      waits.push(ms);
    },
    runLauncher: () => undefined,
  };
  return { deps, signals, waits };
}

vi.spyOn(process.stdout, "write").mockImplementation(() => true);

const noStage = (scratch: string): string => join(scratch, "no-stage");

test("a table that reads both band ports free confirms the stop and signals nothing", ({ scratch }) => {
  const run = planted([FREE]);
  expect(stopStage(noStage(scratch), PORTS, run.deps)).toEqual({ kind: "stopped" });
  expect(run.signals).toEqual([]);
});

test("a table that cannot be read leaves the stop unconfirmed, with the refusal as its reason", ({ scratch }) => {
  const run = planted([{ kind: "refused", reason: "socket table unreadable on linux: planted" }]);
  expect(stopStage(noStage(scratch), PORTS, run.deps)).toEqual({
    kind: "unconfirmed",
    reason: expect.stringContaining("socket table unreadable on linux: planted"),
  });
});

test("a band port still held by an owner the OS will not name leaves the stop unconfirmed", ({ scratch }) => {
  const run = planted([table(new Map([[PORTS.vite, { kind: "unknown" }]]))]);
  expect(stopStage(noStage(scratch), PORTS, run.deps)).toEqual({
    kind: "unconfirmed",
    reason: expect.stringContaining(`:${String(PORTS.vite)} is still held by an owner the OS will not name`),
  });
  expect(run.signals).toEqual([]);
});

test("a band port held by a pid that is not a stage leaves the stop unconfirmed and signals nothing", ({ scratch }) => {
  const run = planted([table(new Map([[PORTS.server, { kind: "pid", pid: 7 }]]))]);
  expect(stopStage(noStage(scratch), PORTS, run.deps)).toEqual({
    kind: "unconfirmed",
    reason: expect.stringContaining(`:${String(PORTS.server)} is still held by pid 7`),
  });
  expect(run.signals).toEqual([]);
});

test("a stage group that survives TERM and KILL, still holding the port on every read after, is unconfirmed", ({ scratch }) => {
  const run = planted([HELD_BY_STAGE]);
  expect(stopStage(noStage(scratch), PORTS, run.deps)).toEqual({
    kind: "unconfirmed",
    reason: expect.stringContaining(`:${String(PORTS.server)} is still held by pid ${String(STAGE_PID)} after TERM and KILL`),
  });
  expect(run.signals, "the escalation dev-down runs: TERM, then KILL, to the group").toEqual([
    `${String(STAGE_GROUP)} SIGTERM`,
    `${String(STAGE_GROUP)} SIGKILL`,
  ]);
  expect(run.waits.length, "the waits are injected, so the grace passes without real time").toBeGreaterThan(0);
});

test("a stage group that exits on TERM frees the port, and the stop is confirmed with no KILL", ({ scratch }) => {
  const run = planted([HELD_BY_STAGE, HELD_BY_STAGE, FREE]);
  expect(stopStage(noStage(scratch), PORTS, run.deps)).toEqual({ kind: "stopped" });
  expect(run.signals).toEqual([`${String(STAGE_GROUP)} SIGTERM`]);
});

test("a holder replaced during the TERM grace is refused the KILL, and the stop stays unconfirmed", ({ scratch }) => {
  const run = planted([HELD_BY_STAGE], (signals) => ({ kind: "live", identity: signals.length === 0 ? "original" : "replacement" }));
  expect(stopStage(noStage(scratch), PORTS, run.deps)).toEqual({
    kind: "unconfirmed",
    reason: expect.stringContaining(`:${String(PORTS.server)} is still held by pid ${String(STAGE_PID)}`),
  });
  expect(run.signals).toEqual([`${String(STAGE_GROUP)} SIGTERM`]);
});

test("a holder that exited on TERM does not spare its group from the KILL while the port is still held", ({ scratch }) => {
  const run = planted([HELD_BY_STAGE], (signals) => (signals.length === 0 ? { kind: "live", identity: "original" } : { kind: "gone" }));
  expect(stopStage(noStage(scratch), PORTS, run.deps)).toEqual({
    kind: "unconfirmed",
    reason: expect.stringContaining(`:${String(PORTS.server)} is still held by pid ${String(STAGE_PID)} after TERM and KILL`),
  });
  expect(run.signals).toEqual([`${String(STAGE_GROUP)} SIGTERM`, `${String(STAGE_GROUP)} SIGKILL`]);
});

test("a group seen empty is never signalled again, even while the port stays held", ({ scratch }) => {
  // The group empties after the TERM and the port stays held by something outside it: the KILL would go to an id
  // that may belong to a new group.
  const run = planted([HELD_BY_STAGE], undefined, (signals) => signals.length === 0);
  expect(stopStage(noStage(scratch), PORTS, run.deps)).toEqual({
    kind: "unconfirmed",
    reason: expect.stringContaining("process group of pid 4242 emptied"),
  });
  expect(run.signals).toEqual([`${String(STAGE_GROUP)} SIGTERM`]);
  // Once seen empty it stays empty: a group that reads occupied again is a recycled id, not ours.
  let reads = 0;
  const recycled = planted([HELD_BY_STAGE], undefined, () => ++reads !== 3);
  expect(stopStage(noStage(scratch), PORTS, recycled.deps).kind).toBe("unconfirmed");
  expect(recycled.signals).toEqual([`${String(STAGE_GROUP)} SIGTERM`]);
});

test("a holder whose identity cannot be read is never signalled", ({ scratch }) => {
  const unreadable = planted([HELD_BY_STAGE], () => ({ kind: "unknown" }));
  expect(stopStage(noStage(scratch), PORTS, unreadable.deps)).toEqual({
    kind: "unconfirmed",
    reason: expect.stringContaining("identity could not be read"),
  });
  expect(unreadable.signals).toEqual([]);
  // The identity goes unreadable only after the first signal: the KILL is refused the same way.
  const vanishing = planted([HELD_BY_STAGE], (signals) => (signals.length === 0 ? { kind: "live", identity: "original" } : { kind: "unknown" }));
  expect(() => stopStage(noStage(scratch), PORTS, vanishing.deps)).toThrow("identity unavailable");
  expect(vanishing.signals).toEqual([`${String(STAGE_GROUP)} SIGTERM`]);
});

// The win32 tree is read through PowerShell and ended with taskkill; these drive the real retained-tree controller
// with the rows that tool documents. The planted holder is the root, with one child that survives the first kill.
test("a win32 stop keeps signalling the captured tree after its root exited, and confirms once the child is gone", ({ scratch }) => {
  let rows = [
    { pid: STAGE_PID, ppid: 1, identity: "100" },
    { pid: STAGE_PID + 1, ppid: STAGE_PID, identity: "101" },
  ];
  const taskkills: string[] = [];
  const run = (command: string, args: readonly string[]): RunNicedSyncResult => {
    if (command === "taskkill") {
      taskkills.push(args.join(" "));
      rows = taskkills.length === 1 ? rows.filter((row) => row.pid !== STAGE_PID) : [];
      return { status: 0, stdout: "", stderr: "" };
    }
    return { status: 0, stdout: JSON.stringify(rows), stderr: "" };
  };
  const planted_ = planted([HELD_BY_STAGE], () => (taskkills.length === 0 ? { kind: "live", identity: "original" } : { kind: "gone" }));
  const deps: StageStopDeps = {
    ...planted_.deps,
    readPorts: () => (rows.length > 0 ? HELD_BY_STAGE : FREE),
    captureGroup: (pid) => observeProcessGroup(pid, { platform: "win32", run }),
  };
  expect(stopStage(noStage(scratch), PORTS, deps)).toEqual({ kind: "stopped" });
  expect(taskkills).toEqual([`/PID ${String(STAGE_PID)} /PID ${String(STAGE_PID + 1)} /F`, `/PID ${String(STAGE_PID + 1)} /F`]);
});

// ── the launcher stop: the staged stack must sweep the band's ports, never the dev stack's ───────────────

test("the launcher stop resolves the band's own ports and never names the dev stack's", async ({ plantedTree }) => {
  const dir = await plantedTree({ [STACK_CLI_REL]: "" });
  const run = planted([FREE]);
  const launches: { readonly args: readonly string[]; readonly ports: { readonly server: number; readonly vite: number } }[] = [];
  const deps: StageStopDeps = {
    ...run.deps,
    runLauncher: (spawn, opts) => {
      // The staged stack resolves its ports exactly this way; no `.env` exists in a staged worktree.
      launches.push({ args: spawn.args, ports: stackPorts({ ...opts.env }, null) });
    },
  };
  expect(stopStage(dir, PORTS, deps)).toEqual({ kind: "stopped" });
  expect(launches.map((launch) => launch.args.at(-1))).toEqual(["down"]);
  expect(launches.map((launch) => launch.ports)).toEqual([PORTS]);
  // The band must differ from the dev pair, or a stop aimed at the dev stack would pass too.
  expect([PORTS.server, PORTS.vite]).not.toContain(DEV_PORTS.server);
  expect([PORTS.server, PORTS.vite]).not.toContain(DEV_PORTS.vite);
});

// ── the sweep's reap and the row-less teardown: the band's own ports, stopped by group alone ──────────────

const BAND = 3;
const BAND_PORTS = stageBandPorts(BAND);
const BAND_HELD = table(new Map([[BAND_PORTS.server, { kind: "pid", pid: STAGE_PID }]]));

/** A stranded band no row accounts for, bound and held only by stage-rooted processes. */
const ROWLESS: StageBandView = { band: BAND, row: null, bandBound: true, bandIsStageRooted: true, healthy: false, liveSessions: [], liveHolders: [] };

test("the sweep's reap of a band whose stage group survives TERM and KILL is not reported as reaped", ({ scratch }) => {
  const run = planted([BAND_HELD]);
  const line = reapStrandedBand(scratch, ROWLESS, run.deps);
  expect(line).toContain(`band ${String(BAND)}: stranded stage NOT reaped — its stop is not confirmed`);
  expect(line).toContain(`:${String(BAND_PORTS.server)} is still held by pid ${String(STAGE_PID)} after TERM and KILL`);
  expect(run.signals).toEqual([`${String(STAGE_GROUP)} SIGTERM`, `${String(STAGE_GROUP)} SIGKILL`]);
});

test("the sweep's reap of a band whose stage group exits on TERM reports it reaped: the control", ({ scratch }) => {
  const run = planted([BAND_HELD, BAND_HELD, FREE]);
  expect(reapStrandedBand(scratch, ROWLESS, run.deps)).toBe(`band ${String(BAND)}: reaped a stranded stage (stopped (no row), cleared the row)`);
  expect(run.signals).toEqual([`${String(STAGE_GROUP)} SIGTERM`]);
});

test("a row-less teardown whose stage group survives TERM and KILL reports the stop not confirmed", () => {
  const run = planted([BAND_HELD]);
  const lines = tearDownRowlessBand(ROWLESS, run.deps);
  expect(lines).toEqual([expect.stringContaining(`band ${String(BAND)}: row-less teardown NOT confirmed`)]);
  expect(run.signals).toEqual([`${String(STAGE_GROUP)} SIGTERM`, `${String(STAGE_GROUP)} SIGKILL`]);
});

test("a row-less teardown whose stage group exits on TERM reports the band stopped: the control", () => {
  const run = planted([BAND_HELD, BAND_HELD, FREE]);
  expect(tearDownRowlessBand(ROWLESS, run.deps)).toEqual([`band ${String(BAND)}: row-less teardown — stopped the stage-rooted band process group(s)`]);
  expect(run.signals).toEqual([`${String(STAGE_GROUP)} SIGTERM`]);
});
