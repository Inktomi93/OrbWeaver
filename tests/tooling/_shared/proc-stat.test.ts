import { spawn } from "node:child_process";
import type * as Fs from "node:fs";
import process from "node:process";
import { vi } from "vitest";
import { expect, test } from "../../support/tool-fixtures.ts";

const PLANTED_PID = 123;
const fileError = vi.hoisted(() => ({ code: "ENOENT" }));
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof Fs>();
  return {
    ...real,
    readFileSync: (path: Parameters<typeof real.readFileSync>[0], options?: Parameters<typeof real.readFileSync>[1]) => {
      if (String(path) === "/proc/123/stat") {
        throw Object.assign(new Error(`planted ${fileError.code} file failure`), { code: fileError.code });
      }
      return (real.readFileSync as (...args: unknown[]) => unknown)(path, options);
    },
  };
});

const { parseProcStartTicks, procStartTicks } = await import("../../../tooling/src/_shared/proc-stat.ts");

test("/proc start-ticks parse past a comm field containing spaces and parens", () => {
  const fields = Array.from({ length: 30 }, (_, i) => String(i + 100));
  // pid (comm) state ppid … — starttime is field 22, i.e. index 19 of the post-comm remainder.
  const stat = `4242 (node (weird) x) S ${fields.join(" ")}`;
  expect(parseProcStartTicks(stat)).toBe(String(100 + 18));
  expect(parseProcStartTicks("garbage with no paren")).toBeNull();
});

test("only a vanished proc stat is absence; unreadable identity evidence fails loud", () => {
  fileError.code = "ENOENT";
  expect(procStartTicks(PLANTED_PID)).toBeNull();
  fileError.code = "EIO";
  expect(() => procStartTicks(PLANTED_PID)).toThrow("planted EIO file failure");
});

test("a process reads the same start ticks every time, and a later process reads different ones", () => {
  const mine = procStartTicks(process.pid);
  expect(mine, "this process has a /proc entry").toMatch(/^\d+$/u);
  expect(procStartTicks(process.pid), "the same process always reads the same ticks").toBe(mine);
  const child = spawn("sleep", ["30"], { stdio: "ignore" });
  try {
    expect(procStartTicks(child.pid ?? 0), "a process started later is told apart by its ticks").not.toBe(mine);
  } finally {
    child.kill();
  }
});
