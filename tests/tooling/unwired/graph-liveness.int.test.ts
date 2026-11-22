// Which units the product reaches: from the entries, through run edges a unit's body holds; a unit reached only
// through a type position is type-only, one a kept JSDoc tag names is kept by ruling, and a doc link to a name no
// declaration has is stale.
import { expect, test } from "@orb/testkit/tooling";
import type { Bucket, GraphScan } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphScan } from "./_planted.ts";

const MAIN = `${GRAPH_SOURCE}/main.ts`;
const LIB = `${GRAPH_SOURCE}/lib.ts`;
const KEEP_TAG = "keep";
const labels = (scan: GraphScan, bucket: Bucket): readonly string[] => scan.analysis[bucket].map(({ label }) => label);

test("an entry reaches what it runs; a typeof-only unit is type-only, a tagged one kept, the rest dead", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    {
      [MAIN]: ['import { run, type Shape } from "./lib.ts";', "const shape: Shape = { a: 1 };", "run(shape);"].join("\n"),
      [LIB]: [
        "const helper = (): number => 1;",
        "export const run = (_: object): number => helper();",
        "export const DEFAULTS = { a: 1 };",
        "export type Shape = typeof DEFAULTS;",
        "export const orphan = (): number => 2;",
        `/** @${KEEP_TAG} */`,
        "export const tagged = (): number => 3;",
      ].join("\n"),
    },
    { entries: [MAIN], tags: [KEEP_TAG] },
  );
  expect(labels(scan, "dead")).toEqual([`${LIB}:orphan`]);
  expect(labels(scan, "type-only")).toEqual([`${LIB}:DEFAULTS`]);
  expect(labels(scan, "kept-by-ruling")).toContain(`${LIB}:tagged`);
});

test("a doc link to a name nothing declares is stale; one to a declared name out of scope is cross-scope", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    {
      [MAIN]: ["/** Calls {@link Gone} and {@link inner}. */", "export const run = (): number => 1;", "run();"].join("\n"),
      [LIB]: ["export const outer = (): number => {", "  const inner = (): number => 1;", "  return inner();", "};"].join("\n"),
    },
    { entries: [MAIN] },
  );
  expect(labels(scan, "doc-link-stale")).toEqual([`${MAIN}:1 Gone`]);
  expect(labels(scan, "doc-link-cross-scope")).toEqual([`${MAIN}:1 inner`]);
});
