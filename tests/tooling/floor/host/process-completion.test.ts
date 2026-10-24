// @subject tooling/src/floor/host/platform.ts
import process from "node:process";
import { expect, test } from "@orb/testkit/tooling";
import { completionProcesses, processCompletion } from "@orb/tooling/floor/host/platform";

test.skipIf(process.platform !== "linux")("inaccessible candidates are excluded only before this positively matched owner incarnation", () => {
  const userId = process.getuid?.();
  const stat = (identity: string): string => `42 (native) S ${Array.from({ length: 18 }, () => "0").join(" ")} ${identity} 0`;
  const readDir = (): readonly string[] => ["42"];
  let candidate: string | null = "10";
  const readFile = (path: string): string | null => {
    if (path === `/proc/${process.pid}/stat`) {
      return stat("20");
    }
    if (path.endsWith("/stat")) {
      return candidate === null ? null : stat(candidate);
    }
    if (path.endsWith("/status")) {
      return `Uid:\t${userId}\t${userId}\t${userId}\t${userId}\nPPid:\t1\n`;
    }
    return null;
  };
  const owner = { pid: process.pid, identity: "20" };
  expect(completionProcesses({ platform: "linux", readDir, readFile, owner })).toEqual([]);
  for (candidate of ["20", "30", null]) {
    expect(() => completionProcesses({ platform: "linux", readDir, readFile, owner })).toThrow("completion metadata unavailable");
  }
  expect(() => completionProcesses({ platform: "linux", readDir, readFile, owner: { ...owner, identity: "old-incarnation" } })).toThrow(
    "owner identity unavailable",
  );
  expect(() => completionProcesses({ platform: "linux", readDir, readFile, owner: { ...owner, pid: process.pid + 1 } })).toThrow("owner identity unavailable");
});

test("completion distinguishes absent, zombie, reused identity and unreadable process metadata", () => {
  const stat = (state: string, identity: string): string => `42 (nested ) name) ${state} ${Array.from({ length: 18 }, () => "0").join(" ")} ${identity} 0`;
  expect(processCompletion(42, { platform: "linux", readFile: () => stat("S", "123") })).toEqual({ kind: "live", identity: "123" });
  expect(processCompletion(42, { platform: "linux", readFile: () => stat("Z", "123") })).toEqual({ kind: "zombie", identity: "123" });
  expect(processCompletion(42, { platform: "linux", readFile: () => stat("S", "456") })).toEqual({ kind: "live", identity: "456" });
  expect(
    processCompletion(42, {
      platform: "linux",
      readFile: () => {
        throw Object.assign(new Error("gone"), { code: "ENOENT" });
      },
    }),
  ).toEqual({ kind: "gone" });
  for (const readFile of [
    (): null => null,
    (): string => "malformed",
    (): never => {
      throw Object.assign(new Error("hidden"), { code: "EACCES" });
    },
  ]) {
    expect(processCompletion(42, { platform: "linux", readFile })).toEqual({ kind: "unknown" });
  }
  expect(processCompletion(42, { platform: "win32" })).toEqual({ kind: "unknown" });
  expect(() =>
    completionProcesses({
      platform: "linux",
      readDir: () => {
        throw new Error("unreadable table");
      },
    }),
  ).toThrow("unreadable table");
});

test.skipIf(process.platform !== "linux")("completion inventory refuses hidden possible owners without refusing positively foreign users", () => {
  const userId = process.getuid?.();
  if (userId === undefined) {
    throw new Error("Linux completion control requires a native user identity");
  }
  const readDir = (): readonly string[] => ["42"];
  const readFile = (path: string): string | null => (path.endsWith("/status") ? `Uid:\t${userId}\t${userId}\t${userId}\t${userId}\nPPid:\t1\n` : null);
  expect(() => completionProcesses({ platform: "linux", readDir, readFile })).toThrow("completion metadata unavailable");
  expect(
    completionProcesses({
      platform: "linux",
      readDir,
      readFile: (path) => (path.endsWith("/status") ? `Uid:\t${userId + 1}\t${userId + 1}\t${userId + 1}\t${userId + 1}\nPPid:\t1\n` : null),
    }),
  ).toEqual([]);
  expect(() => completionProcesses({ platform: "linux", readDir, readFile: () => null })).toThrow("completion metadata unavailable");
});

