// The stage stops over planted socket-table reads: `stopStage`, the sweep's reap and the row-less teardown each
// claim a stop only when a read taken after it shows the band ports free. The launcher, the reads, the
// signals and the waits are injected, so no process is touched and no real time passes.

import { join } from "node:path";
import process from "node:process";
import { vi } from "vitest";
import type { ListeningPortsRead, PortOwner } from "../../../../tooling/src/_shared/platform.ts";
import { DEV_PORTS, stageBandPorts } from "../../../../tooling/src/_shared/ports.ts";
import type { StageBandView, StageStopDeps } from "../../../../tooling/src/snap/contract/stage.ts";
import { reapStrandedBand, stopStage, tearDownRowlessBand } from "../../../../tooling/src/snap/ops/stage-teardown.ts";
import { STACK_CLI_REL, stackPorts } from "../../../../tooling/src/stack/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const PORTS = { server: 47_811, vite: 47_812 } as const;
const STAGE_PID = 4242;
const STAGE_GROUP = 4200;

function table(owners: ReadonlyMap<number, PortOwner>): ListeningPortsRead {
  return { kind: "read", value: owners };
}

const FREE = table(new Map());
const HELD_BY_STAGE = table(new Map([[PORTS.server, { kind: "pid", pid: STAGE_PID }]]));

/** Deps that answer `reads` in order (the last one repeats), treat `STAGE_PID` as stage-rooted in group
 *  `STAGE_GROUP`, and record every signal and wait instead of acting. */
function planted(reads: readonly ListeningPortsRead[]): { readonly deps: StageStopDeps; readonly signals: string[]; readonly waits: number[] } {
  const signals: string[] = [];
  const waits: number[] = [];
  let next = 0;
  const deps: StageStopDeps = {
    readPorts: (): ListeningPortsRead => {
      const read = reads[Math.min(next, reads.length - 1)] ?? FREE;
      next += 1;
      return read;
    },
    isStageRooted: (pid) => pid === STAGE_PID,
    groupOf: (pid) => (pid === STAGE_PID ? STAGE_GROUP : null),
    signalGroup: (target, signal) => {
      signals.push(`${String(target)} ${signal}`);
    },
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
const ROWLESS: StageBandView = { band: BAND, row: null, bandBound: true, bandIsStageRooted: true, healthy: false, liveSessions: [] };

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
