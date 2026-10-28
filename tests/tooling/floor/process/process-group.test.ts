// Windows cases script only external process-table and taskkill results; every PID belongs to a disposable fixture.
import process from "node:process";
import { expect, test as toolingTest } from "@orb/testkit/tooling";
import type { FullPriorityChild, ProcessGroupDeps, RunNicedSyncResult } from "@orb/tooling/floor/process/proc";
import { captureProcessGroup, killPidGroup, observeProcessGroup, spawnFullPriorityChild } from "@orb/tooling/floor/process/proc";
import type { ProcessTreeRow } from "../../../../tooling/src/floor/host/process-tree.ts";

interface OwnedProcess {
  readonly child: FullPriorityChild;
  readonly pid: number;
}

const test = toolingTest.extend<{ owned: readonly [OwnedProcess, OwnedProcess, OwnedProcess] }>({
  owned: async ({}, use) => {
    const children = Array.from({ length: 3 }, () =>
      spawnFullPriorityChild(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: process.platform !== "win32", stdio: "ignore" }),
    );
    const exits = children.map((child) => child.wait());
    try {
      const owned = children.map((child) => {
        if (child.pid === undefined) {
          throw new Error("owned disposable child did not spawn");
        }
        return { child, pid: child.pid };
      });
      const [root, leaf, foreign] = owned;
      if (root === undefined || leaf === undefined || foreign === undefined) {
        throw new Error("owned process fixture is incomplete");
      }
      await use([root, leaf, foreign]);
    } finally {
      for (const child of children) {
        child.kill("SIGKILL");
      }
      await Promise.all(exits);
    }
  },
});

interface WindowsEdge {
  readonly state: {
    rows: ProcessTreeRow[];
    observation: RunNicedSyncResult | undefined;
    status: number;
    errorCode: string | undefined;
    vanishOnTaskkill: boolean;
    calls: (readonly [string, readonly string[]])[];
  };
  readonly deps: ProcessGroupDeps;
  readonly tasks: () => (readonly [string, readonly string[]])[];
}

function windows(owned: readonly [OwnedProcess, OwnedProcess, OwnedProcess]): WindowsEdge {
  const [root, leaf, foreign] = owned;
  const state: WindowsEdge["state"] = {
    rows: [
      { pid: root.pid, ppid: process.pid, identity: "20" },
      { pid: leaf.pid, ppid: root.pid, identity: "30" },
      { pid: foreign.pid, ppid: root.pid, identity: "10" },
    ],
    observation: undefined as RunNicedSyncResult | undefined,
    status: 0,
    errorCode: undefined as string | undefined,
    vanishOnTaskkill: true,
    calls: [] as (readonly [string, readonly string[]])[],
  };
  const deps: ProcessGroupDeps = {
    platform: "win32",
    signal: () => {
      throw new Error("Windows must never use a POSIX signal");
    },
    run: (command, args) => {
      state.calls.push([command, args]);
      if (command === "powershell.exe") {
        return state.observation ?? { status: 0, stdout: JSON.stringify(state.rows), stderr: "" };
      }
      if (command !== "taskkill") {
        throw new Error(`unexpected process command ${command}`);
      }
      expect(args).not.toContain("/T");
      if (state.vanishOnTaskkill) {
        state.rows = state.rows.filter((row) => row.pid === foreign.pid);
      }
      return { status: state.status, stdout: "", stderr: "", ...(state.errorCode === undefined ? {} : { errorCode: state.errorCode }) };
    },
  };
  return { state, deps, tasks: (): (readonly [string, readonly string[]])[] => state.calls.filter(([command]) => command === "taskkill") };
}

test("Windows signals only creation-qualified descendants and confirms their complete disappearance", ({ owned }) => {
  const edge = windows(owned);
  const tree = captureProcessGroup(owned[0].pid, edge.deps);
  expect(tree.alive()).toBe(true);
  const query = edge.state.calls[0]?.[1].join(" ");
  expect(query).toContain("CreationDate.ToUniversalTime().Ticks.ToString");
  expect(query).not.toContain("CommandLine");
  tree.signal("SIGTERM");
  expect(edge.tasks()).toEqual([["taskkill", ["/PID", String(owned[0].pid), "/PID", String(owned[1].pid), "/F"]]]);
  expect(tree.alive()).toBe(false);
  expect(owned.every(({ child }) => !child.hasExited())).toBe(true);
});

test("taskkill refusal is surfaced unless a fresh strict observation proves the captured tree gone", ({ owned }) => {
  const edge = windows(owned);
  edge.state.status = 5;
  edge.state.vanishOnTaskkill = false;
  expect(() => killPidGroup(owned[0].pid, "SIGKILL", edge.deps)).toThrow("taskkill failed");
  expect(edge.tasks()).toHaveLength(1);
  edge.state.vanishOnTaskkill = true;
  expect(() => killPidGroup(owned[0].pid, "SIGKILL", edge.deps)).not.toThrow();
  expect(edge.tasks()).toHaveLength(2);
});

