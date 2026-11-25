// A module a call loads: node:module's createRequire makes a require function whose literal relative path runs its
// module as an import does, and a load by a computed path, through it or through import(), is reported with its site.
import { expect, test } from "@orb/testkit/tooling";
import { GRAPH_SOURCE, graphScan, labelsIn, NODE_TYPES } from "./_planted.ts";

const MAIN = `${GRAPH_SOURCE}/main.ts`;
const LOADED = `${GRAPH_SOURCE}/loaded.ts`;
const UNLOADED = `${GRAPH_SOURCE}/unloaded.ts`;
const LOCAL = `${GRAPH_SOURCE}/local.ts`;
const RUNS = (name: string): string => `const ${name} = (): number => 1;\n${name}();`;

test("a literal require runs its module; a computed require or import() is reported at its site", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    {
      ...NODE_TYPES,
      [MAIN]: [
        '/// <reference types="node" />',
        'import { createRequire } from "node:module";',
        'import * as nodeModule from "node:module";',
        'import { createRequire as makeLocal } from "./local.ts";',
        "declare const pick: () => string;",
        "const load = createRequire(import.meta.url);",
        'load("./loaded.ts");',
        "const name = pick();",
        "load(name);",
        "nodeModule.createRequire(import.meta.url)(name);",
        "void import(name);",
        'makeLocal(import.meta.url)("./unloaded.ts");',
      ].join("\n"),
      [LOCAL]: "export const createRequire = (_from: string) => (_id: string): unknown => null;",
      [LOADED]: RUNS("loadedRuns"),
      [UNLOADED]: RUNS("unloadedRuns"),
    },
    { entries: [MAIN] },
  );
  expect({ dead: labelsIn(scan, "dead", UNLOADED), loaded: labelsIn(scan, "dead", LOADED), computed: labelsIn(scan, "module-load-computed", MAIN) }).toEqual({
    dead: ["unloadedRuns"],
    loaded: [],
    computed: ["9 name", "10 name", "11 name"],
  });
});
