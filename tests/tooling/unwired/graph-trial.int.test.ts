// graph-trial deletes each finding of the named buckets in a throwaway snapshot: the delete removes the whole member,
// property or declaration, an error the removal adds in a file that imports it names its reader, only the declaring
// file and its importers are checked, and TypeScript's unused-code diagnostics are diffed against the graph.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { EXIT } from "../../../tooling/src/floor/cli/exit-contract.ts";
import type { TrialReport } from "../../../tooling/src/unwired/index.ts";
import { trialGraph } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphTree } from "./_planted.ts";

const LIB = `${GRAPH_SOURCE}/lib.ts`;
const MAIN = `${GRAPH_SOURCE}/main.ts`;
const SHAPE = `${GRAPH_SOURCE}/shape.ts`;
const OTHER = `${GRAPH_SOURCE}/other.ts`;

const outcomes = (report: TrialReport): readonly (readonly string[])[] => report.trials.map(({ label, verdict, removed }) => [label, verdict, removed.trim()]);

test("a delete removes a whole interface member, class member or literal method with its comma", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree(
      {
        [MAIN]: [
          'import { Box, read, table } from "./lib.ts";',
          "const use = (value: unknown): unknown => value;",
          "use(new Box().kept);",
          'use(read({ kept: "k", last: 1 }));',
          "use(table.first());",
        ].join("\n"),
        [LIB]: [
          "export interface Shape { readonly kept: string; readonly gone?: string; readonly last: number }",
          "export const read = (shape: Shape): string => shape.kept + String(shape.last);",
          "export class Box {",
          "  kept = 1;",
          "  written = 3;",
          "}",
          "export const table = { first(): number { return 1; }, middle(): number { return 2; }, last(): number { return 3; } };",
        ].join("\n"),
      },
      { entries: [MAIN] },
    ),
  );
  const report = await trialGraph(root, ["member-untouched", "member-write-only"], () => undefined);
  expect(outcomes(report)).toEqual([
    [`${LIB}:Shape.gone`, "confirmed", "readonly gone?: string;"],
    [`${LIB}:table.middle`, "confirmed", "middle(): number { return 2; },"],
    [`${LIB}:table.last`, "confirmed", ", last(): number { return 3; }"],
    [`${LIB}:Box.written`, "confirmed", "written = 3;"],
  ]);
});

test("a delete removes a dead exported function's whole statement", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree(
      {
        [MAIN]: ['import { run } from "./lib.ts";', "run();"].join("\n"),
        [LIB]: ["export function run(): number { return 1; }", "/** Nothing calls this. */", "export function orphan(): number { return 2; }"].join("\n"),
      },
      { entries: [MAIN] },
    ),
  );
  const report = await trialGraph(root, ["dead"], () => undefined);
  expect(outcomes(report)).toEqual([[`${LIB}:orphan`, "confirmed", "/** Nothing calls this. */\nexport function orphan(): number { return 2; }"]]);
});

const READER_TREE = (lib: string): Record<string, string> => ({
  [MAIN]: ['import type { Shape } from "./shape.ts";', "const use = (value: number): number => value;", "const shape: Shape = { a: 1 };", "use(shape.a);"].join(
    "\n",
  ),
  [SHAPE]: ['import { DEFAULTS } from "./lib.ts";', "", "export type Shape = typeof DEFAULTS;"].join("\n"),
  [LIB]: lib,
  [OTHER]: "export const alone = 1;",
});

// The import's error sits on line 1 either way: on the specifier when the module keeps another export, on the module
// when the delete took its last one. The reader is the use on line 3.
test.for([
  { left: "another export", lib: ["export const DEFAULTS = { a: 1 };", "export const SPARE = 2;"].join("\n") },
  { left: "no export", lib: "export const DEFAULTS = { a: 1 };" },
])(
  "a type reader the delete breaks refutes the finding at its line when the module keeps $left; only the declaring file and its importers are checked",
  { timeout: 120_000 },
  async ({ lib }, { plantedTree }) => {
    const root = await plantedTree(graphTree(READER_TREE(lib), { entries: [MAIN] }));
    const report = await trialGraph(root, ["type-only"], () => undefined);
    expect(
      report.trials.map(({ label, verdict, checked, errors }) => ({ label, verdict, checked, errors: errors.map(({ at, kind }) => `${at} ${kind}`) })),
    ).toEqual([{ label: `${LIB}:DEFAULTS`, verdict: "refuted", checked: [LIB, MAIN, SHAPE], errors: [`${SHAPE}:3 read`] }]);
  },
);

