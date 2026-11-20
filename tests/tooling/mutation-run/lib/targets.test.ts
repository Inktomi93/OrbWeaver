import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { EXIT } from "@orb/tooling/floor/cli/exit-contract";
import { UsageError } from "@orb/tooling/floor/cli/run-tool";
import type { HotspotRow, MutationTarget } from "@orb/tooling/mutation-run";
import {
  aggregateExit,
  CANDIDATE_SORTS,
  checkTargets,
  compareCandidates,
  findTargetTests,
  parseTargetArgs,
  rankCandidates,
  readTestCorpus,
  selectTargets,
} from "@orb/tooling/mutation-run";

const DICE = "packages/kit/src/dice/index.ts";
const ROLL = "packages/kit/src/dice/roll.ts";
const LONELY = "packages/kit/src/lonely/index.ts";
const HOLLOW = "packages/kit/src/hollow/index.ts";
const DOOR = "packages/kit/src/door/index.ts";
const DICE_TEST = "tests/kit/dice/dice.test.ts";

function plant(root: string, files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

function plantTree(root: string): void {
  plant(root, {
    [DICE]: "",
    [ROLL]: "",
    [LONELY]: "",
    [HOLLOW]: "",
    [DOOR]: "",
    "packages/kit/src/nowhere/index.ts": "",
    "packages/kit/src/dice/notes.md": "",
    "packages/kit/package.json": JSON.stringify({ name: "@orb/kit", exports: { "./door": "./src/door/index.ts" } }),
    [DICE_TEST]: "",
    "tests/kit/hollow/notes.md": "",
    // Outside the mirror: a suite that names its subject, a test that imports by path, one through the package door.
    "tests/kit/suite/rolls.suite.int.test.ts": `// @subject ${ROLL}\n`,
    "tests/kit/other/lonely.test.ts": 'import { x } from "../../../packages/kit/src/lonely/index.ts";\n',
    "tests/kit/other/door.test.ts": 'import { y } from "@orb/kit/door";\n',
    // None can kill a mutant in a mutation run: a component test, a tooling test and a semantic-corpus suite.
    "tests/kit/suite/rolls.suite.corpus.int.test.ts": `// @subject ${ROLL}\n`,
    "tests/kit/other/door.ct.tsx": 'import { y } from "@orb/kit/door";\n',
    "tests/tooling/dice/lonely.test.ts": `// @subject ${LONELY}\n`,
  });
}

function refusalLines(run: () => unknown): readonly string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof UsageError) {
      return error.message.split("\n");
    }
    throw error;
  }
  throw new Error("expected a refusal");
}

function target(file: string, tests?: readonly string[]): MutationTarget {
  return { file, reason: "planted", ...(tests === undefined ? {} : { tests }) };
}

test("each bad target is refused by name before any run, in one refusal", ({ scratch }) => {
  plantTree(scratch);
  const bad = [
    target("packages/kit/src/dice/absent.ts"),
    target("packages/kit/src/dice/notes.md"),
    target("packages/kit/src/nowhere/index.ts"),
    target(HOLLOW),
    target(DICE, ["tests/kit/gone/*.test.ts"]),
    target(DICE),
  ];
  expect(refusalLines(() => checkTargets(bad, scratch, readTestCorpus(scratch)))).toEqual([
    "packages/kit/src/dice/absent.ts is not a file",
    "packages/kit/src/dice/notes.md is not TypeScript source",
    expect.stringMatching(/^no test directory mirrors packages\/kit\/src\/nowhere\/index\.ts/u),
    `${HOLLOW}: no test reaches it through its mirror, an @subject header or an import; name its tests`,
    `${DICE}: its named tests tests/kit/gone/*.test.ts match no Vitest file`,
    `${DICE}: listed twice`,
  ]);
});

test("a good target runs against its mirror plus the suites that name it, through the runner's --tests", ({ scratch }) => {
  plantTree(scratch);
  const [dice, roll] = checkTargets([target(DICE), target(ROLL)], scratch, readTestCorpus(scratch));
  expect(dice?.plan).toEqual({ files: [DICE], tests: [DICE_TEST] });
  expect(roll?.found).toEqual({ sources: ["mirror", "subject"], tests: [DICE_TEST, "tests/kit/suite/rolls.suite.int.test.ts"] });
});

