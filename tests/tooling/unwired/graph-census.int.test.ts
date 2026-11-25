// graph-census sets the compiler's find-references beside the graph's role sites: a site the graph gave its member a
// role is no gap, a site it gave none is one, counted under the site's context shape. A case needs a context the graph
// does not read, and the graph's own switch gives one that stays unread: with the literal-key recognizer off, an object
// literal's key writes nothing.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import type { TestOptions } from "vitest";
import { EXIT } from "../../../tooling/src/floor/cli/exit-contract.ts";
import type { Ablation, CensusReport, SiteClass } from "../../../tooling/src/unwired/index.ts";
import { censusGraph, FRESH_BUILD } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphTree, libraryModule, ZOD_MODULE } from "./_planted.ts";

// Each case spawns the CLI, which loads the tool's module graph: past the 5 s default under load.
const SPAWNS_CLI: TestOptions = { tags: ["slow"] };
const FILE = `${GRAPH_SOURCE}/census.ts`;
const TIMEOUT = { timeout: 120_000 };
const KEYS_OFF = "literal-keys" satisfies Ablation;
const WITHOUT_KEYS = { ...FRESH_BUILD, ablate: new Set<Ablation>([KEYS_OFF]) };

const READ_IN_ARROW = "Identifier < PropertyAccessExpression.name < ArrowFunction.body < VariableDeclaration.initializer";
const KEY_IN_INITIALIZER = "Identifier < PropertyAssignment.name < ObjectLiteralExpression.properties < VariableDeclaration.initializer";
const KEY_IN_ARROW = "Identifier < PropertyAssignment.name < ObjectLiteralExpression.properties < ArrowFunction.body";
const KEY_IN_ASSERTIONS = "Identifier < PropertyAssignment.name < ObjectLiteralExpression.properties < wrap(!,as)";
const TO_STATEMENT = "VariableDeclarationList.declarations < VariableStatement.declarationList";

const NO_SITES: Readonly<Record<SiteClass, number>> = { placed: 0, unclassified: 0, unwalked: 0, column: 0, enclosing: 0, elsewhere: 0, declares: 0, gap: 0 };
const counted = (classes: Partial<Record<SiteClass, number>>): Readonly<Record<SiteClass, number>> => ({ ...NO_SITES, ...classes });

const handledAt = (report: CensusReport, shape: string): unknown => report.handled.find((entry) => entry.shape === shape);

test("a read the graph placed is a handled shape and no gap", TIMEOUT, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      [FILE]: [
        "export interface A { readonly x: string; readonly y: number }",
        'export const made: A = { x: "1", y: 2 };',
        "export const xOf = (a: A): string => a.x;",
      ].join("\n"),
    }),
  );
  const report = await censusGraph(root, { sample: null }, () => undefined);
  expect(report.gaps).toEqual([]);
  expect(report.members).toEqual({ asked: 2, of: 2, unread: 1, unresolved: 0 });
  expect(report.sites).toEqual(counted({ placed: 3 }));
  expect(handledAt(report, READ_IN_ARROW)).toEqual({ shape: READ_IN_ARROW, sites: 1, classes: counted({ placed: 1 }), roles: ["read"] });
  expect(handledAt(report, KEY_IN_INITIALIZER)).toEqual({ shape: KEY_IN_INITIALIZER, sites: 2, classes: counted({ placed: 2 }), roles: ["write"] });
});

