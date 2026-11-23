// graph-trial deletes each finding of the named buckets in a throwaway snapshot: the delete removes the whole member,
// property or declaration, an error the removal adds in a file that imports it names its reader, only the declaring
// file and its importers are checked, and TypeScript's unused-code diagnostics are diffed against the graph.
import { join } from "node:path";
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { EXIT } from "../../../tooling/src/floor/cli/exit-contract.ts";
import type { TrialReport } from "../../../tooling/src/unwired/index.ts";
import { trialGraph } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphTree, LIB as LIBS, WORLD } from "./_planted.ts";

const LIB = `${GRAPH_SOURCE}/lib.ts`;
const MAIN = `${GRAPH_SOURCE}/main.ts`;
const SHAPE = `${GRAPH_SOURCE}/shape.ts`;
const OTHER = `${GRAPH_SOURCE}/other.ts`;
const DOOR = `${GRAPH_SOURCE}/door.ts`;

const progress = (lines: readonly string[]): string => lines.findLast((line) => line.startsWith("trial groups ")) ?? "";

const outcomes = (report: TrialReport): readonly (readonly string[])[] =>
  report.trials.map(({ label, verdict, removed }) => [label, verdict, ...removed.map(({ file, text }) => `${file}: ${text.trim()}`)]);

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
          // An error the base already has, after both literal cuts: it matches only if the cuts' shifts are counted once.
          'export const broken: number = "x";',
        ].join("\n"),
      },
      { entries: [MAIN] },
    ),
  );
  const lines: string[] = [];
  const report = await trialGraph(root, { buckets: ["member-untouched", "member-write-only"], limit: null }, (line) => lines.push(line));
  expect(outcomes(report)).toEqual([
    [`${LIB}:Shape.gone`, "confirmed", `${LIB}: readonly gone?: string;`],
    [`${LIB}:table.middle`, "confirmed", `${LIB}: middle(): number { return 2; },`],
    [`${LIB}:table.last`, "confirmed", `${LIB}: , last(): number { return 3; }`],
    [`${LIB}:Box.written`, "confirmed", `${LIB}: written = 3;`],
  ]);
  // One file, one snapshot: a clean compile confirms the whole group, and the two literal neighbours share the comma
  // between them.
  expect(progress(lines)).toMatch(/ snapshots 1 /u);
  expect(report.trials.map(({ compiles }) => compiles)).toEqual([1, 1, 1, 1]);
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
  const report = await trialGraph(root, { buckets: ["dead"], limit: null }, () => undefined);
  expect(outcomes(report)).toEqual([[`${LIB}:orphan`, "confirmed", `${LIB}: /** Nothing calls this. */\nexport function orphan(): number { return 2; }`]]);
});

// The delete edits every export site that names the candidate, so neither a local export list nor a re-export in
// another file is left naming a declaration that no longer exists.
test.for([
  {
    site: "a local export list",
    files: {
      [MAIN]: ['import { run } from "./lib.ts";', "run();"].join("\n"),
      [LIB]: ["function run(): number { return 1; }", "function orphan(): number { return 2; }", "export { run, orphan };"].join("\n"),
    },
    removed: [`${LIB}: function orphan(): number { return 2; }`, `${LIB}: , orphan`],
  },
  {
    site: "a re-export in another file",
    files: {
      [MAIN]: ['import { run } from "./door.ts";', "run();"].join("\n"),
      [DOOR]: 'export { orphan, run } from "./lib.ts";',
      [LIB]: ["export function run(): number { return 1; }", "export function orphan(): number { return 2; }"].join("\n"),
    },
    removed: [`${LIB}: export function orphan(): number { return 2; }`, `${DOOR}: orphan,`],
  },
])("a dead function named by $site is confirmed with that site removed too", { timeout: 120_000 }, async ({ files, removed }, { plantedTree }) => {
  const root = await plantedTree(graphTree(files, { entries: [MAIN] }));
  const report = await trialGraph(root, { buckets: ["dead"], limit: null }, () => undefined);
  expect(outcomes(report).filter(([label]) => label === `${LIB}:orphan`)).toEqual([[`${LIB}:orphan`, "confirmed", ...removed]]);
});

