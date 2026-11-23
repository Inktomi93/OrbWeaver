// Our own ambient declarations (a .d.ts the tree holds) are judged by what code outside them uses: a member or a
// declaration nothing outside the declaration files reaches is unused, and each declaration file the pass walked is
// listed.
import { expect, test } from "@orb/testkit/tooling";
import { GRAPH_SOURCE, graphScan } from "./_planted.ts";

const GLOBALS = `${GRAPH_SOURCE}/globals.d.ts`;

test("an ambient member or declaration only the declaration files reach is unused; a used one is not", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    [GLOBALS]: [
      "declare global {",
      "  interface OrbBridge { readonly orbFlag: boolean; readonly spareFlag: boolean }",
      "  const orbBridge: OrbBridge;",
      "  const ORB_BUILD: string;",
      "  const ORB_SPARE: string;",
      '  type OnlyAmbient = OrbBridge["spareFlag"];',
      "}",
      "export {};",
    ].join("\n"),
    [`${GRAPH_SOURCE}/main.ts`]: "console.log(orbBridge.orbFlag, ORB_BUILD);",
  });
  expect({
    unused: scan.analysis["ambient-unused"].map(({ label }) => label),
    walked: scan.analysis["ambient-files-walked"].map(({ label }) => label),
  }).toEqual({ unused: [`${GLOBALS}:global.ORB_SPARE`, `${GLOBALS}:global.OnlyAmbient`], walked: [GLOBALS] });
});