// `copy` holds a placed read of A.x and an unplaced key of A.x in one statement: the read's role is the read's own, so
// the key stays a gap.
test("a context the graph gives no role is a gap with its count, what it would do, its members' buckets and its sites", TIMEOUT, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      [FILE]: [
        "export interface A { readonly x: string; readonly y: number }",
        'export const made: A = { x: "1", y: 2 };',
        "export const xOf = (a: A): string => a.x;",
        "export const copy = (a: A): A => ({ x: a.x, y: 2 });",
      ].join("\n"),
    }),
  );
  const report = await censusGraph(root, { sample: null }, () => undefined, WITHOUT_KEYS);
  expect(report.sites).toEqual(counted({ placed: 2, gap: 4 }));
  expect(report.gaps).toEqual([
    {
      shape: KEY_IN_ARROW,
      sites: 2,
      classes: counted({ gap: 2 }),
      gaps: 2,
      productGaps: 2,
      roles: [],
      expected: { write: 2 },
      unread: { sites: 1, productReads: 0, members: [] },
      places: [`${FILE}:4 A.x`, `${FILE}:4 A.y`],
      variants: [{ signature: `${KEY_IN_ARROW} < VariableDeclaration.initializer < ${TO_STATEMENT}`, gaps: 2 }],
    },
    {
      shape: KEY_IN_INITIALIZER,
      sites: 2,
      classes: counted({ gap: 2 }),
      gaps: 2,
      productGaps: 2,
      roles: [],
      expected: { write: 2 },
      unread: { sites: 1, productReads: 0, members: [] },
      places: [`${FILE}:2 A.x`, `${FILE}:2 A.y`],
      variants: [{ signature: `${KEY_IN_INITIALIZER} < ${TO_STATEMENT}`, gaps: 2 }],
    },
  ]);
  expect(report.falseFindings).toEqual([]);
  expect(handledAt(report, READ_IN_ARROW)).toEqual({ shape: READ_IN_ARROW, sites: 1, classes: counted({ placed: 1 }), roles: ["read"] });
});

test("spacing, comments and parentheses give one signature, and a run of assertions is one step", TIMEOUT, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      [FILE]: [
        "export interface A { readonly x: string }",
        'export const one: A = { x: "1" };',
        "export const two: A = ({",
        "  // a comment before the key",
        '  x : ("2"),',
        "});",
        'export const three = ({ x: "3" } as A)!;',
        'export const four = ((({ x: "4" })!) as A);',
        "export const plain = (a: A): string => a.x;",
        "export const spaced = (a: A): string => (",
        "  /* a comment */ a . x",
        ");",
      ].join("\n"),
    }),
  );
  const report = await censusGraph(root, { sample: null }, () => undefined, WITHOUT_KEYS);
  expect(report.gaps.map(({ shape, gaps, variants }) => ({ shape, gaps, variants }))).toEqual([
    { shape: KEY_IN_INITIALIZER, gaps: 2, variants: [{ signature: `${KEY_IN_INITIALIZER} < ${TO_STATEMENT}`, gaps: 2 }] },
    { shape: KEY_IN_ASSERTIONS, gaps: 2, variants: [{ signature: `${KEY_IN_ASSERTIONS} < VariableDeclaration.initializer < ${TO_STATEMENT}`, gaps: 2 }] },
  ]);
  expect(handledAt(report, READ_IN_ARROW)).toEqual({ shape: READ_IN_ARROW, sites: 2, classes: counted({ placed: 2 }), roles: ["read"] });
});

// Find-references answers a union arm's member with its sibling arm's sites in a group of the sibling's own. Counted
// toward the asked arm, the narrowed read of arm b would be a site arm a has no role at.
test("a site in a relative's find-references group is its own member's, never the asked member's", TIMEOUT, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      [FILE]: [
        'export type Part = { readonly kind: "a"; readonly summary: string } | { readonly kind: "b"; readonly summary: string };',
        'export const parts: readonly Part[] = [{ kind: "a", summary: "x" }, { kind: "b", summary: "y" }];',
        'export const shown = (part: Part): string => (part.kind === "b" ? part.summary : "");',
      ].join("\n"),
    }),
  );
  const report = await censusGraph(root, { sample: null }, () => undefined);
  expect(report.gaps).toEqual([]);
  expect(report.references.relative).toBeGreaterThan(0);
  expect(report.sites).toEqual(counted({ placed: report.references.own }));
});

