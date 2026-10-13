// The test-subpaths codemod over a planted git tree: module specifiers from tests/ into a package's src take the root
// `#<package>/*` map; a path read as data is reported, never rewritten, and a package-root file is left alone.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { planTestSubpaths } from "../../../../tooling/src/codemod/index.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";

test("module specifiers move to the root map; data paths are reported; package-root files stay", async ({ plantedTree }) => {
  const root = await plantedTree({
    "package.json": JSON.stringify({ name: "root" }),
    "packages/server/src/domain/x.ts": "export const x = 1;\n",
    "packages/server/vite.config.ts": "export default {};\n",
    "packages/ui/src/theme.css": ".a {}\n",
    "tests/server/domain/x.test.ts":
      'import { x } from "../../../packages/server/src/domain/x.ts";\nvi.mock("../../../packages/server/src/domain/x.ts");\nimport config from "../../../packages/server/vite.config.ts";\nconst css = new URL("../../../packages/ui/src/theme.css", import.meta.url).pathname;\nexport const all = [x, config, css];\n',
  });
  execFixtureGit(root, ["init", "-q"]);
  const result = planTestSubpaths(root);

  expect(result.writes.get("tests/server/domain/x.test.ts")).toBe(
    'import { x } from "#server/domain/x.ts";\nvi.mock("#server/domain/x.ts");\nimport config from "../../../packages/server/vite.config.ts";\nconst css = new URL("../../../packages/ui/src/theme.css", import.meta.url).pathname;\nexport const all = [x, config, css];\n',
  );
  expect(JSON.parse(result.writes.get("package.json") ?? "{}")).toHaveProperty("imports", {
    "#server/*": "./packages/server/src/*",
    "#ui/*": "./packages/ui/src/*",
  });
});

test("test-subpaths shares relocation syntax but retains file URL and non-module refusal", async ({ plantedTree }) => {
  const specifier = "../../packages/kit/src/value.ts";
  const admitted = [
    `import { value } from "${specifier}";`,
    `export { value } from "${specifier}";`,
    `import old = require("${specifier}");`,
    `type Old = import("${specifier}").Old;`,
    `import("${specifier}");`,
    `require("${specifier}");`,
    `require.resolve("${specifier}");`,
    `import.meta.resolve("${specifier}");`,
    `createRequire(import.meta.url)("${specifier}");`,
    `vi.doUnmock("${specifier}");`,
  ];
  const data = [
    `new URL("${specifier}", import.meta.url);`,
    `vi["mock"]("${specifier}");`,
    `require("untracked", "${specifier}");`,
    `const path = "${specifier}";`,
  ];
  const before = `${[...admitted, ...data].join("\n")}\n`;
  const file = "tests/kit/positions.test.ts";
  const root = await plantedTree({
    "package.json": JSON.stringify({ name: "root" }),
    "packages/kit/src/value.ts": "export const value = 1;\n",
    [file]: before,
  });
  execFixtureGit(root, ["init", "-q"]);

  const result = planTestSubpaths(root);

  expect(result.writes.get(file)).toBe(`${[...admitted.map((line) => line.replace(specifier, "#kit/value.ts")), ...data].join("\n")}\n`);
  expect(result.notes).toEqual(
    data.map((_line, index) => ({
      file,
      line: admitted.length + index + 1,
      text: specifier,
      reason: "a path into a package outside a module position; its subpath would be #kit/value.ts",
    })),
  );
});
