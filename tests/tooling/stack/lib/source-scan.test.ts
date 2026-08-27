import type * as Fs from "node:fs";
import { vi } from "vitest";
import { expect, test } from "../../../support/tool-fixtures.ts";

const fault = vi.hoisted(() => ({ kind: "" as "" | "readdir" | "stat" }));

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof Fs>();
  return {
    ...real,
    readdirSync: (path: Parameters<typeof real.readdirSync>[0], options: Parameters<typeof real.readdirSync>[1]) => {
      if (String(path) === "/planted-unreadable") {
        const code = fault.kind === "readdir" ? "EACCES" : "ENOTDIR";
        throw Object.assign(new Error(`planted ${code} source failure`), { code });
      }
      return (real.readdirSync as (...args: unknown[]) => unknown)(path, options);
    },
    statSync: (path: Parameters<typeof real.statSync>[0], options?: Parameters<typeof real.statSync>[1]) => {
      if (String(path) === "/planted-unreadable" && fault.kind === "stat") {
        throw Object.assign(new Error("planted EIO source failure"), { code: "EIO" });
      }
      return (real.statSync as (...args: unknown[]) => unknown)(path, options);
    },
  };
});

const { newestSourceEntries } = await import("../../../../tooling/src/stack/lib/source-scan.ts");

test("an unreadable source directory fails loud instead of fabricating a partial newest-source time", () => {
  fault.kind = "readdir";
  expect(() => newestSourceEntries(["/planted-unreadable"])).toThrow("planted EACCES source failure");
});

test("an unreadable source file fails loud instead of disappearing from freshness evidence", () => {
  fault.kind = "stat";
  expect(() => newestSourceEntries(["/planted-unreadable"])).toThrow("planted EIO source failure");
});
