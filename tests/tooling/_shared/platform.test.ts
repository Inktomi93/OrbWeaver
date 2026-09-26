// The platform module's doors with the OS tools injected: each branch is driven on Linux with the command
// it would run on darwin and win32 and the output that tool documents, so a wrong flag or a wrong column is
// a red here rather than on a machine nobody has. The Linux branch reads a planted `/proc`.

import { vi } from "vitest";
import type { OpenerChild } from "../../../tooling/src/_shared/platform.ts";
import {
  establishedConnections,
  isWsl2,
  listeningPids,
  listProcesses,
  openUrl,
  pnpmInvocation,
  processAgeSeconds,
  processGroupId,
  processInfo,
  processTreeCpuMs,
} from "../../../tooling/src/_shared/platform.ts";
import type { RunNicedSyncResult } from "../../../tooling/src/_shared/proc.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

/** A fake tool runner: answers each `<cmd> <args>` spelling with its planted output, records every call, and
 *  fails any spelling that was not planted, so a wrong flag is a red rather than an empty answer. */
function fakeRun(answers: Readonly<Record<string, string>>): { run: (cmd: string, args: readonly string[]) => RunNicedSyncResult; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    run: (cmd, args): RunNicedSyncResult => {
      const spelling = [cmd, ...args].join(" ");
      calls.push(spelling);
      const stdout = answers[spelling];
      return stdout === undefined ? { status: 1, stdout: "", stderr: `not planted: ${spelling}` } : { status: 0, stdout, stderr: "" };
    },
  };
}

const LSOF_LISTEN = "lsof -nP -iTCP -sTCP:LISTEN -Fpn";
const LSOF_ESTABLISHED = "lsof -nP -iTCP -sTCP:ESTABLISHED -Fpn";
const NETSTAT = "netstat -ano";
const CIM_ALL =
  "powershell.exe -NoProfile -NonInteractive -Command Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine,KernelModeTime,UserModeTime | ConvertTo-Json -Compress";

test("listeningPids asks each platform its own socket-table tool and answers port → pid", () => {
  const linux = fakeRun({ "ss -tlnp": 'LISTEN 0 511 127.0.0.1:8788 0.0.0.0:* users:(("node",pid=1234,fd=23))\n' });
  expect(listeningPids({ platform: "linux", run: linux.run })).toEqual(new Map([[8788, 1234]]));
  const darwin = fakeRun({ [LSOF_LISTEN]: "p1234\nf23\nn127.0.0.1:8788\n" });
  expect(listeningPids({ platform: "darwin", run: darwin.run })).toEqual(new Map([[8788, 1234]]));
  const win32 = fakeRun({
    [NETSTAT]: "  TCP    127.0.0.1:8788    0.0.0.0:0    LISTENING    1234\n  TCP    127.0.0.1:52000    127.0.0.1:8788    ESTABLISHED    77\n",
  });
  expect(listeningPids({ platform: "win32", run: win32.run })).toEqual(new Map([[8788, 1234]]));
  expect([linux.calls, darwin.calls, win32.calls]).toEqual([["ss -tlnp"], [LSOF_LISTEN], [NETSTAT]]);
});

test("a socket-table tool that fails answers no rows — never a guessed owner", () => {
  const failing = fakeRun({});
  expect(listeningPids({ platform: "linux", run: failing.run })).toEqual(new Map());
  expect(establishedConnections({ platform: "darwin", run: failing.run })).toEqual([]);
  expect(listeningPids({ platform: "freebsd", run: failing.run }), "an unsupported platform reads nothing and runs nothing").toEqual(new Map());
  expect(failing.calls).toEqual(["ss -tlnp", LSOF_ESTABLISHED]);
});

test("establishedConnections carries the peer and the local owner on every platform", () => {
  const darwin = fakeRun({ [LSOF_ESTABLISHED]: "p999\nf40\nn127.0.0.1:52134->127.0.0.1:8788\n" });
  expect(establishedConnections({ platform: "darwin", run: darwin.run })).toEqual([{ localPort: 52_134, peerHost: "127.0.0.1", peerPort: 8788, pid: 999 }]);
  const win32 = fakeRun({ [NETSTAT]: "  TCP    127.0.0.1:52134    127.0.0.1:8788    ESTABLISHED    999\n" });
  expect(establishedConnections({ platform: "win32", run: win32.run })).toEqual([{ localPort: 52_134, peerHost: "127.0.0.1", peerPort: 8788, pid: 999 }]);
});

/** A planted Linux `/proc` for one pid: the files a door reads, keyed by absolute path. */
function plantedProc(
  pid: number,
  files: Readonly<Record<string, string>>,
): { readFile: (path: string) => string | null; readDir: () => readonly string[]; readLink: (path: string) => string | null } {
  return {
    readFile: (path): string | null => files[path] ?? null,
    readDir: (): readonly string[] => [String(pid), "self", "cpuinfo"],
    readLink: (path): string | null => (path === `/proc/${String(pid)}/cwd` ? "/srv/checkout" : null),
  };
}

