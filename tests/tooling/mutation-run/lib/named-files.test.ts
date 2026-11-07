import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { UsageError } from "@orb/tooling/floor/cli/run-tool";
import { planMutationRun } from "@orb/tooling/mutation-run";

function plantSource(root: string): void {
  mkdirSync(join(root, "packages", "kit", "src", "dice"), { recursive: true });
  mkdirSync(join(root, "packages", "kit", "src", "lonely"), { recursive: true });
  mkdirSync(join(root, "tests", "kit", "dice"), { recursive: true });
  mkdirSync(join(root, "tooling"));
  for (const name of ["dice/index.ts", "dice/index.test.ts", "dice/types.d.ts", "dice/notes.md", "lonely/index.ts"]) {
    writeFileSync(join(root, "packages", "kit", "src", name), "");
  }
  writeFileSync(join(root, "tooling", "index.ts"), "");
}

const DICE = "packages/kit/src/dice/index.ts";
const DICE_TESTS = "tests/kit/dice/**/*.test.ts";

test("an exact source file runs against its mirror directory", ({ scratch }) => {
  plantSource(scratch);
  expect(planMutationRun([DICE, join(scratch, DICE)], scratch)).toEqual({ files: [DICE, DICE], tests: [DICE_TESTS] });
});

test("--tests replaces the mirror, which a file with no mirror needs", ({ scratch }) => {
  plantSource(scratch);
  const lonely = "packages/kit/src/lonely/index.ts";
  expect(() => planMutationRun([lonely], scratch)).toThrow(/no test directory mirrors/u);
  expect(planMutationRun([lonely, "--tests", "tests/kit/dice/a.test.ts"], scratch).tests).toEqual(["tests/kit/dice/a.test.ts"]);
});

test.for([
  ["packages/kit/src/**/*.ts", /pattern/u],
  [`${DICE},other.ts`, /pattern/u],
  ["packages/kit/src/dice", /not a file/u],
  ["packages/kit/src/absent.ts", /not a file/u],
  ["packages/kit/src/dice/notes.md", /not TypeScript/u],
  ["packages/kit/src/dice/types.d.ts", /not TypeScript/u],
  ["packages/kit/src/dice/index.test.ts", /is a test/u],
  ["../outside.ts", /outside/u],
  ["tooling/index.ts", /not package source/u],
] as const)("%s is refused, so a broad run cannot be spelled", ([path, reason], { scratch }) => {
  plantSource(scratch);
  expect(() => planMutationRun([DICE, path], scratch)).toThrow(reason);
});

test("no files, or a bare --tests, is misuse and never Stryker's default of every source file", ({ scratch }) => {
  plantSource(scratch);
  expect(() => planMutationRun([], scratch)).toThrow(UsageError);
  expect(() => planMutationRun(["--tests", DICE_TESTS], scratch)).toThrow(UsageError);
  expect(() => planMutationRun([DICE, "--tests"], scratch)).toThrow(UsageError);
});