test.skipIf(process.platform !== "linux")("completion inventory accepts unreadable zombie metadata only after a positive terminal state", () => {
  const userId = process.getuid?.();
  const stat = (phase: string, birth: string): string => `42 (native) ${phase} ${Array.from({ length: 18 }, () => "0").join(" ")} ${birth} 0`;
  const owner = { pid: process.pid, identity: "20" };
  let state = "S";
  let identity = "30";
  let metadataFailure: string | null = "EACCES";
  let statFailure: string | null = null;
  const readFile = (path: string): string | null => {
    if (path === `/proc/${process.pid}/stat`) {
      return stat("S", owner.identity);
    }
    if (path.endsWith("/stat")) {
      if (statFailure !== null) {
        throw Object.assign(new Error("unavailable native state"), { code: statFailure });
      }
      return stat(state, identity);
    }
    if (path.endsWith("/status")) {
      return `Uid:\t${userId}\t${userId}\t${userId}\t${userId}\nPPid:\t1\n`;
    }
    if (path.endsWith("/environ")) {
      if (metadataFailure !== null) {
        throw Object.assign(new Error("unavailable native environment"), { code: metadataFailure });
      }
      return null;
    }
    return "";
  };
  const read = (): ReturnType<typeof completionProcesses> => completionProcesses({ platform: "linux", owner, readDir: () => ["42"], readFile });
  for (metadataFailure of ["EACCES", "EPERM", "EIO", null]) {
    state = "S";
    identity = "30";
    expect(read).toThrow("completion metadata unavailable: /proc/42/environ");
    identity = "31";
    expect(read).toThrow("completion metadata unavailable: /proc/42/environ");
    for (state of ["Z", "X"]) {
      expect(read()).toEqual([{ pid: 42, ppid: 1, cmdline: "", environ: null, cpuMs: 0 }]);
    }
    for (statFailure of ["EACCES", "EPERM", "EIO"]) {
      expect(read).toThrow("completion metadata unavailable: /proc/42/environ");
    }
    statFailure = "ENOENT";
    expect(read()).toEqual([{ pid: 42, ppid: 1, cmdline: "", environ: null, cpuMs: null }]);
    statFailure = null;
  }
});

test.skipIf(process.platform !== "linux")("completion refusals retain sanitized decision-time reads without environment or raw error contents", () => {
  const userId = process.getuid?.();
  if (userId === undefined) {
    throw new Error("Linux completion diagnostics require a native user identity");
  }
  const privateText = "PRIVATE_ENVIRONMENT_OR_ERROR_CONTENT";
  const stat = (birth: string): string => `42 (${privateText}) S ${Array.from({ length: 18 }, () => "0").join(" ")} ${birth} 0`;
  let metadataCode = "EACCES";
  let statCode: string | null = null;
  let statusCode: string | null = null;
  const readFile = (path: string): string | null => {
    if (path === `/proc/${process.pid}/stat`) {
      return stat("20");
    }
    if (path.endsWith("/stat")) {
      if (statCode !== null) {
        throw Object.assign(new Error(privateText), { code: statCode });
      }
      return stat("30");
    }
    if (path.endsWith("/status")) {
      if (statusCode !== null) {
        throw Object.assign(new Error(privateText), { code: statusCode });
      }
      return `Name:\t${privateText}\nUid:\t${userId}\t${userId}\t${userId}\t${userId}\nPPid:\t1\n`;
    }
    if (path.endsWith("/environ")) {
      throw Object.assign(new Error(privateText), { code: metadataCode });
    }
    return "";
  };
  const message = (): string => {
    try {
      completionProcesses({ platform: "linux", owner: { pid: process.pid, identity: "20" }, readDir: () => ["42"], readFile });
    } catch (error) {
      if (error instanceof Error) {
        return error.message;
      }
      throw error;
    }
    throw new Error("inaccessible possible ownership must still refuse");
  };
  const live = message();
  expect(live).not.toContain(privateText);
  expect(live).toContain('"metadataRead":"EACCES"');
  expect(live).toContain(`"owner":{"pid":${process.pid},"startTicks":"20"}`);
  expect(live).toContain('"candidate":{"kind":"live","state":"S","startTicks":"30","statRead":"read"}');
  expect(live).toContain('"statusRead":"read"');
  expect(live).toContain(`"uids":{"real":${userId},"effective":${userId},"saved":${userId},"filesystem":${userId}}`);
  statCode = "EACCES";
  statusCode = "EPERM";
  const inaccessible = message();
  expect(inaccessible).not.toContain(privateText);
  expect(inaccessible).toContain('"metadataRead":"EPERM"');
  expect(inaccessible).toContain('"candidate":{"kind":"unknown","state":null,"startTicks":null,"statRead":"EACCES"}');
  expect(inaccessible).toContain('"statusRead":"EPERM"');
  expect(inaccessible).toContain('"uids":null');
  statCode = null;
  statusCode = null;
  metadataCode = privateText;
  const unclassified = message();
  expect(unclassified).not.toContain(privateText);
  expect(unclassified).toContain('"metadataRead":"unclassified-error"');
});