test("a role on another node of the statement, and a site roles.ts rules does nothing, are no gaps", TIMEOUT, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      [FILE]: [
        "export interface A { readonly x: string; readonly y: string }",
        'export const made: A = { x: "1", y: "2" };',
        "export const xOf = (a: A): string => { const { x } = a; return x; };",
        "/** Reads {@link A.y}. */",
        "export const yOf = (a: A): string => a.y;",
      ].join("\n"),
    }),
  );
  const report = await censusGraph(root, { sample: null }, () => undefined);
  const destructured = "Identifier < BindingElement.name < ObjectBindingPattern.elements < VariableDeclaration.name";
  const linked = "Identifier < QualifiedName.right < JSDocLink.name < JSDoc.comment";
  expect(report.gaps).toEqual([]);
  expect(handledAt(report, destructured)).toEqual({ shape: destructured, sites: 1, classes: counted({ enclosing: 1 }), roles: [] });
  expect(handledAt(report, linked)).toEqual({ shape: linked, sites: 1, classes: counted({ declares: 1 }), roles: [] });
});

const PARAMETER_BINDING = "Identifier < BindingElement.name < ObjectBindingPattern.elements < Parameter.name";

// Find-references links a rest binding to the source's member of its name, though the binding reads no member by key:
// the shape of a parsed zod row whose `score` key the rest is named after.
test("a rest binding named like a member declares, and a plain binding of that member stays the pattern's read", TIMEOUT, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      ...ZOD_MODULE,
      [FILE]: [
        'import { z } from "zod";',
        "const scoreSchema = z.object({ field: z.string(), score: z.number() });",
        "export const listSchema = z.object({ items: z.array(scoreSchema) });",
        "export const parsed = listSchema.parse({});",
        "export const run = { items: parsed.items.map(({ field, ...score }) => ({ ...score, field })) };",
        "export const scores = { items: parsed.items.map(({ score }) => score) };",
      ].join("\n"),
    }),
  );
  const report = await censusGraph(root, { sample: null }, () => undefined);
  expect(report.gaps).toEqual([]);
  expect(handledAt(report, PARAMETER_BINDING)).toEqual({ shape: PARAMETER_BINDING, sites: 3, classes: counted({ enclosing: 2, declares: 1 }), roles: [] });
});

// A shorthand key declares a schema member as a full key does: the census asks it, as it asks the full key beside it.
test("a shorthand schema key is asked like a full key, never unresolved", TIMEOUT, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      ...ZOD_MODULE,
      [FILE]: [
        'import { z } from "zod";',
        "const id = z.string();",
        "export const getSchema = z.object({ id });",
        "export const putSchema = z.object({ id: z.string() });",
      ].join("\n"),
    }),
  );
  const report = await censusGraph(root, { sample: null }, () => undefined);
  expect(report.unresolved).toEqual([]);
  expect(report.members).toEqual({ asked: 2, of: 2, unread: 0, unresolved: 0 });
});

// The statement of a method's doc link is its class, so a destructuring read anywhere in the class sits beside it.
test("a doc link beside a role at another node of its statement declares, and that role stays the pattern's", TIMEOUT, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      [FILE]: [
        "export interface A { readonly x: string }",
        'export const made: A = { x: "1" };',
        "export class Reader {",
        "  /** Reads {@link A.x}. */",
        "  xOf(a: A): string {",
        "    const { x } = a;",
        "    return x;",
        "  }",
        "}",
      ].join("\n"),
    }),
  );
  const report = await censusGraph(root, { sample: null }, () => undefined);
  const destructured = "Identifier < BindingElement.name < ObjectBindingPattern.elements < VariableDeclaration.name";
  const linked = "Identifier < QualifiedName.right < JSDocLink.name < JSDoc.comment";
  expect(report.elsewhere).toEqual([]);
  expect(handledAt(report, linked)).toEqual({ shape: linked, sites: 1, classes: counted({ declares: 1 }), roles: [] });
  expect(handledAt(report, destructured)).toEqual({ shape: destructured, sites: 1, classes: counted({ enclosing: 1 }), roles: [] });
});

