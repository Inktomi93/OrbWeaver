// graph-trial deletes each finding of the named buckets in a throwaway snapshot: the delete removes the whole member,
// property or declaration, an error the removal adds in a file that imports it names its reader, only the declaring
// file and its importers are checked, and TypeScript's unused-code diagnostics are diffed against the graph.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PLUGIN_MANIFEST_ENTRY } from "@orb/contracts/plugin";
import { SHOWCASE_PLUGIN_SLUGS } from "@orb/showcase-plugins";
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import type { TestOptions } from "vitest";
import { z } from "zod";
import { EXIT } from "../../../tooling/src/floor/cli/exit-contract.ts";
import type { Verdict } from "../../../tooling/src/unwired/field-sort.ts";
import { VERDICTS } from "../../../tooling/src/unwired/field-sort.ts";
import { PROFILES } from "../../../tooling/src/unwired/graph/options.ts";
import { SNAP_SOURCE } from "../../../tooling/src/unwired/graph/state.ts";
import { TRIAL_BUCKETS, TRIAL_VERDICTS } from "../../../tooling/src/unwired/graph/trial.ts";
import type { TrialReport } from "../../../tooling/src/unwired/index.ts";
import { BUCKETS, trialGraph } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphTree, JSX_NAMESPACE, LIB as LIBS, WORLD } from "./_planted.ts";

const [CONFIRMED, CONFIRMED_LITERAL, NAMED_ONLY, REFUTED_REFERENCES, REFUTED, REFUTED_TEST_ONLY, UNRESOLVED] = TRIAL_VERDICTS;
const [DEAD, , , , , , TYPE_ONLY, , MEMBER_WRITE_ONLY, , MEMBER_UNTOUCHED] = TRIAL_BUCKETS;
const [, KEPT_BY_RULING] = BUCKETS;
const [DEAD_VERDICT, , ASK_VERDICT] = VERDICTS;

// Each case spawns the CLI, which loads the tool's module graph: past the 5 s default under load.
const SPAWNS_CLI: TestOptions = { tags: ["slow"] };
const LIB = `${GRAPH_SOURCE}/lib.ts`;
const MAIN = `${GRAPH_SOURCE}/main.ts`;
const MID = `${GRAPH_SOURCE}/mid.ts`;
const SHAPE = `${GRAPH_SOURCE}/shape.ts`;
const OTHER = `${GRAPH_SOURCE}/other.ts`;
const DOOR = `${GRAPH_SOURCE}/door.ts`;
const RELAY = `${GRAPH_SOURCE}/relay.ts`;
const KEYS = `${GRAPH_SOURCE}/keys.ts`;
const AUGMENT = `${GRAPH_SOURCE}/augment.ts`;
const FIXTURE = `${GRAPH_SOURCE}/shape.json`;
const SCRIPT = "scripts/names.ts";

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
  const report = await trialGraph(root, { buckets: [MEMBER_UNTOUCHED, MEMBER_WRITE_ONLY], limit: null }, (line) => lines.push(line));
  expect(outcomes(report)).toEqual([
    [`${LIB}:Shape.gone`, CONFIRMED, `${LIB}: readonly gone?: string;`],
    [`${LIB}:table.middle`, CONFIRMED, `${LIB}: middle(): number { return 2; },`],
    [`${LIB}:table.last`, CONFIRMED, `${LIB}: , last(): number { return 3; }`],
    [`${LIB}:Box.written`, CONFIRMED, `${LIB}: written = 3;`],
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
  const report = await trialGraph(root, { buckets: [DEAD], limit: null }, () => undefined);
  expect(outcomes(report)).toEqual([[`${LIB}:orphan`, CONFIRMED, `${LIB}: /** Nothing calls this. */\nexport function orphan(): number { return 2; }`]]);
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
  const report = await trialGraph(root, { buckets: [DEAD], limit: null }, () => undefined);
  expect(outcomes(report).filter(([label]) => label === `${LIB}:orphan`)).toEqual([[`${LIB}:orphan`, CONFIRMED, ...removed]]);
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
  const report = await trialGraph(root, { buckets: [DEAD], limit: null }, () => undefined);
  expect(report.trials.map(({ label, verdict, errors }) => [label, verdict, errors.map(({ at, kind }) => `${at} ${kind}`)])).toEqual([
    [`${LIB}:orphan`, NAMED_ONLY, [`${MAIN}:1 binding`]],
  ]);
});

// A for-of binding is a declaration no delete can remove alone: cutting its name leaves a loop that does not parse.
test("a delete that leaves its file unparsable is unresolved, with the edit it tried", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(graphTree({ [MAIN]: ["for (const spare of [1]) {", "}"].join("\n") }, { entries: [MAIN] }));
  const report = await trialGraph(root, { buckets: [DEAD], limit: null }, () => undefined);
  expect(
    report.trials.map(({ label, verdict, removed, note }) => [
      label,
      verdict,
      removed.map(({ text }) => text.trim()),
      note?.startsWith("the delete edit does not parse"),
    ]),
  ).toEqual([[`${MAIN}:spare`, UNRESOLVED, ["spare"], true]]);
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
  const report = await trialGraph(root, { buckets: [TYPE_ONLY], limit: null }, (line) => lines.push(line));
  expect(report.trials.map(({ label, verdict, references, checked, errors, compiles }) => ({ label, verdict, references, checked, errors, compiles }))).toEqual(
    [{ label: `${LIB}:DEFAULTS`, verdict: REFUTED_REFERENCES, references: [`${SHAPE}:3`], checked: [], errors: [], compiles: 0 }],
  );
  expect(lines.filter((line) => line.startsWith("trial groups "))).toEqual([]);
});

// One file's candidates share a snapshot. A conditional type's check reads `b` where neither find-references nor the base
// symbol at the error's site names it, so the group halves until `b` stands alone.
test("a group with an unowned error bisects to the one member it reads, counting each member's compiles", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree(
      {
        [LIB]: "export interface Shape { readonly kept: string; readonly a: string; readonly b: string; readonly c: string }",
        [MAIN]: [
          'import type { Shape } from "./lib.ts";',
          "type Needs<T> = T extends { readonly b: string } ? true : false;",
          "const shape: Needs<Shape> = true;",
          "const use = (value: unknown): unknown => value;",
          "use(shape);",
        ].join("\n"),
      },
      { entries: [MAIN] },
    ),
  );
  const lines: string[] = [];
  const report = await trialGraph(root, { buckets: [MEMBER_UNTOUCHED], limit: null }, (line) => lines.push(line));
  expect(
    report.trials
      .filter(({ label }) => label.startsWith(LIB))
      .map(({ label, verdict, errors, compiles }) => [label, verdict, errors.map(({ at, kind }) => `${at} ${kind}`), compiles]),
  ).toEqual([
    [`${LIB}:Shape.kept`, CONFIRMED, [], 2],
    [`${LIB}:Shape.a`, CONFIRMED, [], 2],
    [`${LIB}:Shape.b`, REFUTED, [`${MAIN}:3 read`], 3],
    [`${LIB}:Shape.c`, CONFIRMED, [], 3],
  ]);
  // The whole group, its clean half kept+a, the half b+c, then b and c alone.
  expect(progress(lines)).toMatch(/ snapshots 5 /u);
});

// A home-type value two imports from the declaring file, through an alias the middle file infers.
const RELAYED_SHAPE = {
  [LIB]: "export interface Shape { readonly kept: string; readonly b: string }",
  [DOOR]: ['import type { Shape } from "./lib.ts";', "export declare const made: Shape;", "export const keptOf = (shape: Shape): string => shape.kept;"].join(
    "\n",
  ),
  [MID]: ['import { keptOf, made } from "./door.ts";', "export const relayed = made;", "export const kept = keptOf(made);"].join("\n"),
};

