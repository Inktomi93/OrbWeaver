// A module a call loads: node:module's createRequire makes a require function whose literal relative path runs its
// module as an import does, and a load by a computed path, through it or through import(), is reported with its site.
import { expect, test } from "@orb/testkit/tooling";
import { GRAPH_SOURCE, graphScan, labelsIn } from "./_planted.ts";

const MAIN = `${GRAPH_SOURCE}/main.ts`;
const LOADED = `${GRAPH_SOURCE}/loaded.ts`;
const UNLOADED = `${GRAPH_SOURCE}/unloaded.ts`;
const RUNS = (name: string): string => `const ${name} = (): number => 1;\n${name}();`;

test("a literal require runs its module; a computed require or import() is reported at its site", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    {
      [MAIN]: [
        'import { createRequire } from "node:module";',
        'import * as nodeModule from "node:module";',
        "declare const pick: () => string;",
        "const load = createRequire(import.meta.url);",
        'load("./loaded.ts");',
        "const name = pick();",
        "load(name);",
        "nodeModule.createRequire(import.meta.url)(name);",
        "void import(name);",
      ].join("\n"),
      [LOADED]: RUNS("loadedRuns"),
      [UNLOADED]: RUNS("unloadedRuns"),
    },
    { entries: [MAIN] },
  );
  expect({ dead: labelsIn(scan, "dead", UNLOADED), loaded: labelsIn(scan, "dead", LOADED), computed: labelsIn(scan, "module-load-computed", MAIN) }).toEqual({
    dead: ["unloadedRuns"],
    loaded: [],
    computed: ["7 name", "8 name", "9 name"],
  });
});
