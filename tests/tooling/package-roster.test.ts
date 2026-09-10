import { basename } from "node:path";
import process from "node:process";
import knipConfig from "../../knip.ts";
import { WORKSPACE_PACKAGES } from "../../tooling/src/ast/lib/root.ts";
import { PACKAGE_RESOURCE_PATHS } from "../../tooling/src/verify/contract/resource-config.ts";
import { readPolicyRepositoryInventory, readPolicyWorkspacePackages } from "../../tooling/src/verify/lib/policy-repo-inventory.ts";
import { expect, test } from "../support/tool-fixtures.ts";

test("world intent, package metadata and Knip match the native packages/* workspace", () => {
  const inventory = readPolicyRepositoryInventory(process.cwd());
  const nativePackages = readPolicyWorkspacePackages(inventory)
    .filter(({ path }) => path.startsWith("packages/"))
    .map(({ path }) => basename(path))
    .toSorted();
  expect(nativePackages).toContain("showcase-plugins");
  expect([...WORKSPACE_PACKAGES].toSorted()).toEqual(nativePackages);

  const resourcePackages = Object.keys(PACKAGE_RESOURCE_PATHS)
    .filter((id) => id !== "root" && id !== "tooling")
    .toSorted();
  expect(resourcePackages).toEqual(nativePackages);

  const workspaces = (knipConfig as { readonly workspaces?: Readonly<Record<string, unknown>> }).workspaces ?? {};
  const knipPackages = Object.keys(workspaces)
    .filter((workspace) => workspace.startsWith("packages/"))
    .map((workspace) => workspace.slice("packages/".length))
    .toSorted();
  expect(knipPackages).toEqual(nativePackages);
});