test("an import its own file never uses is a binding the delete removes: named-only, not refuted", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree(
      {
        [MAIN]: ['import { orphan, run } from "./lib.ts";', "run();"].join("\n"),
        [LIB]: ["export function run(): number { return 1; }", "export function orphan(): number { return 2; }"].join("\n"),
      },
      { entries: [MAIN] },
    ),
  );
  const report = await trialGraph(root, { buckets: ["dead"], limit: null }, () => undefined);
  expect(report.trials.map(({ label, verdict, errors }) => [label, verdict, errors.map(({ at, kind }) => `${at} ${kind}`)])).toEqual([
    [`${LIB}:orphan`, "named-only", [`${MAIN}:1 binding`]],
  ]);
});

// A for-of binding is a declaration no delete can remove alone: cutting its name leaves a loop that does not parse.
test("a delete that leaves its file unparsable is unresolved, with the edit it tried", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(graphTree({ [MAIN]: ["for (const spare of [1]) {", "}"].join("\n") }, { entries: [MAIN] }));
  const report = await trialGraph(root, { buckets: ["dead"], limit: null }, () => undefined);
  expect(
    report.trials.map(({ label, verdict, removed, note }) => [
      label,
      verdict,
      removed.map(({ text }) => text.trim()),
      note?.startsWith("the delete edit does not parse"),
    ]),
  ).toEqual([[`${MAIN}:spare`, "unresolved", ["spare"], true]]);
});

const READER_TREE = (lib: string): Record<string, string> => ({
  [MAIN]: ['import type { Shape } from "./shape.ts";', "const use = (value: number): number => value;", "const shape: Shape = { a: 1 };", "use(shape.a);"].join(
    "\n",
  ),
  [SHAPE]: ['import { DEFAULTS } from "./lib.ts";', "", "export type Shape = typeof DEFAULTS;"].join("\n"),
  [LIB]: lib,
  [OTHER]: "export const alone = 1;",
});

// Find-references names the type read on line 3; the import on line 1 only binds the name.
test("a product read find-references names refutes the finding with no snapshot", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(graphTree(READER_TREE(["export const DEFAULTS = { a: 1 };", "export const SPARE = 2;"].join("\n")), { entries: [MAIN] }));
  const lines: string[] = [];
  const report = await trialGraph(root, { buckets: ["type-only"], limit: null }, (line) => lines.push(line));
  expect(report.trials.map(({ label, verdict, references, checked, errors, compiles }) => ({ label, verdict, references, checked, errors, compiles }))).toEqual(
    [{ label: `${LIB}:DEFAULTS`, verdict: "refuted-references", references: [`${SHAPE}:3`], checked: [], errors: [], compiles: 0 }],
  );
  expect(lines.filter((line) => line.startsWith("trial groups "))).toEqual([]);
});

// One file's candidates share a snapshot. A structural constraint reads `b` where neither find-references nor the base
// symbol at the error's site names it, so the group halves until `b` stands alone.
test("a group with an unowned error bisects to the one member it reads, counting each member's compiles", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree(
      {
        [LIB]: "export interface Shape { readonly kept: string; readonly a: string; readonly b: string; readonly c: string }",
        [MAIN]: [
          'import type { Shape } from "./lib.ts";',
          "type Needs<T extends { readonly b: string }> = T;",
          "const shape: Needs<Shape> | undefined = undefined;",
          "const use = (value: unknown): unknown => value;",
          "use(shape?.kept);",
        ].join("\n"),
      },
      { entries: [MAIN] },
    ),
  );
  const lines: string[] = [];
  const report = await trialGraph(root, { buckets: ["member-untouched"], limit: null }, (line) => lines.push(line));
  expect(
    report.trials
      .filter(({ label }) => label.startsWith(LIB))
      .map(({ label, verdict, errors, compiles }) => [label, verdict, errors.map(({ at, kind }) => `${at} ${kind}`), compiles]),
  ).toEqual([
    [`${LIB}:Shape.kept`, "confirmed", [], 2],
    [`${LIB}:Shape.a`, "confirmed", [], 2],
    [`${LIB}:Shape.b`, "refuted", [`${MAIN}:3 read`], 3],
    [`${LIB}:Shape.c`, "confirmed", [], 3],
  ]);
  // lib: the whole group, its clean half kept+a, the half b+c, then b and c alone; main: its own group.
  expect(progress(lines)).toMatch(/ snapshots 6 /u);
});