// A delete breaks a site that names neither the member nor its file: a constraint on the home type through a
// re-export, a constraint on a home-type value, an assignment two re-exports away, and a constraint, a satisfies check,
// a typeof and a structural assignment on an alias another file infers. Every such site sits in a file the import graph
// says an edit of the declaring file reaches, and an augmenting file reaches the module it augments.
test.for([
  {
    site: "a constraint on the home type through a re-export",
    files: {
      [LIB]: "export interface Shape { readonly kept: string; readonly b: string }",
      [DOOR]: 'export type { Shape } from "./lib.ts";',
      [MAIN]: [
        'import type { Shape } from "./door.ts";',
        "type Needs<T> = T extends { readonly b: string } ? true : false;",
        "const shape: Needs<Shape> = true;",
        "const use = (value: unknown): unknown => value;",
        "use(shape);",
      ].join("\n"),
    },
    errors: [`${MAIN}:3 read`],
  },
  {
    site: "a constraint on a home-type value from a file that names the home type",
    files: {
      [LIB]: "export interface Shape { readonly kept: string; readonly b: string }",
      [DOOR]: [
        'import type { Shape } from "./lib.ts";',
        "export declare const made: Shape;",
        "export const keptOf = (shape: Shape): string => shape.kept;",
      ].join("\n"),
      [MAIN]: [
        'import { keptOf, made } from "./door.ts";',
        "type Needs<T> = T extends { readonly b: string } ? true : false;",
        "const view: Needs<typeof made> = true;",
        "const use = (value: unknown): unknown => value;",
        "use(view ? keptOf(made) : undefined);",
      ].join("\n"),
    },
    errors: [`${MAIN}:3 read`],
  },
  {
    site: "an assignment two re-exports away from every file that names the home type",
    files: {
      [LIB]: "export interface Shape { readonly kept: string; b: string }",
      [DOOR]: [
        'import type { Shape } from "./lib.ts";',
        "export declare const made: Shape;",
        "export const keptOf = (shape: Shape): string => shape.kept;",
      ].join("\n"),
      [RELAY]: 'export { keptOf, made } from "./door.ts";',
      [MAIN]: ['import { keptOf, made } from "./relay.ts";', 'made.b = "x";', "keptOf(made);"].join("\n"),
    },
    errors: [`${MAIN}:2 read`],
  },
  {
    site: "a constraint on an inferred alias two imports from every file that names the home type",
    files: {
      [LIB]: "export interface Shape { readonly kept: string; readonly b: string }",
      [DOOR]: [
        'import type { Shape } from "./lib.ts";',
        "export declare const made: Shape;",
        "export const keptOf = (shape: Shape): string => shape.kept;",
      ].join("\n"),
      [MID]: ['import { keptOf, made } from "./door.ts";', "export type Made = typeof made;", "export const kept = keptOf(made);"].join("\n"),
      [MAIN]: [
        'import { kept, type Made } from "./mid.ts";',
        "type Needs<T> = T extends { readonly b: string } ? true : false;",
        "const view: Needs<Made> = true;",
        "const use = (value: unknown): unknown => value;",
        "use(view ? kept : undefined);",
      ].join("\n"),
    },
    errors: [`${MAIN}:3 read`],
  },
  {
    site: "a satisfies check on an inferred alias of a home-type value",
    files: {
      ...RELAYED_SHAPE,
      [MAIN]: [
        'import { relayed } from "./mid.ts";',
        "type Needs<T> = T extends { readonly b: string } ? true : false;",
        "const checked = true satisfies Needs<typeof relayed>;",
        "const use = (value: unknown): unknown => value;",
        "use(checked);",
      ].join("\n"),
    },
    errors: [`${MAIN}:3 read`],
  },
  {
    site: "a constraint on the typeof of an inferred alias",
    files: {
      ...RELAYED_SHAPE,
      [MAIN]: [
        'import { relayed } from "./mid.ts";',
        "type Needs<T> = T extends { readonly b: string } ? true : false;",
        "const held: Needs<typeof relayed> = true;",
        "const use = (value: unknown): unknown => value;",
        "use(held);",
      ].join("\n"),
    },
    errors: [`${MAIN}:3 read`],
  },
  {
    // A value assignment is a flow the graph follows, so its member is no finding; a type-level assignability check
    // (a non-distributive `extends`) is one the graph does not.
    site: "a structural assignability check on an inferred alias's type",
    files: {
      ...RELAYED_SHAPE,
      [MAIN]: [
        'import { relayed } from "./mid.ts";',
        "type Fits = [typeof relayed] extends [{ readonly b: string }] ? true : false;",
        "const fits: Fits = true;",
        "const use = (value: unknown): unknown => value;",
        "use(fits);",
      ].join("\n"),
    },
    errors: [`${MAIN}:3 read`],
  },
  {
    // Inside an augmentation the augmented module's names are in scope with no import, so the augmenting file reads
    // the home type without importing the file that declares it.
    site: "a read inside an augmentation of the declaring module",
    files: {
      [LIB]: ["export interface Shape { readonly kept: string; readonly b: string }", "export const keptOf = (shape: Shape): string => shape.kept;"].join("\n"),
      [AUGMENT]: ["export {};", 'declare module "./lib.ts" {', '  interface Shape { readonly echo?: Shape["b"] }', "}"].join("\n"),
      [MAIN]: [
        'import { keptOf } from "./lib.ts";',
        'import "./augment.ts";',
        "const use = (value: unknown): unknown => value;",
        'use(keptOf({ kept: "k", b: "v" }));',
      ].join("\n"),
    },
    // The main file writes `b` in a literal, so that write is an error too; the augmentation's read refutes.
    errors: [`${AUGMENT}:3 read`, `${MAIN}:4 write`],
  },
])("a delete that breaks $site is refuted there", { timeout: 120_000 }, async ({ files, errors: expected }, { plantedTree }) => {
  const root = await plantedTree(graphTree(files, { entries: [MAIN] }));
  const report = await trialGraph(root, { buckets: [MEMBER_UNTOUCHED, MEMBER_WRITE_ONLY], limit: null }, () => undefined);
  expect(
    report.trials
      .filter(({ label }) => label === `${LIB}:Shape.b`)
      .map(({ label, verdict, errors }) => [label, verdict, errors.map(({ at, kind }) => `${at} ${kind}`)]),
  ).toEqual([[`${LIB}:Shape.b`, REFUTED, expected]]);
  // The checked set holds the breaking file even though it names neither the member nor the file that declares it.
  const [breaking] = expected[0]?.split(":") ?? [];
  expect(report.trials.find(({ label }) => label === `${LIB}:Shape.b`)?.checked).toContain(breaking);
});

// A clean compile says only that the compiler needs no site of the name. A member a product string reads as a key
// (an `in` operand off its owner, cast to `object` so the graph sees no read) is confirmed-literal with the hit, the string that only builds a constant listed after it. A JSON key in a file under a package's src that no
// product module loads, and a string in a script, only annotate, a product read of another type's member of the same name is no hit, and neither
// is a comment or the candidate's own sites (its declaration, a re-export the delete removes): those stay confirmed.
test("a compile-clean candidate whose name a product string spells is confirmed-literal, an unloaded JSON key only annotates", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const root = await plantedTree(
    graphTree(
      {
        [LIB]: [
          "export interface Shape {",
          "  readonly kept: string;",
          "  readonly zqSecret: string;",
          "  readonly zqFixture: string;",
          "  readonly zqQuiet: string;",
          "  readonly zqScripted: string;",
          "  readonly zqShared: string;",
          "}",
          "export declare const made: Shape;",
          "export function zqOrphan(): number { return 2; }",
        ].join("\n"),
        [DOOR]: 'export { zqOrphan } from "./lib.ts";',
        [KEYS]: ['export const KEY = "zqSecret";', 'export const has = (o: import("./lib.ts").Shape): boolean => "zqSecret" in (o as object);'].join("\n"),
        [OTHER]: ["export interface Other { readonly zqShared: string }", "export declare const other: Other;"].join("\n"),
        [MAIN]: [
          'import { KEY } from "./keys.ts";',
          'import { made } from "./lib.ts";',
          'import { other } from "./other.ts";',
          "const use = (value: unknown): unknown => value;",
          "use(made.kept);",
          "use(other.zqShared);",
          "// zqQuiet is only mentioned here.",
          "use((made as unknown as Readonly<Record<string, unknown>>)[KEY]);",
        ].join("\n"),
        [FIXTURE]: '{ "kept": "k", "zqFixture": "f" }\n',
        [SCRIPT]: 'export const scripted = "zqScripted";\n',
      },
      { entries: [MAIN] },
    ),
  );
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  const report = await trialGraph(root, { buckets: [MEMBER_UNTOUCHED, DEAD], limit: null }, () => undefined);
  expect(
    report.trials
      .filter(({ label }) => label.includes(":Shape.zq") || label.endsWith(":zqOrphan"))
      .map(({ label, verdict, literal }) => [label, verdict, literal.map(({ at, kind, scope }) => `${at} ${kind} ${scope}`)]),
  ).toEqual([
    [`${LIB}:Shape.zqSecret`, CONFIRMED_LITERAL, [`${KEYS}:2 string product`, `${KEYS}:1 string product`]],
    [`${LIB}:Shape.zqFixture`, CONFIRMED, [`${FIXTURE}:1 config-key product`]],
    [`${LIB}:Shape.zqQuiet`, CONFIRMED, []],
    [`${LIB}:Shape.zqScripted`, CONFIRMED, [`${SCRIPT}:1 string tooling`]],
    [`${LIB}:Shape.zqShared`, CONFIRMED, []],
    [`${LIB}:zqOrphan`, CONFIRMED, []],
  ]);
  expect(report.literalFiles).toBeGreaterThan(0);
});