test("processInfo reads the command line, parent and cwd from /proc on Linux, ps + lsof on darwin, CIM on win32", () => {
  const proc = plantedProc(1234, { "/proc/1234/cmdline": "node\0--watch\0x.ts\0", "/proc/1234/status": "Name:\tnode\nPPid:\t1\n" });
  expect(processInfo(1234, { platform: "linux", ...proc })).toEqual({ pid: 1234, ppid: 1, cmdline: "node --watch x.ts", cwd: "/srv/checkout" });
  expect(processInfo(99, { platform: "linux", ...proc }), "a pid with no /proc entry is not observed").toBeNull();
  const darwin = fakeRun({
    "ps -o pid=,ppid=,time=,command= -p 1234": "1234 1 0:00.10 node --watch x.ts\n",
    "lsof -a -p 1234 -d cwd -Fn": "p1234\nfcwd\nn/srv/checkout\n",
  });
  expect(processInfo(1234, { platform: "darwin", run: darwin.run })).toEqual({ pid: 1234, ppid: 1, cmdline: "node --watch x.ts", cwd: "/srv/checkout" });
  const win32 = fakeRun({
    'powershell.exe -NoProfile -NonInteractive -Command Get-CimInstance Win32_Process -Filter "ProcessId = 1234" | Select-Object ProcessId,ParentProcessId,CommandLine,KernelModeTime,UserModeTime | ConvertTo-Json -Compress':
      '{"ProcessId":1234,"ParentProcessId":1,"CommandLine":"node --watch x.ts","KernelModeTime":0,"UserModeTime":0}',
  });
  expect(processInfo(1234, { platform: "win32", run: win32.run })).toEqual({ pid: 1234, ppid: 1, cmdline: "node --watch x.ts", cwd: null });
});

test("processGroupId: /proc stat on Linux, ps on darwin, and no group at all on win32", () => {
  const proc = plantedProc(1234, { "/proc/1234/stat": "1234 (node) S 1 4321 4321 0 -1 0 0 0 0 0 1 1 0 0 20 0 1 0 1 0 0" });
  expect(processGroupId(1234, { platform: "linux", ...proc })).toBe(4321);
  const darwin = fakeRun({ "ps -o pgid= -p 1234": " 4321\n" });
  expect(processGroupId(1234, { platform: "darwin", run: darwin.run })).toBe(4321);
  const win32 = fakeRun({});
  expect(processGroupId(1234, { platform: "win32", run: win32.run })).toBeNull();
  expect(win32.calls, "win32 asks nothing: there is no process group to ask for").toEqual([]);
});

test("processAgeSeconds reads ps etime on POSIX and the CIM creation date on win32", () => {
  const posix = fakeRun({ "ps -o etime= -p 1234": "   1-02:03:04\n" });
  expect(processAgeSeconds(1234, { platform: "darwin", run: posix.run })).toBe(93_784);
  expect(processAgeSeconds(1234, { platform: "linux", run: posix.run })).toBe(93_784);
  const win32 = fakeRun({
    'powershell.exe -NoProfile -NonInteractive -Command (Get-CimInstance Win32_Process -Filter "ProcessId = 1234" | ForEach-Object { [int]((Get-Date) - $_.CreationDate).TotalSeconds })':
      "42\n",
  });
  expect(processAgeSeconds(1234, { platform: "win32", run: win32.run })).toBe(42);
  expect(processAgeSeconds(7, { platform: "linux", run: fakeRun({}).run }), "a pid ps cannot see has no age").toBeNull();
});

test("listProcesses walks /proc on Linux with environ and CPU, ps -E on darwin, CIM on win32 with no environ", () => {
  const proc = plantedProc(1234, {
    "/proc/1234/cmdline": "node\0x.ts\0",
    "/proc/1234/status": "PPid:\t1\n",
    "/proc/1234/environ": "ORB_RUN_MARKER=1-2-abcdef12\0PATH=/bin\0",
    "/proc/1234/stat": "1234 (node) S 1 1234 1234 0 -1 0 0 0 0 0 200 100 0 0 20 0 1 0 1 0 0",
  });
  expect(listProcesses({ platform: "linux", ...proc })).toEqual([
    { pid: 1234, ppid: 1, cmdline: "node x.ts", environ: "ORB_RUN_MARKER=1-2-abcdef12 PATH=/bin", cpuMs: 3000 },
  ]);
  const darwin = fakeRun({ "ps -axEww -o pid=,ppid=,time=,command=": "1234 1 0:02.00 node x.ts ORB_RUN_MARKER=1-2-abcdef12\n" });
  expect(listProcesses({ platform: "darwin", run: darwin.run })).toEqual([
    { pid: 1234, ppid: 1, cmdline: "node x.ts ORB_RUN_MARKER=1-2-abcdef12", environ: "node x.ts ORB_RUN_MARKER=1-2-abcdef12", cpuMs: 2000 },
  ]);
  const win32 = fakeRun({ [CIM_ALL]: '[{"ProcessId":1234,"ParentProcessId":1,"CommandLine":"node x.ts","KernelModeTime":10000000,"UserModeTime":0}]' });
  expect(listProcesses({ platform: "win32", run: win32.run })).toEqual([{ pid: 1234, ppid: 1, cmdline: "node x.ts", environ: null, cpuMs: 1000 }]);
});

