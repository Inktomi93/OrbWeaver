// The deep-imports codemod over a planted git tree: a same-module climb becomes `#src/`, a cross-module one
// enters the target's front door, and the door gains exactly the re-exports it lacked, types as `export type`.
import { planDeepImports } from "../../../../tooling/src/codemod/index.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

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