// A computed member is searched by the name its key resolves to, never by its bracket text: the same `in` operand reads
// the plain member and the computed one off their owner cast to `object`, so both are confirmed-literal.
test("a computed member a product string spells through its key's value is confirmed-literal like a plain one", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const root = await plantedTree(
    graphTree(
      {
        [KEYS]: [
          'export const LIT = "zqLit";',
          'export const has = (o: import("./lib.ts").Shape): boolean => "zqPlain" in (o as object) || "zqLit" in (o as object);',
        ].join("\n"),
        [LIB]: [
          'import { LIT } from "./keys.ts";',
          "export interface Shape { readonly kept: string; readonly zqPlain?: string; readonly [LIT]?: string }",
          "export const keptOf = (shape: Shape): string => shape.kept;",
        ].join("\n"),
        [MAIN]: ['import { keptOf } from "./lib.ts";', 'keptOf({ kept: "k" });'].join("\n"),
      },
      { entries: [MAIN] },
    ),
  );
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  const report = await trialGraph(root, { buckets: [MEMBER_UNTOUCHED], limit: null }, () => undefined);
  expect(
    report.trials
      .filter(({ label }) => label.startsWith(`${LIB}:Shape.`))
      .map(({ label, verdict, literal }) => [label, verdict, literal.map(({ at, kind, scope }) => `${at} ${kind} ${scope}`)]),
  ).toEqual([
    [`${LIB}:Shape.zqPlain`, CONFIRMED_LITERAL, [`${KEYS}:2 string product`]],
    [`${LIB}:Shape.[LIT]`, CONFIRMED_LITERAL, [`${KEYS}:2 string product`, `${KEYS}:1 string product`]],
  ]);
});

// A member named like a keyword (`get`, `new`, `default`, `of`, `as`) hits that keyword in code, where the tree
// has no node and the word names nothing: such a hit is a keyword, never a read to resolve, and the members stay
// confirmed.
test("a member named like a keyword is confirmed past its keyword hits", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree(
      {
        [LIB]: [
          "export interface Shape { readonly kept: string; readonly get: string; readonly new: string; readonly default: string; readonly of: string; readonly as: string }",
          "export declare const made: Shape;",
          "export class Box { get size(): number { return 1; } }",
          "export const box = new Box();",
          "export default box;",
        ].join("\n"),
        [MAIN]: [
          'import box, { made } from "./lib.ts";',
          "const use = (value: unknown): unknown => value;",
          "use(made.kept);",
          "use(box.size);",
          "for (const item of [1]) { use(item as number); }",
        ].join("\n"),
      },
      { entries: [MAIN] },
    ),
  );
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  const report = await trialGraph(root, { buckets: [MEMBER_UNTOUCHED], limit: null }, () => undefined);
  expect(report.trials.filter(({ label }) => label.startsWith(`${LIB}:Shape.`)).map(({ label, verdict, literal }) => [label, verdict, literal.length])).toEqual(
    ["get", "new", "default", "of", "as"].map((member) => [`${LIB}:Shape.${member}`, CONFIRMED, 0]),
  );
});

// A common word hits code that names something else. A product read holds a row only off a value typed by the
// member's own owner, a cast stripped, an intersection's or a union's arm included: an unresolved property read, an
// element access's quoted key, an `in` operand, a destructuring element, shorthand or renamed. The
// same reads off an untyped value or an `object`, a read of another type's member through a cast, and an import of another
// declaration of the word stay listed and keep the row confirmed.
test("a literal read holds a row only off a value its own owner types, quoted or not", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree(
      {
        [LIB]: [
          "export interface Shape {",
          "  readonly kept: string;",
          "  readonly zqKeyed: string;",
          "  readonly zqCast: string;",
          "  readonly zqLoose: string;",
          "  readonly zqForeign: string;",
          "  readonly zqImported: string;",
          "  readonly zqQuoted: string;",
          "  readonly zqInLoose: string;",
          "  readonly zqQuotedOwn: string;",
          "  readonly zqInOwn: string;",
          "  readonly zqBoth: string;",
          "  readonly zqUnion: string;",
          "  readonly zqDestr: string;",
          "  readonly zqAlias: string;",
          "  readonly zqDestrLoose: string;",
          "}",
          "export declare const made: Shape;",
        ].join("\n"),
        [OTHER]: ["export const zqImported = 1;", "export interface Other { readonly zqForeign: string }", "export declare const other: Other;"].join("\n"),
        [MAIN]: [
          'import { made } from "./lib.ts";',
          'import { other, zqImported } from "./other.ts";',
          "const use = (value: unknown): unknown => value;",
          'const loose = JSON.parse("{}");',
          "use(made.kept);",
          "use(zqImported);",
          "use(loose.zqLoose);",
          "use((made as any).zqCast);",
          "use((other as any).zqForeign);",
          'use((o: object): boolean => "zqKeyed" in o);',
          'use(loose["zqQuoted"]);',
          'use("zqInLoose" in loose);',
          'use((made as any)["zqQuotedOwn"]);',
          'use("zqInOwn" in (made as object));',
          'declare const both: import("./lib.ts").Shape & { readonly extra: number };',
          'use("zqBoth" in (both as object));',
          'declare const either: import("./lib.ts").Shape | import("./other.ts").Other;',
          'use("zqUnion" in (either as object));',
          "const { zqDestr } = made as any;",
          "const { zqAlias: aliased } = made as any;",
          "const { zqDestrLoose } = loose;",
          "use([zqDestr, aliased, zqDestrLoose]);",
        ].join("\n"),
      },
      { entries: [MAIN] },
    ),
  );
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  const report = await trialGraph(root, { buckets: [MEMBER_UNTOUCHED], limit: null }, () => undefined);
  expect(
    report.trials
      .filter(({ label }) => label.includes(":Shape.zq"))
      .map(({ label, verdict, literal }) => [label, verdict, literal.map(({ at, kind }) => `${at} ${kind}`)]),
  ).toEqual([
    [`${LIB}:Shape.zqKeyed`, CONFIRMED, [`${MAIN}:10 string`]],
    [`${LIB}:Shape.zqCast`, CONFIRMED_LITERAL, [`${MAIN}:8 read`]],
    [`${LIB}:Shape.zqLoose`, CONFIRMED, [`${MAIN}:7 read`]],
    [`${LIB}:Shape.zqForeign`, CONFIRMED, [`${MAIN}:9 read`, `${OTHER}:2 declaration`]],
    [`${LIB}:Shape.zqImported`, CONFIRMED, [`${MAIN}:2 import-export`, `${OTHER}:1 declaration`]],
    [`${LIB}:Shape.zqQuoted`, CONFIRMED, [`${MAIN}:11 read`]],
    [`${LIB}:Shape.zqInLoose`, CONFIRMED, [`${MAIN}:12 string`]],
    [`${LIB}:Shape.zqQuotedOwn`, CONFIRMED_LITERAL, [`${MAIN}:13 read`]],
    [`${LIB}:Shape.zqInOwn`, CONFIRMED_LITERAL, [`${MAIN}:14 string`]],
    [`${LIB}:Shape.zqBoth`, CONFIRMED_LITERAL, [`${MAIN}:16 string`]],
    [`${LIB}:Shape.zqUnion`, CONFIRMED_LITERAL, [`${MAIN}:18 string`]],
    [`${LIB}:Shape.zqDestr`, CONFIRMED_LITERAL, [`${MAIN}:19 read`]],
    [`${LIB}:Shape.zqAlias`, CONFIRMED_LITERAL, [`${MAIN}:20 read`]],
    [`${LIB}:Shape.zqDestrLoose`, CONFIRMED, [`${MAIN}:21 read`]],
  ]);
});