test("a reference in a file the build did not walk is unwalked, not a gap", TIMEOUT, async ({ plantedTree }) => {
  const walked = `${GRAPH_SOURCE}/home/`;
  const home = `${walked}a.ts`;
  const root = await plantedTree(
    graphTree({
      [home]: ["export interface A { readonly x: string }", 'export const made: A = { x: "1" };', "export const xOf = (a: A): string => a.x;"].join("\n"),
      [`${GRAPH_SOURCE}/away/use.ts`]: ['import type { A } from "../home/a.ts";', "export const awayOf = (a: A): string => a.x;"].join("\n"),
    }),
  );
  const report = await censusGraph(root, { sample: null }, () => undefined, { ...FRESH_BUILD, files: walked });
  expect(report.gaps).toEqual([]);
  expect(report.sites).toEqual(counted({ placed: 2, unwalked: 1 }));
});

// x, y and z are read and w is only written, so w sits in an unread bucket: a sample of one asks w and one read member.
test("a sample asks every member an unread bucket holds and an even spread of the rest", TIMEOUT, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      [FILE]: [
        "export interface A { readonly x: string; readonly y: string; readonly z: string; readonly w: string }",
        'export const made: A = { x: "1", y: "2", z: "3", w: "4" };',
        "export const read = (a: A): string => a.x + a.y + a.z;",
      ].join("\n"),
    }),
  );
  const whole = await censusGraph(root, { sample: null }, () => undefined);
  expect(whole.members).toEqual({ asked: 4, of: 4, unread: 1, unresolved: 0 });
  const sampled = await censusGraph(root, { sample: 1 }, () => undefined);
  expect(sampled.members).toEqual({ asked: 2, of: 4, unread: 1, unresolved: 0 });
  expect(sampled.sites).toEqual(counted({ placed: 3 }));
});

test("pnpm unwired graph-census prints its top gap shapes and writes the report as JSON and as text", TIMEOUT, async ({ plantedTree, runCli, scratch }) => {
  const root = await plantedTree(
    graphTree({ [FILE]: ["export interface A { readonly x: string; readonly y: number }", 'export const made: A = { x: "1", y: 2 };'].join("\n") }),
  );
  const out = join(scratch, "census.json");
  const run = await runCli("unwired", ["graph-census", `--ablate=${KEYS_OFF}`, `--root=${root}`, `--out=${out}`]);
  await expect(run).toExitWith(EXIT.clean);
  expect(run.stdout).toBe(`2\tproduct 2\tof 2\t${KEY_IN_INITIALIZER}\n`);
  expect(run.stderr).toContain(
    "members=2/2 unread=2 unresolved=0 placed=0 unclassified=0 unwalked=0 enclosing=0 elsewhere=0 declares=0 column=0 gap=2 gap-shapes=1",
  );
  expect(existsSync(out)).toBe(true);
  expect(readFileSync(join(scratch, "census.txt"), "utf8")).toContain(`2\tproduct 2\tof 2\t${KEY_IN_INITIALIZER}\n  sites placed=0`);
});

test("graph-census refuses --from before any build, since its role sites come from its own build", SPAWNS_CLI, async ({ runCli, scratch }) => {
  const refused = await runCli("unwired", ["graph-census", `--root=${scratch}`, `--from=${join(scratch, "graph.dump")}`]);
  await expect(refused).toExitWith(EXIT.misuse);
  expect(refused.stderr).toContain("graph-census reads the role sites of its own build");
});