// The checker reports one excess property per literal, so the second member's write shows only once the first is settled.
test("two write-only members of one literal each keep their own write, the masked one from a second snapshot", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const root = await plantedTree(
    graphTree({
      [LIB]: [
        "export interface A { readonly x: string; readonly a: string; readonly b: string }",
        "export const made: A = {",
        '  x: "1",',
        '  a: "1",',
        '  b: "1",',
        "};",
        "export const xOf = (value: A): string => value.x;",
      ].join("\n"),
    }),
  );
  const lines: string[] = [];
  const report = await trialGraph(root, { buckets: ["member-write-only"], limit: null }, (line) => lines.push(line));
  expect(report.trials.map(({ label, verdict, errors }) => [label, verdict, errors.map(({ at, kind }) => `${at} ${kind}`)])).toEqual([
    [`${LIB}:A.a`, "named-only", [`${LIB}:4 write`]],
    [`${LIB}:A.b`, "named-only", [`${LIB}:5 write`]],
  ]);
  expect(progress(lines)).toMatch(/^trial groups 1\/1 candidates 2\/2 snapshots 2 /u);
});

// Deleting both exports leaves the module empty, and that error sits on the module, which neither owns: the group splits.
test("an error no single candidate owns splits the group, and each half finds its own", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree(
      {
        [MAIN]: ['import { one, two } from "./lib.ts";', "const run = (): number => 1;", "run();"].join("\n"),
        [LIB]: ["export const one = 1;", "export const two = 2;"].join("\n"),
      },
      { entries: [MAIN] },
    ),
  );
  const lines: string[] = [];
  const report = await trialGraph(root, { buckets: ["dead"], limit: null }, (line) => lines.push(line));
  expect(
    report.trials
      .filter(({ label }) => label.startsWith(LIB))
      .map(({ label, verdict, errors }) => [label, verdict, errors.map(({ at, code, kind }) => `${at} TS${String(code)} ${kind}`)]),
  ).toEqual([
    [`${LIB}:one`, "named-only", [`${MAIN}:1 TS2305 binding`]],
    [`${LIB}:two`, "named-only", [`${MAIN}:1 TS2305 binding`]],
  ]);
  expect(progress(lines)).toMatch(/ snapshots 3 /u);
});

test("--limit trials an even sample of the findings it names", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({ [MAIN]: "export {};", [LIB]: ["const one = 1;", "const two = 2;", "const three = 3;", "const four = 4;"].join("\n") }, { entries: [MAIN] }),
  );
  const report = await trialGraph(root, { buckets: ["dead"], limit: 2 }, () => undefined);
  expect(report.trials.map(({ label }) => label)).toEqual([`${LIB}:one`, `${LIB}:three`]);
});