const VIEW = `${GRAPH_SOURCE}/view.tsx`;

// A string is a key use only as an `in` operand, an element access's argument or a property name, and only when the
// whole string is the member's name. A quoted key off the owner that merely contains the word, a whole key off a
// `Record`, and a string in a value position (a returned value, a literal call argument, a JSX attribute value) only
// annotate, even where the checker types the slot as a literal union that holds the name. A whole quoted key off the
// owner, through a cast and in parentheses or not, is the control that still holds.
test("a string holds a row only as a whole key, never as a value or a key that contains the word", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree(
      {
        "packages/a/src/jsx.d.ts": JSX_NAMESPACE,
        [LIB]: [
          "export interface Shape {",
          "  readonly kept: string;",
          "  readonly zqWhole: string;",
          "  readonly zqRecord: string;",
          "  readonly zqSub: string;",
          "  readonly zqReturned: string;",
          "  readonly zqLit: string;",
          "  readonly zqVoice: string;",
          "  readonly zqParen: string;",
          "  readonly zqParenIn: string;",
          "}",
          "export declare const made: Shape;",
        ].join("\n"),
        [MAIN]: [
          'import { made } from "./lib.ts";',
          'import { view } from "./view.tsx";',
          "const use = (value: unknown): unknown => value;",
          "const headers: Record<string, string> = {};",
          "declare function literal<const T extends string>(value: T): { readonly value: T };",
          'const kindOf = (flag: boolean): "zqReturned" | "other" => (flag ? "other" : "zqReturned");',
          "use(made.kept);",
          'use((made as Record<string, string>)["zqWhole"]);',
          'use(headers["zqRecord"]);',
          '(made as any)["last-zqSub-id"] = "x";',
          "use(kindOf(true));",
          'use(literal("zqLit"));',
          "use(view);",
          'use((made as any)[("zqParen")]);',
          'use(("zqParenIn") in (made as object));',
        ].join("\n"),
        [VIEW]: [
          'const Text = (props: { readonly voice: "datum" | "zqVoice" }): JSX.Element => props as unknown as JSX.Element;',
          'export const view = (mono: boolean): JSX.Element => <Text voice={mono ? "datum" : "zqVoice"} />;',
        ].join("\n"),
      },
      { entries: [MAIN], jsx: true },
    ),
  );
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  const report = await trialGraph(root, { buckets: [MEMBER_UNTOUCHED], limit: null }, () => undefined);
  expect(report.trials.filter(({ label }) => label.includes(":Shape.zq")).map(({ label, verdict }) => [label, verdict])).toEqual([
    [`${LIB}:Shape.zqWhole`, CONFIRMED_LITERAL],
    [`${LIB}:Shape.zqRecord`, CONFIRMED],
    [`${LIB}:Shape.zqSub`, CONFIRMED],
    [`${LIB}:Shape.zqReturned`, CONFIRMED],
    [`${LIB}:Shape.zqLit`, CONFIRMED],
    [`${LIB}:Shape.zqVoice`, CONFIRMED],
    [`${LIB}:Shape.zqParen`, CONFIRMED_LITERAL],
    [`${LIB}:Shape.zqParenIn`, CONFIRMED_LITERAL],
  ]);
});

// A key in data the product loads holds a row only when the type the product reads that data as carries the row's
// member along the key's path. A bundle manifest is read as the manifest type the contracts export names, so its key
// holds that type's members, an array element's included, and only annotates for another type's member of the word. A
// JSON module a product file imports is typed by its own content, and a JSON file only a script imports is no product
// data, so both only annotate.
test("a key in loaded data holds a row only as a member of the type the product reads that data as", { timeout: 120_000 }, async ({ plantedTree }) => {
  const [slug] = SHOWCASE_PLUGIN_SLUGS;
  const manifest = `packages/showcase-plugins/bundles/${slug}/${PLUGIN_MANIFEST_ENTRY}`;
  const contract = "packages/contracts/src/plugin/index.ts";
  const withJson = (include: readonly string[], paths: Readonly<Record<string, readonly string[]>> = {}): string => {
    const config = z
      .looseObject({ compilerOptions: z.record(z.string(), z.unknown()) })
      .parse(JSON.parse(plantedTsconfig({ lib: LIBS, include: [...include], paths: { ...paths } })));
    return JSON.stringify({ ...config, compilerOptions: { ...config.compilerOptions, resolveJsonModule: true } });
  };
  const root = await plantedTree(
    graphTree(
      {
        "tsconfig.world-browser.json": withJson([]),
        [WORLD]: withJson(["../*/src", "../a/scripts"], { "@orb/contracts/plugin": ["../contracts/src/plugin/index.ts"] }),
        [LIB]: [
          "export interface Shape { readonly kept: string; readonly zqImported: string; readonly zqScriptOnly: string; readonly zqManifest: string }",
          "export declare const made: Shape;",
        ].join("\n"),
        [contract]: [
          "export interface Deep { readonly zqDeep: string }",
          "export interface ManifestShape { readonly zqOwned: string; readonly nested?: readonly Deep[] | undefined }",
          "export type PluginManifest = ManifestShape;",
        ].join("\n"),
        [MAIN]: [
          'import type { PluginManifest } from "@orb/contracts/plugin";',
          'import table from "../data/table.json" with { type: "json" };',
          'import { made } from "./lib.ts";',
          "const use = (value: unknown): unknown => value;",
          "declare const loaded: PluginManifest;",
          "use(made.kept);",
          "use(table);",
          "use(loaded.nested?.length);",
        ].join("\n"),
        "packages/a/data/table.json": '{ "zqImported": 1 }\n',
        "packages/a/scripts/load.ts": ['import data from "../data/script.json" with { type: "json" };', "export const loaded = data;"].join("\n"),
        "packages/a/data/script.json": '{ "zqScriptOnly": 1 }\n',
        [manifest]: `${JSON.stringify({ zqManifest: "x", zqOwned: "y", nested: [{ zqDeep: "z" }] }, null, 2)}\n`,
      },
      { entries: [MAIN] },
    ),
  );
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  const report = await trialGraph(root, { buckets: [MEMBER_UNTOUCHED], limit: null }, () => undefined);
  expect(
    report.trials
      .filter(({ label }) => label.includes(".zq"))
      .map(({ label, verdict, literal }) => [label, verdict, literal.map(({ at, kind }) => `${at} ${kind}`)]),
  ).toEqual([
    [`${LIB}:Shape.zqImported`, CONFIRMED, ["packages/a/data/table.json:1 config-key"]],
    [`${LIB}:Shape.zqScriptOnly`, CONFIRMED, ["packages/a/data/script.json:1 config-key"]],
    [`${LIB}:Shape.zqManifest`, CONFIRMED, [`${manifest}:2 config-key`]],
    [`${contract}:Deep.zqDeep`, CONFIRMED_LITERAL, [`${manifest}:6 config-key`]],
    [`${contract}:ManifestShape.zqOwned`, CONFIRMED_LITERAL, [`${manifest}:3 config-key`]],
  ]);
});

