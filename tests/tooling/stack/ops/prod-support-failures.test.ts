import type * as Fs from "node:fs";
import { vi } from "vitest";
import { expect, test } from "../../../support/tool-fixtures.ts";

const fsFailure = vi.hoisted(() => ({ code: "", operation: "none" }));

vi.mock("../../../../tooling/src/stack/lib/source-scan.ts", () => ({
  newestSourceEntries: () => [{ path: "/source.ts", mtimeMs: 1 }],
}));

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof Fs>();
  return {
    ...real,
    mkdirSync: (...args: Parameters<typeof real.mkdirSync>) => (fsFailure.operation === "read" ? undefined : real.mkdirSync(...args)),
    writeFileSync: (...args: Parameters<typeof real.writeFileSync>) => (fsFailure.operation === "read" ? undefined : real.writeFileSync(...args)),
    readFileSync: (...args: Parameters<typeof real.readFileSync>) => {
      if (fsFailure.operation === "read") {
        throw Object.assign(new Error(`planted ${fsFailure.code} token failure`), { code: fsFailure.code });
      }
      return (real.readFileSync as (...inner: unknown[]) => unknown)(...args);
    },
    unlinkSync: (...args: Parameters<typeof real.unlinkSync>) => {
      if (fsFailure.operation === "unlink") {
        throw Object.assign(new Error(`planted ${fsFailure.code} pidfile failure`), { code: fsFailure.code });
      }
      return real.unlinkSync(...args);
    },
    statSync: (path: Parameters<typeof real.statSync>[0], options?: Parameters<typeof real.statSync>[1]) => {
      if (String(path).endsWith("/packages/client/dist/index.html")) {
        throw Object.assign(new Error("planted EIO dist failure"), { code: "EIO" });
      }
      return (real.statSync as (...args: unknown[]) => unknown)(path, options);
    },
  };
});

const { debugToken, distVerdict, removePidfile } = await import("../../../../tooling/src/stack/ops/prod-support.ts");

test("an unreadable dist witness fails loud instead of classifying an unmeasurable build as fresh", () => {
  expect(() => distVerdict()).toThrow("planted EIO dist failure");
});

test("an unreadable existing debug token fails loud instead of overwriting the mint-once credential", () => {
  fsFailure.operation = "read";
  fsFailure.code = "EIO";
  expect(() => debugToken()).toThrow("planted EIO token failure");
  fsFailure.operation = "none";
});

test("pidfile cleanup ignores absence only and surfaces an unlink failure", () => {
  fsFailure.operation = "unlink";
  fsFailure.code = "ENOENT";
  expect(() => removePidfile()).not.toThrow();
  fsFailure.code = "EIO";
  expect(() => removePidfile()).toThrow("planted EIO pidfile failure");
  fsFailure.operation = "none";
});
