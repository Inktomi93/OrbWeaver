// Live compiler inventory needs the repository resource; scratch scope cases stay in the unit suite.
import { readPolicyRepositoryInventory } from "../../../../tooling/src/verify/lib/policy-repo-inventory.ts";
import { resolvePolicyScope } from "../../../../tooling/src/verify/lib/policy-scope.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

test("the real workspace maps @orb/tooling without a hard-coded package path table", { timeout: scaledBudget(10_000) }, ({ repoRoot }) => {
  const tooling = resolvePolicyScope(repoRoot, { kind: "package", name: "@orb/tooling" });
  expect(tooling.workspacePackage).toEqual({ name: "@orb/tooling", path: "tooling" });
  expect(tooling.currentPaths).toContain("tooling/package.json");
  expect(tooling.programs.find((program) => program.id === "tooling/tsconfig.json")?.files).toContain("tooling/src/verify/lib/selection.ts");
  expect(tooling.programs.find((program) => program.id === "tooling/tsconfig.json")?.configPaths).toContain("tooling/tsconfig.json");
  expect(readPolicyRepositoryInventory(repoRoot).paths).toEqual(expect.arrayContaining([".agents/skills", ".codex/hooks"]));
});
