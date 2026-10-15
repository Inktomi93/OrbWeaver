// @subject tooling/src/floor/host/platform.ts
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
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
