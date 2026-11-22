// Bindings: a local, a parameter or an import binding nothing reads is unread, judged as tsc's noUnusedLocals and
// noUnusedParameters judge it; one read only by code nothing reaches is reported with the dead code that reads it.
import { expect, test } from "@orb/testkit/tooling";
import { scanGraph } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphScan, graphTree } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/bindings.ts`;
const LIB = `${GRAPH_SOURCE}/lib.ts`;
const LIB_SOURCE = [
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