// Candidates of many declaring files share a snapshot when no file group edits a file another checks, so a clean
// compile confirms every one of them; an error no candidate owns then halves the shared group, isolating its reader's
// candidate in log2 of the group's size.
const LIBS_SHARED = Array.from({ length: 8 }, (_, at) => ({ lib: `${GRAPH_SOURCE}/lib${String(at)}.ts`, reader: `${GRAPH_SOURCE}/reader${String(at)}.ts` }));
const sharedTree = (constrained: number | null): Readonly<Record<string, string>> =>
  Object.fromEntries(
    LIBS_SHARED.flatMap(({ lib, reader }, at) => [
      [lib, `export interface S${String(at)} { readonly kept: string; readonly gone: string; readonly spare: string }`],
      [
        reader,
        [
          `import type { S${String(at)} } from "./lib${String(at)}.ts";`,
          "type Needs<T> = T extends { readonly spare: string } ? true : false;",
          at === constrained ? `const value: Needs<S${String(at)}> = true;` : `const value: S${String(at)} | undefined = undefined;`,
          "const use = (seen: unknown): unknown => seen;",
          at === constrained ? "use(value);" : "use(value?.kept);",
          "use(undefined as Needs<{ readonly spare: string }> | undefined);",
        ].join("\n"),
      ],
    ]),
  );

test.for([
  { reading: "nothing", constrained: null, snapshots: 1 },
  { reading: "one member, through a constraint no candidate owns", constrained: 3, snapshots: 9 },
])("sixteen candidates of eight files share snapshots when $reading reads them", { timeout: 120_000 }, async ({ constrained, snapshots }, { plantedTree }) => {
  const root = await plantedTree(graphTree(sharedTree(constrained), { entries: LIBS_SHARED.map(({ reader }) => reader) }));
  const lines: string[] = [];
  const report = await trialGraph(root, { buckets: [MEMBER_UNTOUCHED], limit: null }, (line) => lines.push(line));
  const mine = report.trials.filter(({ label }) => /:S\d\.(gone|spare)$/u.test(label));
  expect(mine).toHaveLength(16);
  const bad = constrained === null ? null : `${LIBS_SHARED[constrained]?.lib}:S${String(constrained)}.spare`;
  expect(
    mine.filter(({ verdict }) => verdict !== CONFIRMED).map(({ label, verdict, errors }) => [label, verdict, errors.map(({ at, kind }) => `${at} ${kind}`)]),
  ).toEqual(bad === null ? [] : [[bad, REFUTED, [`${LIBS_SHARED[3]?.reader}:3 read`]]]);
  // One shared snapshot of the libraries' twenty-four (each `kept` too, which no reader reads); the halving adds 2 per
  // level down to the one reading member, 2 * log2(16).
  expect(progress(lines)).toMatch(new RegExp(`^trial groups 1/1 candidates 24/24 snapshots ${String(snapshots)} `, "u"));
  // The reader's candidate sits in the whole group and one half per halving: 1 + log2(16) compiles.
  expect(Math.max(...mine.map(({ compiles }) => compiles))).toBe(constrained === null ? 1 : 5);
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
  const report = await trialGraph(root, { buckets: [MEMBER_WRITE_ONLY], limit: null }, (line) => lines.push(line));
  expect(report.trials.map(({ label, verdict, errors }) => [label, verdict, errors.map(({ at, kind }) => `${at} ${kind}`)])).toEqual([
    [`${LIB}:A.a`, NAMED_ONLY, [`${LIB}:4 write`]],
    [`${LIB}:A.b`, NAMED_ONLY, [`${LIB}:5 write`]],
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
  const report = await trialGraph(root, { buckets: [DEAD], limit: null }, (line) => lines.push(line));
  expect(
    report.trials
      .filter(({ label }) => label.startsWith(LIB))
      .map(({ label, verdict, errors }) => [label, verdict, errors.map(({ at, code, kind }) => `${at} TS${String(code)} ${kind}`)]),
  ).toEqual([
    [`${LIB}:one`, NAMED_ONLY, [`${MAIN}:1 TS2305 binding`]],
    [`${LIB}:two`, NAMED_ONLY, [`${MAIN}:1 TS2305 binding`]],
  ]);
  expect(progress(lines)).toMatch(/ snapshots 3 /u);
});

// The second file imports the first, so the two cannot share a snapshot: two groups, the first with one candidate. A
// preloaded module ends the compiler process as the first group's progress line is written, so the second group
// fails on a dead compiler after the first landed.
const NODE_OPTIONS = "NODE_OPTIONS";
const END_COMPILER = [
  'import { readFileSync } from "node:fs";',
  "const write = process.stderr.write.bind(process.stderr);",
  "process.stderr.write = (chunk, ...rest) => {",
  '  if (String(chunk).startsWith("trial groups 1/")) {',
  '    const children = "/proc/" + process.pid + "/task/" + process.pid + "/children";',
  '    for (const pid of readFileSync(children, "utf8").split(" ").filter(Boolean)) {',
  '      process.kill(Number(pid), "SIGKILL");',
  "    }",
  "  }",
  "  return write(chunk, ...rest);",
  "};",
].join("\n");
const FIRST = `${GRAPH_SOURCE}/first.ts`;
const SECOND = `${GRAPH_SOURCE}/second.ts`;
const TWO_GROUPS = {
  [FIRST]: [
    "export interface Ax { readonly x: string; readonly keep: string }",
    'export const ax: Ax = { x: "1", keep: "k" };',
    "export const keepOf = (): string => ax.keep;",
  ].join("\n"),
  [SECOND]: [
    'import { keepOf } from "./first.ts";',
    "export interface By { readonly y1: string; readonly y2: string; readonly keep: string }",
    'export const by: By = { y1: "1", y2: "2", keep: keepOf() };',
    "export const byKeep = (): string => by.keep;",
  ].join("\n"),
  [MAIN]: ['import { byKeep } from "./second.ts";', "byKeep();"].join("\n"),
};
const commitAll = (root: string): void => {
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  execFixtureGit(root, ["-c", "user.name=planted", "-c", "user.email=planted@example.invalid", "commit", "-qm", "planted"]);
};

test("a trial that fails keeps the trials that landed with its failure, and a rerun of the same commit skips them", { timeout: 240_000 }, async ({
  plantedTree,
  runCli,
  scratch,
}) => {
  const root = await plantedTree(graphTree(TWO_GROUPS, { entries: [MAIN] }));
  commitAll(root);
  const out = join(scratch, "trial.json");
  const argv = ["graph-trial", `--bucket=${MEMBER_WRITE_ONLY}`, `--root=${root}`, `--out=${out}`];
  const hooks = await plantedTree({ "end-compiler.mjs": END_COMPILER });
  const crashed = await runCli("unwired", argv, { env: { [NODE_OPTIONS]: `--import=${pathToFileURL(join(hooks, "end-compiler.mjs")).href}` } });
  await expect(crashed).toExitWith(EXIT.toolError);
  const partial = z
    .object({ trials: z.array(z.object({ label: z.string(), verdict: z.string() })), failure: z.string() })
    .parse(JSON.parse(readFileSync(out, "utf8")));
  expect(partial.trials.map(({ label, verdict }) => [label, verdict])).toEqual([[`${FIRST}:Ax.x`, NAMED_ONLY]]);
  // the failure keeps the run's own error, the time and the group it was on; the tool prints the run's own error
  expect(partial.failure).toMatch(/Unexpected EOF.*the trial failed at \S+; last progress: trial group 2\/2 starting/u);
  expect(crashed.stderr).toContain("TOOL ERROR (thrown): Error: Unexpected EOF");
  expect(crashed.stderr).not.toContain("SuppressedError");
  const rerun = await runCli("unwired", argv);
  await expect(rerun).toExitWith(EXIT.clean);
  expect(rerun.stderr).toContain("resumed 1 trials");
  const printed = rerun.stdout
    .split("\n")
    .filter((line) => line.startsWith(`${NAMED_ONLY}\t`))
    .map((line) => line.split("\t").slice(0, 3).join("\t"));
  expect(printed).toEqual([
    `${NAMED_ONLY}\t${MEMBER_WRITE_ONLY}\t${FIRST}:Ax.x`,
    `${NAMED_ONLY}\t${MEMBER_WRITE_ONLY}\t${SECOND}:By.y1`,
    `${NAMED_ONLY}\t${MEMBER_WRITE_ONLY}\t${SECOND}:By.y2`,
  ]);
});

test("a rerun refuses a trial record from another commit, and a tree with uncommitted changes keeps none", { timeout: 240_000 }, async ({
  plantedTree,
  runCli,
  scratch,
}) => {
  const root = await plantedTree(graphTree(TWO_GROUPS, { entries: [MAIN] }));
  commitAll(root);
  const out = join(scratch, "trial.json");
  const argv = ["graph-trial", `--bucket=${MEMBER_WRITE_ONLY}`, `--root=${root}`, `--out=${out}`];
  await expect(await runCli("unwired", argv)).toExitWith(EXIT.clean);
  const ledger = `${out}.trials.jsonl`;
  expect(readFileSync(ledger, "utf8").split("\n").filter(Boolean)).toHaveLength(3);
  execFixtureGit(root, ["-c", "user.name=planted", "-c", "user.email=planted@example.invalid", "commit", "-q", "--allow-empty", "-m", "next"]);
  const refused = await runCli("unwired", argv);
  await expect(refused).toExitWith(EXIT.toolError);
  expect(refused.stderr).toContain("holds trials from commit");
  // a tracked file that differs from HEAD describes no commit: nothing is read from the ledger or written to a new one
  writeFileSync(join(root, FIRST), `${TWO_GROUPS[FIRST]}\n`);
  const fresh = join(scratch, "dirty.json");
  await expect(await runCli("unwired", ["graph-trial", `--bucket=${MEMBER_WRITE_ONLY}`, `--root=${root}`, `--out=${fresh}`])).toExitWith(EXIT.clean);
  expect(existsSync(`${fresh}.trials.jsonl`)).toBe(false);
});

test("--limit trials an even sample of the findings it names", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({ [MAIN]: "export {};", [LIB]: ["const one = 1;", "const two = 2;", "const three = 3;", "const four = 4;"].join("\n") }, { entries: [MAIN] }),
  );
  const report = await trialGraph(root, { buckets: [DEAD], limit: 2 }, () => undefined);
  expect(report.trials.map(({ label }) => label)).toEqual([`${LIB}:one`, `${LIB}:three`]);
});