test("missing taskkill and unreadable follow-up observations cannot report completion", ({ owned }) => {
  const edge = windows(owned);
  edge.state.errorCode = "ENOENT";
  edge.state.status = 0;
  edge.state.vanishOnTaskkill = false;
  expect(() => killPidGroup(owned[0].pid, "SIGKILL", edge.deps)).toThrow("taskkill failed");
  const tree = captureProcessGroup(owned[0].pid, edge.deps);
  edge.state.observation = { status: 1, stdout: "[]", stderr: "planted refusal" };
  expect(tree.alive).toThrow("observation failed");
  expect(() => tree.signal("SIGKILL")).toThrow("observation failed");
  expect(edge.tasks()).toHaveLength(1);
});

test("a retained Windows descendant remains live after its root exits and is the only remaining target", ({ owned }) => {
  const edge = windows(owned);
  const tree = captureProcessGroup(owned[0].pid, edge.deps);
  edge.state.rows = edge.state.rows.filter((row) => row.pid !== owned[0].pid);
  expect(tree.rootAlive()).toBe(false);
  expect(tree.alive()).toBe(true);
  tree.signal("SIGKILL");
  expect(edge.tasks()).toEqual([["taskkill", ["/PID", String(owned[1].pid), "/F"]]]);
  expect(tree.alive()).toBe(false);
});

test("recycled identities and newly ambiguous lineage refuse before any taskkill", ({ owned }) => {
  for (const change of ["recycled", "untracked"] as const) {
    const edge = windows(owned);
    if (change === "untracked") {
      edge.state.rows = edge.state.rows.filter((row) => row.pid !== owned[1].pid);
    }
    const tree = captureProcessGroup(owned[0].pid, edge.deps);
    if (change === "recycled") {
      edge.state.rows = edge.state.rows.map((row) => (row.pid === owned[1].pid ? { ...row, identity: "99" } : row));
    } else {
      edge.state.rows = [{ pid: owned[1].pid, ppid: owned[0].pid, identity: "30" }];
    }
    expect(tree.alive).toThrow();
    expect(() => tree.signal("SIGKILL")).toThrow();
    expect(edge.tasks()).toEqual([]);
  }
});

test("failed and malformed observations refuse instead of becoming empty process trees", ({ owned }) => {
  const invalid = ["", "not json", "null", "{}", '[{"pid":1}]', JSON.stringify([{ pid: owned[0].pid, ppid: process.pid, identity: null }])];
  for (const stdout of invalid) {
    const edge = windows(owned);
    edge.state.observation = { status: 0, stdout, stderr: "" };
    expect(() => captureProcessGroup(owned[0].pid, edge.deps)).toThrow();
    expect(edge.tasks()).toEqual([]);
  }
  const edge = windows(owned);
  edge.state.observation = { status: 1, stdout: "[]", stderr: "planted observation refusal" };
  expect(() => captureProcessGroup(owned[0].pid, edge.deps)).toThrow("observation failed");
  edge.state.observation = { status: 0, stdout: "[]", stderr: "" };
  expect(() => captureProcessGroup(owned[0].pid, edge.deps)).toThrow("cannot be identified");
});

test("nullable Windows observation distinguishes an absent root from unreadable identity", ({ owned }) => {
  const edge = windows(owned);
  edge.state.rows = [];
  expect(observeProcessGroup(owned[0].pid, edge.deps)).toBeNull();
  edge.state.rows = [{ pid: owned[0].pid, ppid: process.pid, identity: null }];
  expect(() => observeProcessGroup(owned[0].pid, edge.deps)).toThrow("cannot be identified");
  edge.state.observation = { status: 1, stdout: "[]", stderr: "refused" };
  expect(() => observeProcessGroup(owned[0].pid, edge.deps)).toThrow("observation failed");
  expect(edge.tasks()).toEqual([]);
});

test("a process-tree capture cannot turn pid one into a broadcast signal", ({ owned }) => {
  const calls: number[] = [];
  const deps: ProcessGroupDeps = {
    platform: "linux",
    signal: (pid) => {
      calls.push(pid);
      return true;
    },
  };
  expect(captureProcessGroup(owned[0].pid, deps).alive()).toBe(true);
  expect(calls).toEqual([-owned[0].pid]);
  expect(() => captureProcessGroup(1, deps)).toThrow("greater than one");
  expect(calls).toEqual([-owned[0].pid]);
});

test.skipIf(process.platform === "win32")("native owned POSIX process-tree termination completes before the controller says gone", async () => {
  const source = `const { spawn } = require("node:child_process"); const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" }); process.on("SIGTERM", () => { child.kill("SIGTERM"); child.once("exit", () => process.exit(0)); }); process.stdout.write("ready\\n");`;
  const child = spawnFullPriorityChild(process.execPath, ["-e", source], { detached: true, stdio: "pipe-stdout" });
  const exited = child.wait();
  if (child.pid === undefined || child.stdout === null) {
    throw new Error("owned process tree did not spawn");
  }
  const tree = captureProcessGroup(child.pid);
  try {
    await new Promise<void>((resolve) => child.stdout?.once("data", () => resolve()));
    expect(tree.alive()).toBe(true);
    tree.signalRoot("SIGTERM");
    expect(await exited).toMatchObject({ code: 0 });
    expect(tree.alive()).toBe(false);
  } finally {
    tree.signal("SIGKILL");
    await exited;
  }
});