test("pnpm unwired graph-trial takes each --bucket, prints each refuting error and tallies every bucket and the control", { timeout: 120_000 }, async ({
  plantedTree,
  runCli,
  scratch,
}) => {
  const root = await plantedTree(graphTree(READER_TREE(["export const DEFAULTS = { a: 1 };", "export const SPARE = 2;"].join("\n")), { entries: [MAIN] }));
  const run = await runCli("unwired", ["graph-trial", "--bucket=type-only", "--bucket=dead", `--root=${root}`, `--out=${join(scratch, "trial.json")}`]);
  await expect(run).toExitWith(EXIT.clean);
  expect(run.stdout.split("\n").filter((line) => !line.startsWith("control-") && line !== "")).toEqual([
    `refuted\ttype-only\t${LIB}:DEFAULTS\t${SHAPE}:3 TS2305 read`,
  ]);
  const tallies = run.stderr.split("\n").filter((line) => line.includes(" trials="));
  expect(tallies).toEqual([
    "type-only trials=1 confirmed=0 named-only=0 refuted=1 unresolved=0",
    expect.stringMatching(/^dead trials=\d+ confirmed=\d+ named-only=0 refuted=0 unresolved=0$/u),
  ]);
});

test.for([
  { refusal: "no bucket", argv: [] },
  { refusal: "a bucket no delete can trial", argv: ["--bucket=kept-by-ruling"] },
])("pnpm unwired graph-trial refuses $refusal before any build", async ({ argv }, { runCli, scratch }) => {
  const run = await runCli("unwired", ["graph-trial", ...argv, `--root=${scratch}`]);
  await expect(run).toExitWith(EXIT.misuse);
});

// The base error sits after the cut in the edited file, so it moves by the cut's length and must still match.
test("an error the base program already has is not the removal's", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree(
      {
        [MAIN]: ['import { run } from "./lib.ts";', "run();"].join("\n"),
        [LIB]: ["export function orphan(): number { return 2; }", "export function run(): number { return 1; }", 'export const broken: number = "x";'].join(
          "\n",
        ),
      },
      { entries: [MAIN] },
    ),
  );
  const report = await trialGraph(root, ["dead"], () => undefined);
  expect(report.trials.filter(({ label }) => label === `${LIB}:orphan`).map(({ verdict, errors }) => [verdict, errors])).toEqual([["confirmed", []]]);
});

test("a write-only member's own literal write leaves it named-only, not refuted", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      [LIB]: [
        "export interface A { readonly x: string; readonly a: string }",
        'export const made: A = { x: "1", a: "1" };',
        "export const xOf = (value: A): string => value.x;",
      ].join("\n"),
    }),
  );
  const report = await trialGraph(root, ["member-write-only"], () => undefined);
  expect(report.trials.map(({ label, verdict, errors }) => [label, verdict, errors.map(({ at, kind }) => `${at} ${kind}`)])).toEqual([
    [`${LIB}:A.a`, "named-only", [`${LIB}:2 write`]],
  ]);
});

test("the control lists where TypeScript's unused-code diagnostics and the graph's dead units and private members disagree", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const root = await plantedTree(
    graphTree(
      {
        [MAIN]: ['import { Counter } from "./lib.ts";', "const use = (value: number): number => value;", "use(new Counter().count());"].join("\n"),
        [LIB]: [
          "function unusedHelper(): number { return chained(); }",
          "function chained(): number { return 1; }",
          "export class Counter {",
          "  #spare = 0;",
          "  count(): number {",
          "    const unusedLocal = 2;",
          "    return 1;",
          "  }",
          "}",
        ].join("\n"),
      },
      { entries: [MAIN] },
    ),
  );
  const report = await trialGraph(root, ["dead"], () => undefined);
  expect(report.control.map(({ side, at, name, graph }) => [side, at, name, graph].join(" ")).sort((a, b) => a.localeCompare(b))).toEqual([
    `agree ${LIB}:1 unusedHelper dead`,
    `agree ${LIB}:4 #spare member-write-only`,
    `graph-only ${LIB}:2 chained dead`,
    `graph-unjudged ${LIB}:6 unusedLocal VariableDeclaration`,
  ]);
});
