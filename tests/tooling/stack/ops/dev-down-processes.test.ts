import { existsSync } from "node:fs";
import { join } from "node:path";
import type { LeaderRecord, StackContext } from "../../../../tooling/src/stack/contract/types.ts";
import { leaderRecordPath, writeLeaderRecord } from "../../../../tooling/src/stack/lib/leader-record.ts";
import { stackContext } from "../../../../tooling/src/stack/lib/stack-plan.ts";
import { doDevDown } from "../../../../tooling/src/stack/ops/dev-down.ts";
import { expect, test } from "../../_windows-processes.ts";

function record(ctx: StackContext, pid: number, leafPid: number): LeaderRecord {
  return {
    version: 2,
    pid,
    pgid: null,
    launchId: "owned-launch",
    repoRoot: ctx.repoRoot,
    runDir: ctx.runDir,
    ports: ctx.ports,
    children: [leafPid],
    pins: { values: {}, sources: ctx.pins.sources },
    startedAt: new Date(0).toISOString(),
    beatMs: 0,
  };
}

for (const departed of [true, false]) {
  test(`Windows-edge dev shutdown ${departed ? "stops independently owned survivors of a departed leader" : "captures overlapping roots before stopping either"}`, async ({
    scratch,
    windows,
  }) => {
    const ctx = stackContext(
      windows.checkout,
      Object.fromEntries([
        ["STACK_RUN_DIR", join(scratch, "run")],
        ["ORB_ENV_NO_FILE", "1"],
      ]),
      null,
    );
    writeLeaderRecord(ctx.runDir, record(ctx, windows.rootPid, windows.leafPid));
    if (departed) {
      windows.root.kill("SIGKILL");
      await windows.rootExit;
      const state = windows.state;
      state.rows = state.rows.filter((row) => row.pid !== windows.rootPid);
    }
    const result = await doDevDown(ctx, {}, { readPorts: () => ({ kind: "read", value: new Map() }), process: windows.process });
    expect(result).toBe(0);
    expect(windows.state.tasks).toEqual([[...(departed ? [] : ["/PID", String(windows.rootPid)]), "/PID", String(windows.leafPid), "/F"]]);
    expect(existsSync(leaderRecordPath(ctx.runDir))).toBe(false);
    expect(windows.leaf.hasExited()).toBe(false);
  });
}

test("Windows-edge dev shutdown retains its record on process observation refusal", async ({ scratch, windows }) => {
  const ctx = stackContext(
    windows.checkout,
    Object.fromEntries([
      ["STACK_RUN_DIR", join(scratch, "run")],
      ["ORB_ENV_NO_FILE", "1"],
    ]),
    null,
  );
  writeLeaderRecord(ctx.runDir, record(ctx, windows.rootPid, windows.leafPid));
  const state = windows.state;
  state.observationFails = true;
  await expect(doDevDown(ctx, {}, { readPorts: () => ({ kind: "read", value: new Map() }), process: windows.process })).rejects.toThrow("observation failed");
  expect(existsSync(leaderRecordPath(ctx.runDir))).toBe(true);
  expect(windows.state.tasks).toEqual([]);
});

test("Windows-edge dev shutdown retains its record when taskkill refuses", async ({ scratch, windows }) => {
  const ctx = stackContext(windows.checkout, { ["STACK_RUN_DIR"]: join(scratch, "run"), ["ORB_ENV_NO_FILE"]: "1" }, null);
  writeLeaderRecord(ctx.runDir, record(ctx, windows.rootPid, windows.leafPid));
  windows.state.status = 5;
  windows.state.removeTargets = false;
  await expect(doDevDown(ctx, {}, { readPorts: () => ({ kind: "read", value: new Map() }), process: windows.process })).rejects.toThrow("taskkill failed");
  expect(existsSync(leaderRecordPath(ctx.runDir))).toBe(true);
  expect(windows.state.tasks).toHaveLength(1);
  expect(windows.root.hasExited()).toBe(false);
});

test("Windows-edge unrecorded owned port holder is stopped through one retained tree", async ({ scratch, windows }) => {
  const ctx = stackContext(windows.checkout, { ["STACK_RUN_DIR"]: join(scratch, "run"), ["ORB_ENV_NO_FILE"]: "1" }, null);
  const result = await doDevDown(
    ctx,
    {},
    {
      process: windows.process,
      readPorts: () => ({
        kind: "read",
        value: new Map(
          windows.state.rows.some(({ pid }) => pid === windows.rootPid) ? [[ctx.ports.server, { kind: "pid" as const, pid: windows.rootPid }]] : [],
        ),
      }),
    },
  );
  expect(result).toBe(0);
  expect(windows.state.tasks).toEqual([["/PID", String(windows.rootPid), "/PID", String(windows.leafPid), "/F"]]);
  expect(windows.leaf.hasExited()).toBe(false);
});