test.skipIf(process.platform !== "linux")("an unreadable-environ process is skipped only when its parent is alive, readable and unmarked", () => {
  const userId = process.getuid?.();
  const marker = "4242-1700000000000-abcd1234";
  const stat = (birth: string): string => `1 (x) S ${Array.from({ length: 18 }, () => "0").join(" ")} ${birth} 0`;
  const denied = (): never => {
    throw Object.assign(new Error("denied"), { code: "EACCES" });
  };
  const parent = { stat: stat("10") as string | null, environ: "A=b\0", cmdline: "ssh\0host", deny: false };
  const files = (path: string): string | null => {
    const table: Record<string, () => string | null> = {
      [`/proc/${process.pid}/stat`]: () => stat("20"),
      "/proc/42/stat": () => stat("30"),
      "/proc/42/status": () => `Name:\tzygote\nUid:\t${userId}\t${userId}\t${userId}\t${userId}\nPPid:\t7\n`,
      "/proc/42/cmdline": () => "zygote\0",
      "/proc/42/environ": denied,
      "/proc/7/stat": () => parent.stat,
      "/proc/7/status": () => (parent.stat === null ? null : "Name:\tchrome\nPPid:\t1\n"),
      "/proc/7/environ": () => (parent.deny ? denied() : parent.environ),
      "/proc/7/cmdline": () => parent.cmdline,
    };
    return table[path]?.() ?? null;
  };
  const read = (withMarker = true): ReturnType<typeof completionProcesses> =>
    completionProcesses({
      platform: "linux",
      owner: { pid: process.pid, identity: "20" },
      readDir: () => ["42"],
      readFile: files,
      ...(withMarker ? { marker } : {}),
    });

  expect(read()).toEqual([{ pid: 42, ppid: 7, cmdline: "zygote", environ: null, cpuMs: 0 }]);

  parent.deny = true;
  expect(read).toThrow("process 42 (zygote) parent 7 (chrome)");
  parent.deny = false;
  parent.environ = `ORB_RUN_MARKER=${marker}\0`;
  expect(read).toThrow("parent 7 (chrome)");
  parent.environ = "";
  parent.cmdline = `chrome\0--orb-run-marker=${marker}`;
  expect(read).toThrow("parent 7 (chrome)");
  parent.cmdline = "ssh";
  parent.environ = "A=b\0";
  parent.stat = null;
  expect(read).toThrow("process 42 (zygote) parent 7 (?)");
  parent.stat = stat("10");
  expect(() => read(false)).toThrow("process 42 (zygote) parent 7 (chrome)");
});
