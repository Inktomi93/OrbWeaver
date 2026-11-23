// Bindings: a local, a parameter or an import binding nothing reads is unread, judged as tsc's noUnusedLocals and
// noUnusedParameters judge it; one read only by code nothing reaches is reported with the dead code that reads it.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { scanGraph } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphScan, graphTree } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/bindings.ts`;
const LIB = `${GRAPH_SOURCE}/lib.ts`;
const LIB_SOURCE = [
  'export const KEY = "k";',
  "export type DocOnly = { readonly n: number };",
  "export const used = 1;",
  "export const unusedImport = 2;",
  "export const reexported = 3;",
  "export type Shape = { readonly n: number };",
].join("\n");
const lineOf = (source: string, needle: string): number => source.split("\n").findIndex((line) => line.includes(needle)) + 1;
const inFile = (findings: readonly { readonly label: string; readonly note: string | null }[]): readonly (readonly [string, string | null])[] =>
  findings.filter(({ label }) => label.startsWith(`${FILE}:`)).map(({ label, note }) => [label.slice(FILE.length + 1), note]);

test("a binding nothing reads is unread; one read, typed, re-exported or left out as tsc leaves it is not", { timeout: 120_000 }, async ({ plantedTree }) => {
  const source = [
    'import { used, unusedImport, reexported } from "./lib.ts";',
    'import type { Shape } from "./lib.ts";',
    'import * as wholeModule from "./lib.ts";',
    "export { reexported };",
    "export const run = (kept: number, spare: number, _skipped: number): number => {",
    "  const local = kept + used;",
    "  let onlyWritten = 0;",
    "  onlyWritten = 2;",
    "  const { omitted, ...rest } = { omitted: 1, b: 2 };",
    "  const typed: typeof local = local;",
    "  const shaped: Shape = { n: typed };",
    "  try { void shaped; } catch (error) {}",
    "  using held = { [Symbol.dispose](): void {} };",
    "  return typed + rest.b;",
    "};",
    "declare function overloaded(value: number): void;",
    "export class Keeper {",
    "  constructor(private readonly field: number) {}",
    "  method(this: Keeper, unusedParam: number): number { return this.field; }",
    "}",
  ].join("\n");
  const scan = await graphScan(plantedTree, { [LIB]: LIB_SOURCE, [FILE]: source });
  expect(inFile(scan.analysis["binding-unread"])).toEqual([
    [`${String(lineOf(source, "unusedImport"))} unusedImport`, "import"],
    [`${String(lineOf(source, "wholeModule"))} wholeModule`, "import"],
    [`${String(lineOf(source, "spare"))} spare`, "parameter"],
    [`${String(lineOf(source, "let onlyWritten"))} onlyWritten`, "local, only written"],
    [`${String(lineOf(source, "unusedParam"))} unusedParam`, "parameter"],
  ]);
});

test("a binding read only by code nothing reaches names the dead reader; one a live reader reads is not reported", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const source = [
    'import { used, unusedImport, reexported } from "./lib.ts";',
    "const deadReader = (): number => used;",
    "export class Live { spare(): number { return unusedImport; } shown(): number { return reexported; } }",
    "void new Live().shown();",
  ].join("\n");
  const root = await plantedTree(graphTree({ [LIB]: LIB_SOURCE, [FILE]: source }, { entries: [FILE] }));
  const scan = await scanGraph(root, () => undefined);
  expect(inFile(scan.analysis["binding-read-only-by-dead"])).toEqual([
    ["1 used", `import read only by ${FILE}:2 deadReader`],
    ["1 unusedImport", `import read only by ${FILE}:3 spare`],
  ]);
});

test("a binding read as a bracket key, a computed key, a loop target's use, a template part or a doc link is read", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const source = [
    'import { KEY } from "./lib.ts";',
    'import type { DocOnly } from "./lib.ts";',
    "export const { left, right } = { left: 1, right: 2 };",
    "export const [first] = [1];",
    "declare global { let ambientLet: number; }",
    "/** Fills {@link DocOnly}. */",
    "export const fill = (out: Record<string, number>, key: string, list: readonly number[], pairs: readonly [number, { at: number }][]): string => {",
    '  const local = "a";',
    "  out[local] = 1;",
    "  out[key] = 2;",
    "  for (const i of list) { out[i] = 3; }",
    "  for (const [y, { at }] of pairs) { out[y] = at; }",
    "  for (const k in out) { out[k] = 4; }",
    "  const literal = { [KEY]: 5 };",
    "  let total = 0;",
    "  total += 1;",
    "  const part = String(literal.k);",
    "  const helper = 1;",
    "  /** Counts as {@link helper} does. */",
    "  const counted = 2;",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the placeholder is the planted file's own template literal
    "  return `${part}${String(counted)}`;",
    "};",
  ].join("\n");
  const scan = await graphScan(plantedTree, { [LIB]: LIB_SOURCE, [FILE]: source });
  expect(inFile(scan.analysis["binding-unread"])).toEqual([[`${String(lineOf(source, "let total"))} total`, "local, only written"]]);
});

test("a binding whose reader only a test reaches is no dead read; one nothing reaches still is", { timeout: 120_000 }, async ({ plantedTree }) => {
  const main = `${GRAPH_SOURCE}/main.ts`;
  const source = [
    'import { used, unusedImport } from "./lib.ts";',
    "export const testedReader = (): number => used;",
    "const deadReader = (): number => unusedImport;",
    "export const live = 1;",
  ].join("\n");
  const scan = await graphScan(plantedTree, {
    "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "packages/a" }, { path: "tsconfig.outside.json" }] }),
    "tsconfig.outside.json": plantedTsconfig({ lib: ["ESNext"], include: ["tests"] }),
    "knip.ts": [
      `const config = ${JSON.stringify({ workspaces: { "packages/a": { entry: ["src/main.ts!"], project: ["src/**/*.ts!"] }, ".": { project: ["tests/**/*.ts"] } } })};`,
      "export default (_flags: { readonly production: boolean }) => config;",
      "export { config };",
    ].join("\n"),
    [main]: 'import { live } from "./bindings.ts";\nvoid live;',
    [LIB]: LIB_SOURCE,
    [FILE]: source,
    "tests/a/reader.test.ts": 'import { testedReader } from "../../packages/a/src/bindings.ts";\ntestedReader();',
  });
  expect(inFile(scan.analysis["binding-read-only-by-dead"])).toEqual([["1 unusedImport", `import read only by ${FILE}:3 deadReader`]]);
});
