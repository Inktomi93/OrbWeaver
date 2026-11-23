// A unit only code outside the product reaches is split by who reaches it: the testkit, tooling, or a test file itself;
// a unit nothing reaches whose initializer runs a call is an unused effect, apart from a dead one. Snap drives the real
// app, so what it reaches is product-used (D357).
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import type { Bucket, GraphScan } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphScan, LIB } from "./_planted.ts";

const MAIN = `${GRAPH_SOURCE}/main.ts`;
const UNITS = `${GRAPH_SOURCE}/units.ts`;
const KIT = "tests/support/kit.ts";
const TOOL = "tooling/src/tool.ts";
const DIRECT = "tests/a/units.test.ts";
const SNAP = "tooling/src/snap/drive.ts";
const labels = (scan: GraphScan, bucket: Bucket): readonly string[] => scan.analysis[bucket].map(({ label }) => label);

// A knip config that adds the tree's own tests and tooling to the population, beside the package's entry.
const KNIP = [
  `const config = ${JSON.stringify({ workspaces: { "packages/a": { entry: ["src/main.ts!"], project: ["src/**/*.ts!"] }, ".": { project: ["tests/**/*.ts", "tooling/**/*.ts"] } } })};`,
  "export default (_flags: { readonly production: boolean }) => config;",
  "export { config };",
].join("\n");

test("a unit the testkit, tooling or a test file alone reaches is split by its reacher; a dead call is an unused effect", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const scan = await graphScan(plantedTree, {
    "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "packages/a" }, { path: "tsconfig.outside.json" }] }),
    "tsconfig.outside.json": plantedTsconfig({ lib: LIB, include: ["tests", "tooling"] }),
    "knip.ts": KNIP,
    [MAIN]: 'import { used } from "./units.ts";\nused();',
    [UNITS]: [
      "export const used = (): number => 1;",
      "export const kitOnly = (): number => 2;",
      "export const toolOnly = (): number => 3;",
      "export const testOnly = (): number => 4;",
      "export const snapOnly = (): number => 7;",
      "const start = (): number => 5;",
      "export const started = start();",
      "export const plain = 6;",
    ].join("\n"),
    [KIT]: 'import { kitOnly } from "../../packages/a/src/units.ts";\nkitOnly();',
    [TOOL]: 'import { toolOnly } from "../../packages/a/src/units.ts";\ntoolOnly();',
    [SNAP]: 'import { snapOnly } from "../../../packages/a/src/units.ts";\nsnapOnly();',
    [DIRECT]: 'import { testOnly } from "../../packages/a/src/units.ts";\ntestOnly();',
  });
  expect({
    kit: labels(scan, "testkit-only"),
    tool: labels(scan, "tooling-only"),
    direct: labels(scan, "test-direct-only"),
    effect: labels(scan, "unused-effect"),
    dead: labels(scan, "dead"),
  }).toEqual({
    kit: [`${UNITS}:kitOnly`],
    tool: [`${UNITS}:toolOnly`],
    direct: [`${UNITS}:testOnly`],
    effect: [`${UNITS}:started`],
    dead: [`${UNITS}:start`, `${UNITS}:plain`],
  });
});

// A leading underscore pins a top-level binding unread on purpose (noUnusedLocals' convention), so what it reaches is
// kept. Only a product file's pin is a ruling: a pin in a test keeps nothing.
test("a product pin keeps what it reaches; a test's pin keeps nothing", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "packages/a" }, { path: "tsconfig.outside.json" }] }),
    "tsconfig.outside.json": plantedTsconfig({ lib: LIB, include: ["tests", "tooling"] }),
    "knip.ts": KNIP,
    [MAIN]: 'import { used } from "./units.ts";\nused();',
    [UNITS]: [
      "export const used = (): number => 1;",
      "export const pinned = (): number => 2;",
      "export const testPinned = (): number => 3;",
      "const _pin = pinned();",
      "const unpinned = pinned();",
    ].join("\n"),
    [DIRECT]: 'import { testPinned } from "../../packages/a/src/units.ts";\nconst _testPin = testPinned();',
  });
  // the test's pin is an unused binding like any other, so the unit only its initializer calls is dead
  expect({ kept: labels(scan, "kept-by-ruling"), dead: labels(scan, "dead"), effect: labels(scan, "unused-effect") }).toEqual({
    kept: [`${UNITS}:pinned`, `${UNITS}:_pin`],
    dead: [`${UNITS}:testPinned`],
    effect: [`${UNITS}:unpinned`],
  });
});
