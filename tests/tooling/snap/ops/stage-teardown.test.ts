// `stopStage` over planted socket-table reads: the verdict every teardown reports from. It is `stopped` only when
// a read taken after the stop shows the band ports free. The stage dir does not exist, so no launcher runs; the
// reads, the signals and the waits are all injected, so no process is touched and no real time passes.

import { join } from "node:path";
import process from "node:process";
import { vi } from "vitest";
import type { ListeningPortsRead, PortOwner } from "../../../../tooling/src/_shared/platform.ts";
import type { StageStopDeps } from "../../../../tooling/src/snap/contract/stage.ts";
import { stopStage } from "../../../../tooling/src/snap/ops/stage-teardown.ts";
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
