// The test-subpaths codemod over a planted git tree: module specifiers from tests/ into a package's src take the root
// `#<package>/*` map; a path read as data is reported, never rewritten, and a package-root file is left alone.
import { planTestSubpaths } from "../../../../tooling/src/codemod/index.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

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
