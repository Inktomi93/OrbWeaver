// Program discovery uses authored paths and compiler references, independent of directory layout.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execNicedSync } from "@orb/tooling/_shared/proc";
import type { PolicyProgramMembership } from "../../../../tooling/src/verify/contract/policy-scope.ts";
import { readAvailablePolicyPrograms, readPolicyProgramGraph } from "../../../../tooling/src/verify/lib/policy-program-membership.ts";
import { readPolicyRepositoryInventory } from "../../../../tooling/src/verify/lib/policy-repo-inventory.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function plant(root: string, files: Readonly<Record<string, string>>): void {
  execNicedSync("git", ["init", "--quiet", "--template=", "--initial-branch=main"], { cwd: root });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

test("nested variants and a references-only solution are discovered without a program list", ({ scratch }) => {
  plant(scratch, {
    ".gitignore": "node_modules/\nreports/\n",
    "tsconfig.json": '{ "files": [], "references": [{ "path": "./scripts/probe-world" }] }',
    "scripts/probe-world/tsconfig.json": '{ "files": ["a.ts"] }',
    "scripts/probe-world/a.ts": "export const a = 1;",
    "packages/a/tsconfig.browser.json": '{ "files": ["src/a.ts"] }',
    "packages/a/src/a.ts": "export const a = 1;",
    "node_modules/tsconfig.json": "{",
    "reports/tsconfig.json": "{",
  });
  const read = (): readonly PolicyProgramMembership[] => readAvailablePolicyPrograms(readPolicyRepositoryInventory(scratch));
  expect(read().map((program) => program.config)).toEqual(["packages/a/tsconfig.browser.json", "scripts/probe-world/tsconfig.json", "tsconfig.json"]);
  expect(read().find((program) => program.config === "tsconfig.json")?.references).toEqual(["scripts/probe-world/tsconfig.json"]);
  writeFileSync(join(scratch, "tsconfig.extra.json"), '{ "files": ["scripts/probe-world/a.ts"] }');
  expect(read().find((program) => program.config === "tsconfig.extra.json")?.files).toEqual(["scripts/probe-world/a.ts"]);
});

test("used and unused files-empty templates stay abstract while their leaf retains inherited ownership", ({ scratch }) => {
  plant(scratch, {
    "tsconfig.world.json": '{ "files": [] }',
    "tsconfig.unused.json": '{ "files": [] }',
    "packages/a/tsconfig.json": '{ "extends": "../../tsconfig.world.json", "include": ["src"] }',
    "packages/a/src/a.ts": "export const a = 1;",
  });
  const inventory = readPolicyRepositoryInventory(scratch);
  const programs = readAvailablePolicyPrograms(inventory);
  expect(programs.map((program) => program.config)).toEqual(["packages/a/tsconfig.json"]);
  expect(programs[0]?.configPaths).toEqual(["packages/a/tsconfig.json", "tsconfig.world.json"]);
  expect(() => readPolicyProgramGraph(inventory, ["tsconfig.unused.json"])).toThrow(/zero authored files/u);
});

test("empty templates never absolve an unmatched include or a broken reference", ({ scratch }) => {
  plant(scratch, {
    "tsconfig.world.json": '{ "files": [] }',
    "tsconfig.json": '{ "extends": "./tsconfig.world.json", "include": ["missing/**/*.ts"] }',
  });
  const read = (): readonly PolicyProgramMembership[] => readAvailablePolicyPrograms(readPolicyRepositoryInventory(scratch));
  expect(read).toThrow(/zero authored files/u);
  writeFileSync(join(scratch, "tsconfig.json"), '{ "files": [], "references": [{ "path": "./missing" }] }');
  expect(read).toThrow(/reference/u);
  writeFileSync(join(scratch, "tsconfig.json"), '{ "extends": "./missing.json" }');
  expect(read).toThrow(/could not parse/u);
});

test("declaration-only projects keep an owner; they are not empty templates", ({ scratch }) => {
  plant(scratch, {
    "tsconfig.json": '{ "files": ["ambient.d.ts"] }',
    "ambient.d.ts": "export {};",
  });
  const programs = readAvailablePolicyPrograms(readPolicyRepositoryInventory(scratch));
  expect(programs.map((program) => program.config)).toEqual(["tsconfig.json"]);
  expect(programs[0]?.files).toEqual(["ambient.d.ts"]);
});

test("the real programs are shared across policy scope and membership checking", ({ repoRoot }) => {
  const programs = readAvailablePolicyPrograms(readPolicyRepositoryInventory(repoRoot));
  expect(programs.map((program) => program.config)).toEqual(
    expect.arrayContaining(["tsconfig.json", "tsconfig.tests-dom.json", "packages/showcase-plugins/tsconfig.json", "tooling/tsconfig.json"]),
  );
  expect(programs.some((program) => program.config === "tsconfig.base.json")).toBe(false);
  expect(programs.find((program) => program.config === "tooling/tsconfig.json")?.files).toContain("tooling/src/verify/lib/selection.ts");
});
