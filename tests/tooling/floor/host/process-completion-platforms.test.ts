// @subject tooling/src/floor/host/platform.ts
// Process incarnation on darwin and win32, driven on Linux with the output shapes those tools document.
// These shapes were never captured from a macOS or Windows host in this repository.
import process from "node:process";
import { expect, test } from "@orb/testkit/tooling";
import { completionProcesses, processCompletion } from "@orb/tooling/floor/host/platform";
import type { RunNicedSyncResult } from "@orb/tooling/floor/process/proc";

/** A tool runner that answers every call with one planted result and records the spelling. */
function answering(result: Partial<RunNicedSyncResult>): {
  readonly run: (cmd: string, args: readonly string[]) => RunNicedSyncResult;
  readonly calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    run: (cmd, args): RunNicedSyncResult => {
      calls.push([cmd, ...args].join(" "));
      return { status: 0, stdout: "", stderr: "", ...result };
    },
  };
}

const CIM_ROW = '[{"pid":1234,"identity":"639000000000000000"}]';

test("darwin reads state and start time from one ps call, at seconds resolution", () => {
  const live = answering({ stdout: "Ss   Thu Nov  6 14:03:22 2026\n" });
  expect(processCompletion(1234, { platform: "darwin", run: live.run })).toEqual({ kind: "live", identity: "Thu Nov 6 14:03:22 2026" });
  expect(live.calls).toEqual(["ps -o stat=,lstart= -p 1234"]);
  expect(processCompletion(1234, { platform: "darwin", run: answering({ stdout: "R+   Thu Nov 13 09:00:01 2026\n" }).run })).toEqual({
    kind: "live",
    identity: "Thu Nov 13 09:00:01 2026",
  });
  expect(processCompletion(1234, { platform: "darwin", run: answering({ stdout: "Z    Thu Nov  6 14:03:22 2026\n" }).run })).toEqual({
    kind: "zombie",
    identity: "Thu Nov 6 14:03:22 2026",
  });
});

test("darwin tells a pid ps cannot find from a read it could not make", () => {
  expect(processCompletion(1234, { platform: "darwin", run: answering({ status: 1 }).run })).toEqual({ kind: "gone" });
  for (const result of [
    { status: 1, stderr: "ps: Operation not permitted" },
    { status: 127 },
    { status: null, errorCode: "ENOENT" },
    { stdout: "garbled output\n" },
    { stdout: "Ss   Thu Nov  6 14:03:22 2026\nSs   Thu Nov  6 14:03:23 2026\n" },
  ] satisfies Partial<RunNicedSyncResult>[]) {
    expect(processCompletion(1234, { platform: "darwin", run: answering(result).run })).toEqual({ kind: "unknown" });
  }
});

test("win32 reads the creation time as the pid's identity from the CIM row", () => {
  const live = answering({ stdout: CIM_ROW });
  expect(processCompletion(1234, { platform: "win32", run: live.run })).toEqual({ kind: "live", identity: "639000000000000000" });
  expect(live.calls).toHaveLength(1);
  expect(live.calls[0]).toContain("powershell.exe -NoProfile -NonInteractive -Command");
  expect(live.calls[0]).toContain('Win32_Process -Filter "ProcessId = 1234"');
  expect(processCompletion(1234, { platform: "win32", run: answering({ stdout: "[]" }).run })).toEqual({ kind: "gone" });
});

test("win32 refuses a row it cannot attribute to the pid or time", () => {
  for (const result of [
    { status: 1, stderr: "Get-CimInstance : access denied" },
    { status: null, errorCode: "ENOENT" },
    { stdout: "" },
    { stdout: "not json" },
    { stdout: '[{"pid":1234,"identity":null}]' },
    { stdout: '[{"pid":4321,"identity":"639000000000000000"}]' },
    { stdout: '[{"pid":1234,"identity":"not-ticks"}]' },
    { stdout: '{"pid":1234,"identity":"639000000000000000"}' },
  ] satisfies Partial<RunNicedSyncResult>[]) {
    expect(processCompletion(1234, { platform: "win32", run: answering(result).run })).toEqual({ kind: "unknown" });
  }
});

test("the completion table is read strictly on darwin and win32, so a failed read is never an empty sweep", () => {
  const owner = { pid: process.pid, identity: "Thu Nov 6 14:03:22 2026" };
  const ps = "1234 1 0:02.00 node x.ts ORB_RUN_MARKER=1-2-abcdef12\n";
  const darwin = (run: ReturnType<typeof answering>["run"]): ReturnType<typeof completionProcesses> => completionProcesses({ platform: "darwin", run });
  expect(darwin(answering({ stdout: ps }).run)).toEqual([
    { pid: 1234, ppid: 1, cmdline: "node x.ts ORB_RUN_MARKER=1-2-abcdef12", environ: "node x.ts ORB_RUN_MARKER=1-2-abcdef12", cpuMs: 2000 },
  ]);
  expect(() => darwin(answering({ status: 1, stderr: "ps: Operation not permitted" }).run)).toThrow("table unreadable");
  const win32 = '[{"ProcessId":1234,"ParentProcessId":1,"CommandLine":"node x.ts","KernelModeTime":10000000,"UserModeTime":0}]';
  expect(completionProcesses({ platform: "win32", run: answering({ stdout: win32 }).run })).toEqual([
    { pid: 1234, ppid: 1, cmdline: "node x.ts", environ: null, cpuMs: 1000 },
  ]);
  for (const result of [{ status: 1 }, { stdout: "" }, { stdout: "not json" }] satisfies Partial<RunNicedSyncResult>[]) {
    expect(() => completionProcesses({ platform: "win32", run: answering(result).run })).toThrow("table unreadable");
  }
  expect(() => completionProcesses({ platform: "freebsd" })).toThrow("unavailable on this platform");
  // The table is bound to its owner exactly as on Linux: only the owner's own incarnation may read it.
  const ownerRun = (_cmd: string, args: readonly string[]): RunNicedSyncResult => ({
    status: 0,
    stdout: args.includes("-axEww") ? ps : "Ss   Thu Nov  6 14:03:22 2026\n",
    stderr: "",
  });
  expect(completionProcesses({ platform: "darwin", run: ownerRun, owner })).toHaveLength(1);
  expect(() => completionProcesses({ platform: "darwin", run: ownerRun, owner: { ...owner, identity: "Mon Jan 1 00:00:00 2024" } })).toThrow(
    "owner identity unavailable",
  );
});
