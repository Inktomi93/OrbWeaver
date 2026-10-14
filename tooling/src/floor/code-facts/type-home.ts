// Package type-home intent; only sanctioned package contracts receive a path verdict here.
import type { PackageName } from "../compiler/project-worlds.ts";
import { PACKAGE_NAMES, worldOf } from "../compiler/project-worlds.ts";
import type { PackageTypeHomeClassification, PackageTypeHomePolicy } from "./type-home-contract.ts";

export const PACKAGE_TYPE_HOMES = {
  kit: { category: "primitive", nativePilot: false },
  contracts: { category: "wire", nativePilot: false },
  db: { category: "db-row", nativePilot: false },
  inference: { category: "package-contract", nativePilot: false },
  server: { category: "domain", nativePilot: false },
  "default-content": { category: "package-contract", nativePilot: true },
  "showcase-plugins": { category: "unqualified", nativePilot: false },
  "plugin-toolchain": { category: "package-contract", nativePilot: true },
  ui: { category: "component", nativePilot: false },
  client: { category: "client-view", nativePilot: false },
  "plugin-sdk": { category: "standalone-declarations", nativePilot: false },
} as const satisfies Readonly<Record<PackageName, PackageTypeHomePolicy>>;

export const TYPE_HOME_NATIVE_POLICY_ID = "type-home-direct-export";

function packageRoot(name: PackageName): string {
  return `packages/${name}/`;
}

function sourceRoot(name: PackageName): string {
  return `${packageRoot(name)}src/`;
}

function contractRoot(name: PackageName): string {
  return `${sourceRoot(name)}contract/`;
}

const NATIVE_PACKAGES = PACKAGE_NAMES.filter((name) => PACKAGE_TYPE_HOMES[name].nativePilot);
export const TYPE_HOME_NATIVE_SOURCE_GLOBS = NATIVE_PACKAGES.map((name) => `${sourceRoot(name)}**/*.{ts,tsx}`);
export const TYPE_HOME_NATIVE_CONTRACT_GLOBS = NATIVE_PACKAGES.map((name) => `${contractRoot(name)}**/*.{ts,tsx}`);

/** Classify the canonical package/world and answer only the sanctioned package-contract path question. */
export function packageTypeHome(path: string): PackageTypeHomeClassification | undefined {
  const packageName = PACKAGE_NAMES.find((name) => path.startsWith(packageRoot(name)));
  if (packageName === undefined) {
    return;
  }
  const policy = PACKAGE_TYPE_HOMES[packageName];
  return {
    packageName,
    world: worldOf(path),
    category: policy.category,
    home: policy.category === "package-contract" ? path.startsWith(contractRoot(packageName)) : null,
    nativePilot: policy.nativePilot,
  };
}
