// The deep-imports codemod over a planted git tree: a same-module climb becomes `#src/`, a cross-module one
// enters the target's front door, and the door gains exactly the re-exports it lacked, types as `export type`.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { planDeepImports } from "../../../../tooling/src/codemod/index.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";

const MANIFEST = JSON.stringify({ name: "@t/p", imports: { "#*": "./src/*/index.ts" } });
const TSCONFIG = JSON.stringify({ compilerOptions: { module: "nodenext", moduleResolution: "nodenext", allowImportingTsExtensions: true, noEmit: true } });

async function gitTree(plantedTree: (files: Readonly<Record<string, string>>) => Promise<string>, files: Readonly<Record<string, string>>): Promise<string> {
  const root = await plantedTree({ "tsconfig.json": TSCONFIG, "packages/p/package.json": MANIFEST, ...files });
  execFixtureGit(root, ["init", "-q"]);
  return root;
}

const FILES = {
  "packages/p/src/a/x/use.ts":
    'import type { T } from "../../b/t.ts";\nimport { z } from "../../b/z.ts";\nimport { q } from "../../a/q.ts";\nexport const u: T = `${z}${q}`;\n',
  "packages/p/src/a/q.ts": 'export const q = "q";\n',
  "packages/p/src/b/t.ts": "export type T = string;\n",
  "packages/p/src/b/z.ts": 'export const z = "z";\n',
};

test("same-module climbs take #src/, cross-module ones take the door, and the door gains type and value re-exports", async ({ plantedTree }) => {
  const root = await gitTree(plantedTree, FILES);
  const result = planDeepImports(root);

  expect(result.notes).toEqual([]);
  expect(result.writes.get("packages/p/src/a/x/use.ts")).toBe(
    'import type { T } from "#b";\nimport { z } from "#b";\nimport { q } from "#src/a/q.ts";\nexport const u: T = `${z}${q}`;\n',
  );
  expect(result.writes.get("packages/p/src/b/index.ts")).toBe('export { z } from "./z.ts";\nexport type { T } from "./t.ts";\n');
  expect(JSON.parse(result.writes.get("packages/p/package.json") ?? "{}")).toHaveProperty("imports", { "#*": "./src/*/index.ts", "#src/*": "./src/*" });
});

test("a narrow importer keeps its leaf through #src/ and widens no door", async ({ plantedTree }) => {
  const root = await gitTree(plantedTree, FILES);
  const result = planDeepImports(root, [], ["packages/p/src/a/x/use.ts"]);

  expect(result.writes.get("packages/p/src/a/x/use.ts")).toContain('import { z } from "#src/b/z.ts";');
  expect(result.writes.has("packages/p/src/b/index.ts")).toBe(false);
});

test("an aliased re-export already at the door preserves its origin and adds no duplicate", async ({ plantedTree }) => {
  const root = await gitTree(plantedTree, {
    "packages/p/src/a/x/use.ts": 'import { Public as Local } from "../../b/alias.ts";\nexport const answer = Local;\n',
    "packages/p/src/b/value.ts": "export const Original = 1;\n",
    "packages/p/src/b/alias.ts": 'export { Original as Public } from "./value.ts";\n',
    "packages/p/src/b/index.ts": 'export { Public } from "./alias.ts";\n',
  });

  const result = planDeepImports(root);

  expect(result.notes).toEqual([]);
  expect(result.respelled).toBe(1);
  expect(result.doorExports).toBe(0);
  expect(result.writes.get("packages/p/src/a/x/use.ts")).toBe('import { Public as Local } from "#b";\nexport const answer = Local;\n');
  expect(result.writes.has("packages/p/src/b/index.ts")).toBe(false);
});

test("a conflicting origin and a missing target export remain refusals instead of guessed door edits", async ({ plantedTree }) => {
  const root = await gitTree(plantedTree, {
    "packages/p/src/a/x/use.ts": 'import { Value } from "../../b/value.ts";\nimport type { Missing } from "../../b/type.ts";\n',
    "packages/p/src/b/value.ts": "export const Value = 1;\n",
    "packages/p/src/b/other.ts": "export const Value = 2;\n",
    "packages/p/src/b/type.ts": "export interface Present {}\n",
    "packages/p/src/b/index.ts": 'export { Value } from "./other.ts";\n',
  });

  const result = planDeepImports(root);

  expect(result.respelled).toBe(0);
  expect(result.doorExports).toBe(0);
  expect(result.notes).toEqual([
    { file: "packages/p/src/a/x/use.ts", line: 1, text: "../../b/value.ts", reason: "packages/p/src/b/index.ts already exports a different Value" },
    { file: "packages/p/src/a/x/use.ts", line: 2, text: "../../b/type.ts", reason: "packages/p/src/b/type.ts exports no Missing" },
  ]);
  expect(result.writes.has("packages/p/src/a/x/use.ts")).toBe(false);
  expect(result.writes.has("packages/p/src/b/index.ts")).toBe(false);
});

test("every module position the package-deep-import gate reads is re-spelled or refused, not only declarations", async ({ plantedTree }) => {
  const root = await gitTree(plantedTree, {
    ...FILES,
    "packages/p/src/a/x/lazy.ts":
      'export const load = () => import("../../a/q.ts");\n' +
      'export type Q = import("../../a/q.ts").Q;\n' +
      'export const required = require("../../b/z.ts");\n' +
      "export const data = `../../a/q.ts`;\n",
    "packages/p/src/a/q.ts": 'export const q = "q";\nexport type Q = string;\n',
  });

  const result = planDeepImports(root);

  expect(result.writes.get("packages/p/src/a/x/lazy.ts")).toBe(
    'export const load = () => import("#src/a/q.ts");\n' +
      'export type Q = import("#src/a/q.ts").Q;\n' +
      'export const required = require("../../b/z.ts");\n' +
      "export const data = `../../a/q.ts`;\n",
  );
  expect(result.notes).toEqual([
    {
      file: "packages/p/src/a/x/lazy.ts",
      line: 3,
      text: "../../b/z.ts",
      reason: "a call or import() type crosses into b; it names no binding to route through the front door",
    },
  ]);
});

test("narrow graph closure follows static re-export cycles but does not admit dynamic-only consumers", async ({ plantedTree }) => {
  const root = await gitTree(plantedTree, {
    ...FILES,
    "packages/p/src/entry.ts": 'export * from "./a/x/use.ts";\nexport const lazy = () => import("./c/x/use.ts");\n',
    "packages/p/src/a/x/use.ts": `${FILES["packages/p/src/a/x/use.ts"]}export * from "../../entry.ts";\n`,
    "packages/p/src/c/x/use.ts": 'import { z } from "../../b/z.ts";\nexport const dynamicOnly = z;\n',
  });

  const result = planDeepImports(root, ["./packages/p/src/entry.ts"]);

  expect(result.notes).toEqual([]);
  expect(result.writes.get("packages/p/src/a/x/use.ts")).toContain('import { z } from "#src/b/z.ts";');
  expect(result.writes.get("packages/p/src/c/x/use.ts")).toBe('import { z } from "#b";\nexport const dynamicOnly = z;\n');
  expect(result.writes.get("packages/p/src/b/index.ts")).toBe('export { z } from "./z.ts";\n');
});