// drizzle-orm's write builders in miniature: `values` takes a slot of the library's own mapped type.
const STORE_PACKAGE = "drizzle-orm";
const STORES = libraryModule(
  [
    "export interface Column { readonly name: string }",
    "export declare const text: () => Column;",
    "export interface TableConfig<C> { readonly columns: C }",
    'export interface Table<T extends TableConfig<unknown>> { readonly _: T; readonly $inferSelect: { [K in keyof T["columns"]]: string } }',
    "export declare function sqliteTable<C>(name: string, columns: C, extra?: (table: C) => readonly unknown[]): Table<TableConfig<C>> & C;",
    'export type Insert<T> = T extends Table<infer Config> ? { [K in keyof Config["columns"] as K & string]?: unknown } : never;',
    "export declare const db: { insert<T>(table: T): { values(value: Insert<T>): Promise<void> } };",
  ],
  STORE_PACKAGE,
);
const SCHEMA = "packages/db/src/schema/tables.ts";

// A member copied into a Drizzle column is read only where the column is read back (design.md, the unwired-code
// ledger), so the walk gives the copy no role of its own. The census counts that ruled silence as carried by the column,
// never as a gap; a read nested in a call or sitting outside a store is the graph's own.
test("a member a Drizzle store copies into a column is carried by the column, no gap", TIMEOUT, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      ...STORES,
      [SCHEMA]: [
        `import { sqliteTable, text } from "${STORE_PACKAGE}";`,
        'export const notes = sqliteTable("notes", { title: text(), body: text(), id: text() });',
      ].join("\n"),
      [FILE]: [
        `import { db } from "${STORE_PACKAGE}";`,
        'import { notes } from "../../db/src/schema/tables.ts";',
        "export interface Src { readonly title: string; readonly body?: string; readonly alt: string; readonly id: number }",
        "export const store = (src: Src): Promise<void> => db.insert(notes).values({ title: src.title, body: src.body ?? src.alt, id: String(src.id) });",
        "export const plain = (src: Src): string => src.title;",
      ].join("\n"),
    }),
  );
  const report = await censusGraph(root, { sample: null }, () => undefined);
  expect(report.gaps).toEqual([]);
  expect(report.sites).toEqual(counted({ column: 3, placed: 2 }));
});

// A `typeof a.x` query names the member `x` by key: it takes the key role a `T["x"]` does. `B.x` shares the name and
// nothing queries it.
test("a member a typeof query names is a key use, and a same-named member of another type is not", TIMEOUT, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      [FILE]: [
        "export interface A { readonly x: string; readonly y: string }",
        "export interface B { readonly x: string }",
        "export declare const a: A;",
        "export declare const b: B;",
        "export type Queried = typeof a.x;",
        "export type Whole = typeof b;",
      ].join("\n"),
    }),
  );
  const report = await censusGraph(root, { sample: null }, () => undefined);
  const queried = "Identifier < QualifiedName.right < TypeQuery.exprName < TypeAliasDeclaration.type";
  expect(report.gaps).toEqual([]);
  expect(handledAt(report, queried)).toEqual({ shape: queried, sites: 1, classes: counted({ placed: 1 }), roles: ["key"] });
});

// A getter in an object literal typed as `I` fills `I.seen`: the literal's key is a site the graph gives the write a
// method key gets.
test("a getter in a typed object literal is a placed write of the member it fills", TIMEOUT, async ({ plantedTree }) => {
  const root = await plantedTree(
    graphTree({
      [FILE]: [
        "export interface I { readonly seen?: number }",
        "export const made: I = {",
        "  get seen(): number {",
        "    return 1;",
        "  },",
        "};",
        "export const n = made.seen;",
      ].join("\n"),
    }),
  );
  const report = await censusGraph(root, { sample: null }, () => undefined);
  const getter = "Identifier < GetAccessor.name < ObjectLiteralExpression.properties < VariableDeclaration.initializer";
  expect(report.gaps).toEqual([]);
  expect(handledAt(report, getter)).toEqual({ shape: getter, sites: 1, classes: counted({ placed: 1 }), roles: ["write"] });
});