test("processTreeCpuMs sums the pid and every descendant, and nothing outside the tree", () => {
  const darwin = fakeRun({
    "ps -axEww -o pid=,ppid=,time=,command=": ["10 1 0:01.00 root", "11 10 0:02.00 child", "12 11 0:03.00 grandchild", "20 1 0:09.00 stranger", ""].join("\n"),
  });
  expect(processTreeCpuMs(10, { platform: "darwin", run: darwin.run })).toBe(6000);
});

test("isWsl2 reads /proc/version on Linux only", () => {
  const wsl = plantedProc(1, { "/proc/version": "Linux version 5.15.153.1-microsoft-standard-WSL2 (root@x) #1 SMP" });
  expect(isWsl2({ platform: "linux", ...wsl })).toBe(true);
  const bare = plantedProc(1, { "/proc/version": "Linux version 7.0.0-31-generic (buildd@x) #31-Ubuntu SMP" });
  expect(isWsl2({ platform: "linux", ...bare })).toBe(false);
  expect(isWsl2({ platform: "win32", ...wsl }), "no /proc/version is read off Linux").toBe(false);
});

test("openUrl launches the platform's opener, releases it at once and reports how it ended", async () => {
  const launched: string[] = [];
  let released = 0;
  const launch = (cmd: string, args: readonly string[]): OpenerChild => {
    launched.push([cmd, ...args].join(" "));
    return {
      unref: (): void => {
        released += 1;
      },
      wait: async () => await Promise.resolve({ code: 0, signal: null, error: undefined }),
    };
  };
  expect(await openUrl("http://localhost:8788", { platform: "linux", launch })).toBeUndefined();
  expect(await openUrl("http://localhost:8788", { platform: "darwin", launch })).toBeUndefined();
  expect(await openUrl("http://localhost:8788", { platform: "win32", launch })).toBeUndefined();
  expect(launched).toEqual(["xdg-open http://localhost:8788", "open http://localhost:8788", "cmd.exe /c start  http://localhost:8788"]);
  expect(released).toBe(3);
});

// A box with no desktop has no opener at all. Through the default launcher that is an answer, never an uncaught
// `error` event: the caller is a foreground server launcher, and a crash there stops the server a person is using.
test("openUrl's default launcher answers a missing opener with its error instead of crashing", async ({ scratch }) => {
  vi.stubEnv("PATH", scratch);
  try {
    const error = await openUrl("http://localhost:8788", { platform: "linux" });
    expect(error?.message).toContain("ENOENT");
  } finally {
    vi.unstubAllEnvs();
  }
});

// The README's install line installs the standalone pnpm, whose `npm_execpath` is the native executable itself
// (`…/@pnpm/exe/pnpm`, `pnpm.exe` on Windows), not a JS entry. Refusing it stopped every Windows first start.
test("pnpmInvocation runs a standalone pnpm's own executable on every platform", () => {
  const ambient = Object.fromEntries([["npm_execpath", "C:\\Users\\me\\AppData\\Local\\pnpm\\node_modules\\@pnpm\\exe\\pnpm.exe"]]);
  for (const platform of ["win32", "linux", "darwin"] as const) {
    expect(pnpmInvocation({ ambient, platform, nodePath: "/n", args: ["build"] }), platform).toEqual({
      kind: "binary",
      command: "C:\\Users\\me\\AppData\\Local\\pnpm\\node_modules\\@pnpm\\exe\\pnpm.exe",
      args: ["build"],
    });
  }
});

test("pnpmInvocation runs pnpm's own JS entry under every platform, falls back to PATH on POSIX, and refuses on win32", () => {
  const ambient = Object.fromEntries([["npm_execpath", "/opt/pnpm/dist/pnpm.cjs"]]);
  expect(pnpmInvocation({ ambient, platform: "win32", nodePath: "/n", args: ["build"] })).toEqual({
    kind: "node",
    command: "/n",
    args: ["/opt/pnpm/dist/pnpm.cjs", "build"],
  });
  expect(pnpmInvocation({ ambient: {}, platform: "linux", nodePath: "/n", args: ["build"] })).toEqual({ kind: "path", command: "pnpm", args: ["build"] });
  const refused = pnpmInvocation({ ambient: {}, platform: "win32", nodePath: "/n", args: ["build"] });
  expect(refused.kind).toBe("refused");
  expect(refused.kind === "refused" && refused.reason).toContain("npm_execpath");
});
