// Live authored compiler programs require the repository resource; virtual program controls stay unit-owned.
import { compilerConfigRoster, readAvailablePolicyPrograms } from "../../../../tooling/src/verify/lib/policy-program-membership.ts";
import { readPolicyRepositoryInventory } from "../../../../tooling/src/verify/lib/policy-repo-inventory.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the roster is derived from a path inventory, never from a directory walk", ({ repoRoot }) => {
  const roster = compilerConfigRoster(readPolicyRepositoryInventory(repoRoot).paths);
  expect(roster).toEqual(expect.arrayContaining(["tsconfig.json", "tsconfig.base.json", "packages/ui/tsconfig.json", "tooling/tsconfig.json"]));
  // Strictly broader than the three directories the retired `readdirSync` roster looked in, and it includes
  // the TEMPLATE configs program discovery excludes — an entry in a template is authored authority too.
  expect(roster.some((config) => config.endsWith("tsconfig.world-node.json"))).toBe(true);
  expect(roster.every((config) => /(?:^|\/)tsconfig[^/]*\.json$/u.test(config))).toBe(true);
});

test("the real programs are shared across policy scope and membership checking", ({ repoRoot }) => {
  const programs = readAvailablePolicyPrograms(readPolicyRepositoryInventory(repoRoot));
  expect(programs.map((program) => program.config)).toEqual(
    expect.arrayContaining(["tsconfig.json", "tsconfig.tests-dom.json", "packages/showcase-plugins/tsconfig.json", "tooling/tsconfig.json"]),
  );
  expect(programs.some((program) => program.config === "tsconfig.base.json")).toBe(false);
  expect(programs.find((program) => program.config === "tooling/tsconfig.json")?.files).toContain("tooling/src/verify/lib/selection.ts");
});