test("pnpm unwired graph-trial takes each --bucket, prints each refuting error and tallies every bucket and the control", { timeout: 120_000 }, async ({
  plantedTree,
  runCli,
  scratch,
}) => {
  const root = await plantedTree(graphTree(READER_TREE(["export const DEFAULTS = { a: 1 };", "export const SPARE = 2;"].join("\n")), { entries: [MAIN] }));
  const run = await runCli("unwired", ["graph-trial", "--bucket=type-only", "--bucket=dead", `--root=${root}`, `--out=${join(scratch, "trial.json")}`]);
  await expect(run).toExitWith(EXIT.clean);
  expect(run.stdout.split("\n").filter((line) => !line.startsWith("control-") && line !== "")).toEqual([
    `refuted-references\ttype-only\t${LIB}:DEFAULTS\t${SHAPE}:3`,
  ]);
  const tallies = run.stderr.split("\n").filter((line) => line.includes(" trials="));
  expect(tallies).toEqual([
    "type-only trials=1 confirmed=0 named-only=0 refuted-references=1 refuted=0 refuted-test-only=0 unresolved=0",
    expect.stringMatching(/^dead trials=\d+ confirmed=\d+ named-only=0 refuted-references=0 refuted=0 refuted-test-only=0 unresolved=0$/u),
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
  const report = await trialGraph(root, { buckets: ["dead"], limit: null }, () => undefined);
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
  const report = await trialGraph(root, { buckets: ["member-write-only"], limit: null }, () => undefined);
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
  const report = await trialGraph(root, { buckets: ["dead"], limit: null }, () => undefined);
  expect(report.control.map(({ side, at, name, graph }) => [side, at, name, graph].join(" ")).sort((a, b) => a.localeCompare(b))).toEqual([
    `agree ${LIB}:1 unusedHelper dead`,
    `agree ${LIB}:4 #spare member-write-only`,
    `graph-only ${LIB}:2 chained dead`,
    `graph-unjudged ${LIB}:6 unusedLocal VariableDeclaration`,
  ]);
  // tsc's own verdict rides on each trial: it reports the helper nothing calls, not the one that helper calls.
  expect(report.trials.filter(({ label }) => label.startsWith(LIB)).map(({ label, tsUnused }) => [label, tsUnused])).toEqual([
    [`${LIB}:unusedHelper`, true],
    [`${LIB}:chained`, false],
  ]);
});

// The world reaches the tests folder too, so a test file is a planted importer like any product file.
const WITH_TESTS = { [WORLD]: plantedTsconfig({ lib: LIBS, include: ["../*/src", "../../tests"] }) };
const TEST_FILE = "tests/a/shape.test.ts";
const TYPE_TEST_FILE = "tests/a/shape.test-d.ts";
// A constraint the member must meet: a structural read the graph does not see and the checker does.
const NEEDS = "type Needs<T extends { readonly tested: string; readonly used: string }> = T;";

test("a reader only outside the product refutes test-only; a product reader keeps the verdict refuted", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree(
      {
        ...WITH_TESTS,
        [LIB]: "export interface Shape { readonly kept: string; readonly tested: string; readonly used: string }",
        [MAIN]: [
          'import type { Shape } from "./lib.ts";',
          "type Needs<T extends { readonly used: string }> = T;",
          "const product: Needs<Shape> | undefined = undefined;",
          "const use = (value: unknown): unknown => value;",
          "use(product);",
        ].join("\n"),
        [TEST_FILE]: ['import type { Shape } from "../../packages/a/src/lib.ts";', NEEDS, "export type Tested = Needs<Shape>;"].join("\n"),
        [TYPE_TEST_FILE]: ['import type { Shape } from "../../packages/a/src/lib.ts";', NEEDS, "export type TypeTested = Needs<Shape>;"].join("\n"),
      },
      { entries: [MAIN] },
    ),
  );
  const report = await trialGraph(root, { buckets: ["member-untouched"], limit: null }, () => undefined);
  expect(
    report.trials
      .filter(({ label }) => label.startsWith(`${LIB}:`) && label !== `${LIB}:Shape.kept`)
      .map(({ label, verdict, errors }) => [label, verdict, errors.map(({ at, kind, product }) => `${at} ${kind} ${product ? "product" : "outside"}`)]),
  ).toEqual([
    [`${LIB}:Shape.tested`, "refuted-test-only", [`${TYPE_TEST_FILE}:3 read outside`, `${TEST_FILE}:3 read outside`]],
    [`${LIB}:Shape.used`, "refuted", [`${MAIN}:3 read product`, `${TYPE_TEST_FILE}:3 read outside`, `${TEST_FILE}:3 read outside`]],
  ]);
});

// noUnusedLocals makes an unused declaration an error: the one the delete leaves unread is the delete's own effect. The
// trial's merged program takes its options from the browser world.
const BROWSER_WORLD = "tsconfig.world-browser.json";
const UNUSED_WORLD = {
  "tsconfig.planted-base.json": plantedTsconfig({ lib: LIBS, include: [] }),
  [BROWSER_WORLD]: JSON.stringify({ extends: "./tsconfig.planted-base.json", compilerOptions: { noUnusedLocals: true } }),
};