test("an importer counts only when no mirror test or subject header exists, and never a component or tooling test", ({ scratch }) => {
  plantTree(scratch);
  const corpus = readTestCorpus(scratch);
  expect(findTargetTests(LONELY, corpus, scratch)).toEqual({ sources: ["import"], tests: ["tests/kit/other/lonely.test.ts"] });
  expect(findTargetTests(DOOR, corpus, scratch)).toEqual({ sources: ["import"], tests: ["tests/kit/other/door.test.ts"] });
  expect(findTargetTests(HOLLOW, corpus, scratch)).toBeNull();
});

test("named tests replace the lookup, and a glob counts when it matches a Vitest file", ({ scratch }) => {
  plantTree(scratch);
  const [hollow] = checkTargets([target(HOLLOW, ["tests/kit/other/*.test.ts"])], scratch, readTestCorpus(scratch));
  expect(hollow?.plan.tests).toEqual(["tests/kit/other/*.test.ts"]);
});

test("a path part keeps the targets that contain it, and a part that keeps none is refused by name", () => {
  const targets = [target(DICE), target(ROLL), target(LONELY)];
  expect(selectTargets(targets, ["dice/"]).map(({ file }) => file)).toEqual([DICE, ROLL]);
  expect(selectTargets(targets, [])).toBe(targets);
  expect(() => selectTargets(targets, ["dice/", "ghost"])).toThrow(/^ghost matches no target$/mu);
  expect(() => selectTargets([], [])).toThrow(UsageError);
});

test("--candidates takes no path part, and one mode at a time", () => {
  expect(parseTargetArgs(["--list", "dice"])).toEqual({ mode: "list", filters: ["dice"] });
  expect(() => parseTargetArgs(["--candidates", "dice"])).toThrow(UsageError);
  expect(() => parseTargetArgs(["--list", "--candidates"])).toThrow(UsageError);
});

test.for([
  [[EXIT.clean, EXIT.clean], true, EXIT.clean],
  [[EXIT.clean, EXIT.violations], true, EXIT.violations],
  [[EXIT.violations, EXIT.toolError, EXIT.clean], true, EXIT.toolError],
  [[EXIT.clean, EXIT.misuse], true, EXIT.toolError],
  [[EXIT.clean], false, EXIT.toolError],
] as const)("targets exiting %j, complete %s, exit the pass %i", ([exits, complete, expected]) => {
  expect(aggregateExit(exits, complete)).toBe(expected);
});

function rows(...paths: readonly string[]): readonly HotspotRow[] {
  return paths.map((path) => ({ path }));
}

test("a candidate ranks in three sorts, by summed position with a missing sort past the end, and drops non-logic files", () => {
  const a = "packages/server/src/a.ts";
  const b = "packages/server/src/b.ts";
  const two = "packages/server/src/two-sorts.ts";
  const dropped = ["packages/client/src/view.tsx", "packages/server/src/lib/index.ts", "packages/server/src/x/contract/c.ts", "packages/contracts/src/w.ts"];
  const sorts: Partial<Record<(typeof CANDIDATE_SORTS)[number], readonly HotspotRow[]>> = {
    defect: rows(...dropped, b, a, two),
    hot: rows(a, b, two),
    fix: rows(a, b),
  };
  const rankings = Object.fromEntries(CANDIDATE_SORTS.map((sort) => [sort, sorts[sort] ?? rows(...dropped)]));
  const ranked = rankCandidates(rankings as Parameters<typeof rankCandidates>[0]);
  expect(ranked.map(({ path }) => path)).toEqual([a, b]);
  // a: positions 6, 1, 1 and three missing sorts at 151.
  expect(ranked[0]?.rank).toBe(6 + 1 + 1 + 3 * 151);
  expect(compareCandidates(ranked, [b, "packages/server/src/gone.ts"])).toEqual({ missing: [ranked[0]], unranked: ["packages/server/src/gone.ts"] });
});
