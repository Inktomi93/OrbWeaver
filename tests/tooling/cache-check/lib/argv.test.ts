import { CACHE_CASES, CACHE_ROUTES, parseCacheCheckArgs } from "@orb/tooling/cache-check";
import { UsageError } from "../../../../tooling/src/_shared/run-tool.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("no flags runs every case on the default routes, on a stage at HEAD; agent-sdk runs only when named", () => {
  expect(parseCacheCheckArgs([])).toEqual({ routes: ["direct", "openrouter"], cases: CACHE_CASES, ref: "HEAD", dirty: false });
  expect(parseCacheCheckArgs(["--routes=agent-sdk"]).routes).toEqual(["agent-sdk"]);
  expect(CACHE_ROUTES).toContain("agent-sdk");
});

test("subsets, a ref and the working-tree stage parse", () => {
  expect(parseCacheCheckArgs(["--routes=openrouter,direct", "--cases=group", "--ref=abc123"])).toEqual({
    routes: ["openrouter", "direct"],
    cases: ["group"],
    ref: "abc123",
    dirty: false,
  });
  expect(parseCacheCheckArgs(["--dirty"])).toMatchObject({ dirty: true, ref: "HEAD" });
});

test.each([
  ["an unknown route", ["--routes=direct,bedrock"], 'unknown value "bedrock"'],
  ["an unknown case", ["--cases=swipe"], 'unknown value "swipe"'],
  ["an empty list", ["--routes="], "needs at least one value"],
  ["a bare value flag", ["--routes"], "unknown or malformed"],
  ["a valued bare flag", ["--dirty=yes"], "unknown or malformed"],
  ["an empty ref", ["--ref="], "unknown or malformed"],
  ["an unknown flag", ["--floor=0.5"], "unknown or malformed"],
  ["a ref with the working tree", ["--dirty", "--ref=HEAD"], "pass one"],
] as const)("%s is misuse", (_label, argv, message) => {
  expect(() => parseCacheCheckArgs(argv)).toThrow(UsageError);
  expect(() => parseCacheCheckArgs(argv)).toThrow(message);
});