test("a declaration the delete leaves unused is not a reader: the candidate stays confirmed", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree(
      {
        ...UNUSED_WORLD,
        [OTHER]: ["export interface Tag { readonly tag: string }", 'export const tagOf = (): string => "t";'].join("\n"),
        [LIB]: [
          'import type { Tag } from "./other.ts";',
          'import { tagOf } from "./other.ts";',
          "type Local = number;",
          "export interface Shape { readonly kept: string; readonly tagged?: Tag; readonly local?: Local; readonly typed?: ReturnType<typeof tagOf> }",
          "export const keptOf = (shape: Shape): string => shape.kept;",
        ].join("\n"),
        [MAIN]: ['import { keptOf } from "./lib.ts";', 'keptOf({ kept: "k" });'].join("\n"),
      },
      { entries: [MAIN] },
    ),
  );
  const report = await trialGraph(root, { buckets: ["member-untouched"], limit: null }, () => undefined);
  expect(report.trials.filter(({ label }) => label.startsWith(`${LIB}:`)).map(({ label, verdict, errors }) => [label, verdict, errors])).toEqual([
    [`${LIB}:Shape.tagged`, "confirmed", []],
    [`${LIB}:Shape.local`, "confirmed", []],
    [`${LIB}:Shape.typed`, "confirmed", []],
  ]);
});

const HOST = `${GRAPH_SOURCE}/host.ts`;
const AUGMENT = `${GRAPH_SOURCE}/augment.ts`;
const READER = `${GRAPH_SOURCE}/reader.ts`;
const REACH_LIB = [
  "export interface Shape { readonly kept: string; readonly gone: string }",
  "export const keptOf = (shape: Shape): string => shape.kept;",
].join("\n");
const REACH_NEEDS = "type Needs<T extends { readonly gone: string }> = T;";

// The augmenting file imports the candidate's file; the reader imports neither, and reads it through what the
// augmentation declares. A file that neither imports nor spells it is not checked.
test.for([
  {
    through: "a module augmentation, by the augmented module's importers",
    augment: ['import type { Shape } from "./lib.ts";', 'declare module "./host.ts" {', "  interface Host { readonly shape: Shape }", "}"].join("\n"),
    reader: ['import type { Host } from "./host.ts";', REACH_NEEDS, 'export type Read = Needs<Host["shape"]>;'].join("\n"),
    line: 3,
    // The augmented module's own file is reached too.
    checked: [AUGMENT, HOST, LIB, MAIN, READER],
  },
  {
    through: "a global declaration, by the files that spell its name",
    augment: ['import type { Shape } from "./lib.ts";', "declare global {", "  var plantedShape: Shape;", "}"].join("\n"),
    reader: [REACH_NEEDS, "export type Read = Needs<typeof globalThis.plantedShape>;"].join("\n"),
    line: 2,
    checked: [AUGMENT, LIB, MAIN, READER],
  },
])(
  "a reader reached through $through refutes the finding, and only the reached files are checked",
  { timeout: 120_000 },
  async ({ augment, reader, line, checked }, { plantedTree }) => {
    const root = await plantedTree(
      graphTree(
        {
          [LIB]: REACH_LIB,
          [HOST]: "export interface Host { readonly name: string }",
          [AUGMENT]: `${augment}\nexport const augmented = 1;`,
          [READER]: reader,
          [OTHER]: "export const alone = 1;",
          [MAIN]: [
            'import type { Shape } from "./lib.ts";',
            'import { keptOf } from "./lib.ts";',
            'import "./augment.ts";',
            'import type { Read } from "./reader.ts";',
            "const read: Read | undefined = undefined;",
            "const use = (value: unknown): unknown => value;",
            "use(read);",
            "use((shape: Shape) => keptOf(shape));",
          ].join("\n"),
        },
        { entries: [MAIN] },
      ),
    );
    const report = await trialGraph(root, { buckets: ["member-untouched"], limit: null }, () => undefined);
    expect(
      report.trials
        .filter(({ label }) => label === `${LIB}:Shape.gone`)
        .map(({ verdict, checked: files, errors }) => ({ verdict, checked: files, errors: errors.map(({ at, kind }) => `${at} ${kind}`) })),
    ).toEqual([{ verdict: "refuted", checked, errors: [`${READER}:${String(line)} read`] }]);
  },
);