// The literal search moves zqMarked, a string another file keys a lookup by, from dead to ask; zqNoteText stays dead.
test("--verdict trials only the member rows the judge sorted to the named verdicts", { timeout: 120_000 }, async ({ plantedTree }) => {
  const note = `${GRAPH_SOURCE}/note.ts`;
  const root = await plantedTree(
    graphTree({
      [note]: [
        "export interface Note { readonly zqNoteText: string; readonly zqMarked: string; readonly seen: string }",
        'export const note: Note = { zqNoteText: "n", zqMarked: "m", seen: "s" };',
        "export const seen = (): string => note.seen;",
      ].join("\n"),
      [`${GRAPH_SOURCE}/lookup.ts`]: 'export const KEY = "zqMarked";\n',
    }),
  );
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  execFixtureGit(root, ["-c", "user.name=planted", "-c", "user.email=planted@example.invalid", "commit", "-qm", "planted"]);
  const labels = async (verdicts: readonly Verdict[]): Promise<readonly string[]> => {
    const report = await trialGraph(root, { buckets: [MEMBER_WRITE_ONLY], verdicts, limit: null }, () => undefined);
    return report.trials.filter(({ label }) => label.startsWith(note)).map(({ label }) => label);
  };
  expect(await labels([])).toEqual([`${note}:Note.zqNoteText`, `${note}:Note.zqMarked`]);
  expect(await labels([DEAD_VERDICT])).toEqual([`${note}:Note.zqNoteText`]);
  expect(await labels([ASK_VERDICT])).toEqual([`${note}:Note.zqMarked`]);
  expect(await labels([DEAD_VERDICT, ASK_VERDICT])).toEqual([`${note}:Note.zqNoteText`, `${note}:Note.zqMarked`]);
});

test("pnpm unwired graph-trial takes each --bucket, prints every trial with its refuting errors and tallies every bucket and the control", {
  timeout: 120_000,
}, async ({ plantedTree, runCli, scratch }) => {
  const root = await plantedTree(graphTree(READER_TREE(["export const DEFAULTS = { a: 1 };", "export const SPARE = 2;"].join("\n")), { entries: [MAIN] }));
  const run = await runCli("unwired", ["graph-trial", `--bucket=${TYPE_ONLY}`, `--bucket=${DEAD}`, `--root=${root}`, `--out=${join(scratch, "trial.json")}`]);
  await expect(run).toExitWith(EXIT.clean);
  expect(run.stdout.split("\n").filter((line) => !line.startsWith("control-") && line !== "")).toEqual([
    `${REFUTED_REFERENCES}\t${TYPE_ONLY}\t${LIB}:DEFAULTS\t${SHAPE}:3`,
    `${CONFIRMED}\t${DEAD}\t${LIB}:SPARE\t`,
    `${CONFIRMED}\t${DEAD}\t${OTHER}:alone\t`,
  ]);
  const tallies = run.stderr.split("\n").filter((line) => line.includes(" trials="));
  expect(tallies).toEqual([
    `${TYPE_ONLY} trials=1 ${TRIAL_VERDICTS.map((verdict) => `${verdict}=${verdict === REFUTED_REFERENCES ? "1" : "0"}`).join(" ")}`,
    expect.stringMatching(
      new RegExp(`^${DEAD} trials=\\d+ ${TRIAL_VERDICTS.map((verdict) => `${verdict}=${verdict === CONFIRMED ? String.raw`\d+` : "0"}`).join(" ")}$`, "u"),
    ),
  ]);
});

test.for([
  { refusal: "no bucket", argv: [] },
  { refusal: "a bucket no delete can trial", argv: [`--bucket=${KEPT_BY_RULING}`] },
  { refusal: "an unknown verdict", argv: [`--bucket=${MEMBER_WRITE_ONLY}`, "--verdict=maybe"] },
  { refusal: "a verdict on a bucket whose rows carry none", argv: [`--bucket=${DEAD}`, `--verdict=${DEAD_VERDICT}`] },
])("pnpm unwired graph-trial refuses $refusal before any build", SPAWNS_CLI, async ({ argv }, { runCli, scratch }) => {
  const run = await runCli("unwired", ["graph-trial", ...argv, `--root=${scratch}`]);
  await expect(run).toExitWith(EXIT.misuse);
});

test.for([
  {
    refusal: "an unknown verdict",
    argv: [`--bucket=${MEMBER_WRITE_ONLY}`, "--verdict=maybe"],
    says: `--verdict=maybe: expected one of ${VERDICTS.join(", ")}`,
  },
  { refusal: "a verdict on a bucket whose rows carry none", argv: [`--bucket=${DEAD}`, `--verdict=${DEAD_VERDICT}`], says: `${DEAD} carries no verdict` },
  {
    refusal: "an unknown profile kind in a list",
    argv: [`--bucket=${DEAD}`, "--profile=wall,trace"],
    says: `--profile=trace: expected one of ${PROFILES.join(", ")}`,
  },
  { refusal: "the retired --cpu-profile", argv: [`--bucket=${DEAD}`, "--cpu-profile=out"], says: "--cpu-profile=out: unknown argument" },
])("pnpm unwired graph-trial says why it refuses $refusal", SPAWNS_CLI, async ({ argv, says }, { runCli, scratch }) => {
  const run = await runCli("unwired", ["graph-trial", ...argv, `--root=${scratch}`]);
  await expect(run).toExitWith(EXIT.misuse);
  expect(run.stderr).toContain(says);
});

