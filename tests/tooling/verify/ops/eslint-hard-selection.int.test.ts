// Inference-only changes must reach the same mandatory ESLint path as explicit native scopes.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { REGISTRY, resolveSelection } from "../../../../tooling/src/verify/index.ts";
import { scaledBudget } from "../../_load-budget.ts";

const SOURCE = "packages/inference/src/index.ts";

test("inference-only changed, package and folder selections retain the real ESLint stage", { timeout: scaledBudget(180_000) }, ({ repoRoot }) => {
  const stage = REGISTRY.find(({ name }) => name === "lint:eslint");
  if (stage?.scopedArgv === undefined) {
    throw new Error("the native ESLint stage has no scoped entry");
  }
  const changed = resolveSelection({ kind: "changed", paths: [SOURCE] }, repoRoot);
  expect(changed.eslintPaths).toEqual([SOURCE]);
  expect(stage.scopedArgv(changed)).toEqual(["node", "tooling/src/verify/cli.ts", "eslint-scoped", SOURCE]);
  const packageSelection = resolveSelection({ kind: "package", name: "inference" }, repoRoot);
  expect(packageSelection.eslintPaths).toEqual(["packages/inference/"]);
  expect(stage.scopedArgv(packageSelection)).toEqual(["node", "tooling/src/verify/cli.ts", "eslint-scoped", "packages/inference/"]);
  const folderSelection = resolveSelection({ kind: "scope", glob: "packages/inference/src/**" }, repoRoot);
  expect(folderSelection.eslintPaths).toEqual(["packages/inference/src"]);
  expect(stage.scopedArgv(folderSelection)).toEqual(["node", "tooling/src/verify/cli.ts", "eslint-scoped", "packages/inference/src"]);
});
