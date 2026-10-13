import type { InventoryConsumerClass } from "./semantic-inventory-contract.ts";

export const INVENTORY_TEST_FILE_RE = /\.(test|ct)\.tsx?$/u;
const PACKAGE_SOURCE_RE = /\/packages\/[^/]+\/src\//u;

/** The established inventory test population includes test-named files and the complete tests tree. */
export function isInventoryTestPath(path: string): boolean {
  return INVENTORY_TEST_FILE_RE.test(path) || path.includes("/tests/");
}

/** Shipped package source excludes tooling, scripts, probes, tests and package-root configuration. */
export function isInventoryPackageSourcePath(path: string): boolean {
  return PACKAGE_SOURCE_RE.test(path);
}

/** Test identity wins before package identity, matching the existing collectors. */
export function inventoryConsumerClass(path: string): InventoryConsumerClass {
  if (isInventoryTestPath(path)) {
    return "test";
  }
  return isInventoryPackageSourcePath(path) ? "product" : "tooling";
}