test("pnpm unwired graph-trial --profile takes several kinds and writes each beside its report", { timeout: 240_000 }, async ({
  plantedTree,
  runCli,
  scratch,
}) => {
  const root = await plantedTree(graphTree(TWO_GROUPS, { entries: [MAIN] }));
  const out = join(scratch, "trial.json");
  const run = await runCli("unwired", ["graph-trial", `--bucket=${MEMBER_WRITE_ONLY}`, `--root=${root}`, `--out=${out}`, "--profile=wall,heap"]);
  await expect(run).toExitWith(EXIT.clean);
  expect(readdirSync(`${out}.profile`).length).toBeGreaterThan(0);
  expect(run.stderr).toMatch(/^profile heap \S+: inuse_space/mu);
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
  const report = await trialGraph(root, { buckets: [DEAD], limit: null }, () => undefined);
  expect(report.trials.filter(({ label }) => label === `${LIB}:orphan`).map(({ verdict, errors }) => [verdict, errors])).toEqual([[CONFIRMED, []]]);
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
  const report = await trialGraph(root, { buckets: [MEMBER_WRITE_ONLY], limit: null }, () => undefined);
  expect(report.trials.map(({ label, verdict, errors }) => [label, verdict, errors.map(({ at, kind }) => `${at} ${kind}`)])).toEqual([
    [`${LIB}:A.a`, NAMED_ONLY, [`${LIB}:2 write`]],
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
  const report = await trialGraph(root, { buckets: [DEAD], limit: null }, () => undefined);
  expect(report.control.map(({ side, at, name, graph }) => [side, at, name, graph].join(" ")).sort((a, b) => a.localeCompare(b))).toEqual([
    `agree ${LIB}:1 unusedHelper ${DEAD}`,
    `agree ${LIB}:4 #spare ${MEMBER_WRITE_ONLY}`,
    `graph-only ${LIB}:2 chained ${DEAD}`,
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
const NEEDS = "type Needs<T> = T extends { readonly tested: string; readonly used: string } ? true : false;";

test("a reader only outside the product refutes test-only; a product reader keeps the verdict refuted", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree(
      {
        ...WITH_TESTS,
        [LIB]: "export interface Shape { readonly kept: string; readonly tested: string; readonly used: string }",
        [MAIN]: [
          'import type { Shape } from "./lib.ts";',
          "type Needs<T> = T extends { readonly used: string } ? true : false;",
          "const product: Needs<Shape> = true;",
          "const use = (value: unknown): unknown => value;",
          "use(product);",
        ].join("\n"),
        [TEST_FILE]: ['import type { Shape } from "../../packages/a/src/lib.ts";', NEEDS, "export const tested: Needs<Shape> = true;"].join("\n"),
        [TYPE_TEST_FILE]: ['import type { Shape } from "../../packages/a/src/lib.ts";', NEEDS, "export const typeTested: Needs<Shape> = true;"].join("\n"),
      },
      { entries: [MAIN] },
    ),
  );
  const report = await trialGraph(root, { buckets: [MEMBER_UNTOUCHED], limit: null }, () => undefined);
  expect(
    report.trials
      .filter(({ label }) => label.startsWith(`${LIB}:`) && label !== `${LIB}:Shape.kept`)
      .map(({ label, verdict, errors }) => [label, verdict, errors.map(({ at, kind, product }) => `${at} ${kind} ${product ? "product" : "outside"}`)]),
  ).toEqual([
    [`${LIB}:Shape.tested`, REFUTED_TEST_ONLY, [`${TYPE_TEST_FILE}:3 read outside`, `${TEST_FILE}:3 read outside`]],
    [`${LIB}:Shape.used`, REFUTED, [`${MAIN}:3 read product`, `${TYPE_TEST_FILE}:3 read outside`, `${TEST_FILE}:3 read outside`]],
  ]);
});

// Snap drives the product as its user does, so a snap reader is the product's (D357), in the trial and in the control.
const SNAP_READER = `${SNAP_SOURCE}zq-reader.ts`;

test("a reader under snap refutes the finding as a product read, and the control judges snap's unused code", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree(
      {
        [WORLD]: plantedTsconfig({ lib: LIBS, include: ["../*/src", `../../${SNAP_SOURCE}`] }),
        [LIB]: "export interface Shape { readonly kept: string; readonly snapped: string }",
        [MAIN]: ['import type { Shape } from "./lib.ts";', "const use = (value: unknown): unknown => value;", "use((shape: Shape) => shape.kept);"].join("\n"),
        [SNAP_READER]: [
          'import type { Shape } from "../../../packages/a/src/lib.ts";',
          "type Needs<T> = T extends { readonly snapped: string } ? true : false;",
          "export const snapped: Needs<Shape> = true;",
          "function zqSnapUnused(): number { return 1; }",
        ].join("\n"),
      },
      { entries: [MAIN] },
    ),
  );
  const report = await trialGraph(root, { buckets: [MEMBER_UNTOUCHED, DEAD], limit: null }, () => undefined);
  expect(
    report.trials
      .filter(({ label }) => label === `${LIB}:Shape.snapped`)
      .map(({ verdict, errors }) => [verdict, errors.map(({ at, kind, product }) => `${at} ${kind} ${product ? "product" : "outside"}`)]),
  ).toEqual([[REFUTED, [`${SNAP_READER}:3 read product`]]]);
  expect(report.control.filter(({ at }) => at.startsWith(SNAP_SOURCE)).map(({ at, name }) => [at, name])).toEqual([[`${SNAP_READER}:4`, "zqSnapUnused"]]);
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
  const report = await trialGraph(root, { buckets: [MEMBER_UNTOUCHED], limit: null }, () => undefined);
  expect(report.trials.filter(({ label }) => label.startsWith(`${LIB}:`)).map(({ label, verdict, errors }) => [label, verdict, errors])).toEqual([
    [`${LIB}:Shape.tagged`, CONFIRMED, []],
    [`${LIB}:Shape.local`, CONFIRMED, []],
    [`${LIB}:Shape.typed`, CONFIRMED, []],
  ]);
});

const HOST = `${GRAPH_SOURCE}/host.ts`;
const READER = `${GRAPH_SOURCE}/reader.ts`;
const REACH_LIB = [
  "export interface Shape { readonly kept: string; readonly gone: string }",
  "export const keptOf = (shape: Shape): string => shape.kept;",
].join("\n");
const REACH_NEEDS = "type Needs<T> = T extends { readonly gone: string } ? true : false;";

// The augmenting file imports the candidate's file; the reader imports neither, and reads it through what the
// augmentation declares. A file that neither imports nor spells it is not checked.
test.for([
  {
    through: "a module augmentation, by the augmented module's importers",
    augment: ['import type { Shape } from "./lib.ts";', 'declare module "./host.ts" {', "  interface Host { readonly shape: Shape }", "}"].join("\n"),
    reader: ['import type { Host } from "./host.ts";', REACH_NEEDS, 'export type Read = Needs<Host["shape"]>; export const held: Read = true;'].join("\n"),
    line: 3,
    // The augmented module's own file is reached too.
    checked: [AUGMENT, HOST, LIB, MAIN, READER],
  },
  {
    through: "a global declaration, by the files that spell its name",
    augment: ['import type { Shape } from "./lib.ts";', "declare global {", "  var plantedShape: Shape;", "}"].join("\n"),
    reader: [REACH_NEEDS, "export type Read = Needs<typeof globalThis.plantedShape>; export const held: Read = true;"].join("\n"),
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
    const report = await trialGraph(root, { buckets: [MEMBER_UNTOUCHED], limit: null }, () => undefined);
    expect(
      report.trials
        .filter(({ label }) => label === `${LIB}:Shape.gone`)
        .map(({ verdict, checked: files, errors }) => ({ verdict, checked: files, errors: errors.map(({ at, kind }) => `${at} ${kind}`) })),
    ).toEqual([{ verdict: REFUTED, checked, errors: [`${READER}:${String(line)} read`] }]);
  },
);

// A computed member's find-references is the member's own, never the constant its brackets read: the constant is read
// in another file and the member nowhere, so the member stays confirmed.
test("a computed member whose constant is read elsewhere is confirmed by its own references", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree(
      {
        [KEYS]: 'export const KEY = "zqComputed";',
        [LIB]: [
          'import { KEY } from "./keys.ts";',
          "export interface Shape { readonly kept: string; readonly [KEY]?: string }",
          "export const keptOf = (shape: Shape): string => shape.kept;",
        ].join("\n"),
        [MAIN]: [
          'import { KEY } from "./keys.ts";',
          'import { keptOf } from "./lib.ts";',
          "const use = (value: unknown): unknown => value;",
          "use(KEY);",
          'use(keptOf({ kept: "k" }));',
        ].join("\n"),
      },
      { entries: [MAIN] },
    ),
  );
  const report = await trialGraph(root, { buckets: [MEMBER_UNTOUCHED], limit: null }, () => undefined);
  // The constant's reads are not the member's: the delete breaks none of them. The constant's own file imports nothing
  // the delete edits, so it is not checked.
  expect(report.trials.map(({ label, verdict, references, checked, errors }) => ({ label, verdict, references, checked, errors }))).toEqual([
    { label: `${LIB}:Shape.[KEY]`, verdict: CONFIRMED, references: [], checked: [LIB, MAIN], errors: [] },
  ]);
});

// The member is read only by a test that reaches it through a relay, naming neither its holder nor its file: the
// test imports the declaring file through the relay, so it is checked.
test("a computed member a test reads through a relay is refuted test-only", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree(
      {
        ...WITH_TESTS,
        [KEYS]: 'export const KEY = "zqComputed";',
        [LIB]: [
          'import { KEY } from "./keys.ts";',
          "export interface Shape { readonly kept: string; readonly [KEY]?: string }",
          'export const made = (): Shape => ({ kept: "k" });',
        ].join("\n"),
        [RELAY]: 'export { made } from "./lib.ts";',
        [MAIN]: ['import { made } from "./relay.ts";', "const use = (value: unknown): unknown => value;", "use(made().kept);"].join("\n"),
        [TEST_FILE]: ['import { made } from "../../packages/a/src/relay.ts";', "export const read = made().zqComputed;"].join("\n"),
      },
      { entries: [MAIN] },
    ),
  );
  const report = await trialGraph(root, { buckets: [MEMBER_UNTOUCHED], limit: null }, () => undefined);
  expect(
    report.trials
      .filter(({ label }) => label === `${LIB}:Shape.[KEY]`)
      .map(({ verdict, checked, errors }) => ({ verdict, checked, errors: errors.map(({ at, kind }) => `${at} ${kind}`) })),
  ).toEqual([{ verdict: REFUTED_TEST_ONLY, checked: [LIB, MAIN, RELAY, TEST_FILE], errors: [`${TEST_FILE}:2 read`] }]);
});

