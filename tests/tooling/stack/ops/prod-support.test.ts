import type { Stats } from "node:fs";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { vi } from "vitest";
import { PIDFILE, TOKEN_PATH } from "../../../../tooling/src/stack/ops/prod-state.ts";
import { debugToken, distVerdict, removePidfile } from "../../../../tooling/src/stack/ops/prod-support.ts";

test("an unreadable dist witness fails loud instead of classifying an unmeasurable build as fresh", ({ scratch }) => {
  const dist = join(scratch, "packages/client/dist/index.html");
  mkdirSync(join(scratch, "packages/client/dist"), { recursive: true });
  expect(distVerdict(scratch).state).toBe("missing");
  writeFileSync(dist, "built");
  const failure = Object.assign(new Error("planted distribution stat failure"), { code: "EIO" });
  let refused = false;
  const readStat = (path: string): Stats => {
    expect(path).toBe(dist);
    if (refused) {
      throw failure;
    }
    return statSync(path);
  };
  expect(distVerdict(scratch, readStat).state).toBe("fresh");
  refused = true;
  expect(() => distVerdict(scratch, readStat)).toThrow(failure);
  expect(readFileSync(dist, "utf8")).toBe("built");
});

test("an unreadable existing debug token fails loud instead of overwriting the mint-once credential", ({ scratch }) => {
  vi.stubEnv("STACK_RUN_DIR", scratch);
  const path = join(scratch, "debug-token");
  expect(TOKEN_PATH()).toBe(path);
  writeFileSync(path, "planted-token\n");
  expect(debugToken() === "planted-token").toBe(true);
  rmSync(path);
  mkdirSync(path);
  expect(() => debugToken()).toThrow(/EISDIR/u);
  expect(statSync(path).isDirectory()).toBe(true);
});

test("pidfile cleanup ignores absence only and surfaces an unlink failure", ({ scratch }) => {
  vi.stubEnv("STACK_RUN_DIR", scratch);
  const path = join(scratch, "prod.json");
  expect(PIDFILE()).toBe(path);
  expect(() => removePidfile()).not.toThrow();
  writeFileSync(path, "record");
  removePidfile();
  expect(existsSync(path)).toBe(false);
  mkdirSync(path);
  expect(() => removePidfile()).toThrow();
  expect(existsSync(path)).toBe(true);
});