// A constraint through the key constant (`{ readonly [KEY]: string }`) names neither the member nor its holder: its
// file is checked because it imports the declaring file through a relay, and the key constant's own file is not.
test("a computed member a constraint reads only through its key constant is refuted", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree(
      {
        [KEYS]: 'export const KEY = "zqComputed";',
        [LIB]: [
          'import { KEY } from "./keys.ts";',
          "export interface Shape { readonly kept: string; readonly [KEY]: string }",
          'export const made = (): Shape => ({ kept: "k", [KEY]: "v" });',
        ].join("\n"),
        [RELAY]: 'export { made } from "./lib.ts";',
        [MAIN]: [
          'import { KEY } from "./keys.ts";',
          'import { made } from "./relay.ts";',
          "type Needs<T> = T extends { readonly [KEY]: string } ? true : false;",
          "const needs: Needs<ReturnType<typeof made>> = true;",
          "const use = (value: unknown): unknown => value;",
          "use(made().kept);",
          "use(needs);",
        ].join("\n"),
      },
      { entries: [MAIN] },
    ),
  );
  const report = await trialGraph(root, { buckets: [MEMBER_UNTOUCHED, MEMBER_WRITE_ONLY], limit: null }, () => undefined);
  expect(
    report.trials
      .filter(({ label }) => label === `${LIB}:Shape.[KEY]`)
      .map(({ verdict, checked, errors }) => ({ verdict, checked, errors: errors.map(({ at, kind }) => `${at} ${kind}`) })),
  ).toEqual([{ verdict: REFUTED, checked: [LIB, MAIN, RELAY], errors: [`${LIB}:3 write`, `${MAIN}:4 read`] }]);
});

// A key that is no name, a string literal in brackets, has no symbol a reader names: a constraint that never names the
// holder is checked as an importer of the declaring file through a relay.
test("a literal-keyed computed member a constraint reads through a relay is refuted", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree(
      {
        [LIB]: [
          'export interface Shape { readonly kept: string; readonly ["zqDash"]: string }',
          'export const made = (): Shape => ({ kept: "k", zqDash: "d" });',
        ].join("\n"),
        [RELAY]: 'export { made } from "./lib.ts";',
        [MAIN]: [
          'import { made } from "./relay.ts";',
          "type Needs<T> = T extends { readonly zqDash: string } ? true : false;",
          "const needs: Needs<ReturnType<typeof made>> = true;",
          "const use = (value: unknown): unknown => value;",
          "use(made().kept);",
          "use(needs);",
        ].join("\n"),
      },
      { entries: [MAIN] },
    ),
  );
  const report = await trialGraph(root, { buckets: [MEMBER_UNTOUCHED, MEMBER_WRITE_ONLY], limit: null }, () => undefined);
  expect(
    report.trials
      .filter(({ label }) => label === `${LIB}:Shape.zqDash`)
      .map(({ verdict, checked, errors }) => ({ verdict, checked, errors: errors.map(({ at, kind }) => `${at} ${kind}`) })),
  ).toEqual([{ verdict: REFUTED, checked: [LIB, MAIN, RELAY], errors: [`${LIB}:2 write`, `${MAIN}:3 read`] }]);
});

// A key a library declares has no tree file naming its symbol: the reader is checked as an importer of the declaring
// file through a relay, as for a well-known symbol.
test("a computed member keyed by a library constant a constraint reads through a relay is refuted", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree(
      {
        "node_modules/zqkeys/package.json": JSON.stringify({ name: "zqkeys", types: "index.d.ts" }),
        "node_modules/zqkeys/index.d.ts": 'export declare const LIB_KEY: "zqLib";',
        [LIB]: [
          'import { LIB_KEY } from "zqkeys";',
          "export interface Shape { readonly kept: string; readonly [LIB_KEY]: string }",
          'export const made = (): Shape => ({ kept: "k", [LIB_KEY]: "v" });',
        ].join("\n"),
        [RELAY]: 'export { made } from "./lib.ts";',
        [MAIN]: [
          'import { made } from "./relay.ts";',
          "type Needs<T> = T extends { readonly zqLib: string } ? true : false;",
          "const needs: Needs<ReturnType<typeof made>> = true;",
          "const use = (value: unknown): unknown => value;",
          "use(made().kept);",
          "use(needs);",
        ].join("\n"),
      },
      { entries: [MAIN] },
    ),
  );
  const report = await trialGraph(root, { buckets: [MEMBER_UNTOUCHED, MEMBER_WRITE_ONLY], limit: null }, () => undefined);
  expect(
    report.trials
      .filter(({ label }) => label === `${LIB}:Shape.[LIB_KEY]`)
      .map(({ verdict, checked, errors }) => ({ verdict, checked, errors: errors.map(({ at, kind }) => `${at} ${kind}`) })),
  ).toEqual([{ verdict: REFUTED, checked: [LIB, MAIN, RELAY], errors: [`${LIB}:3 write`, `${MAIN}:3 read`] }]);
});
