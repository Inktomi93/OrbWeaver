// Package type-home intent; only sanctioned runtime and authoring contracts receive structural verdicts.
import { matchesGlob } from "node:path";
import type { PackageName } from "../compiler/project-worlds.ts";
import { PACKAGE_NAMES, worldOf } from "../compiler/project-worlds.ts";
import type { PackageTypeHomeClassification, PackageTypeHomePolicy } from "./type-home-contract.ts";

export const PACKAGE_TYPE_HOMES = {
  kit: { category: "primitive", nativePilot: false },
  contracts: { category: "wire", nativePilot: false },
  db: { category: "db-row", nativePilot: false },
  inference: { category: "package-contract", nativePilot: true },
  server: { category: "domain", nativePilot: false },
  "default-content": { category: "package-contract", nativePilot: true },
  "showcase-plugins": { category: "unqualified", nativePilot: false },
  "plugin-toolchain": { category: "package-contract", nativePilot: true },
  ui: { category: "component", nativePilot: false },
  client: { category: "client-view", nativePilot: false },
  "plugin-sdk": { category: "standalone-declarations", nativePilot: false },
} as const satisfies Readonly<Record<PackageName, PackageTypeHomePolicy>>;

export const UI_TOKEN_AUTHORING_CONTRACT_HOME = "packages/ui/token-contract.ts";

const TYPE_HOME_GENERATED_SUFFIX = ".gen.ts";
export const TYPE_HOME_NATIVE_UNADMITTED_GLOBS = [`**/*${TYPE_HOME_GENERATED_SUFFIX}`, "packages/server/src/domain/**/*.test.{ts,tsx}"] as const;

export const TYPE_HOME_NATIVE_POLICY_ID = "type-home-direct-export";
export const SERVER_FACTORY_TIER_REFERENCE_POLICY_ID = "server-factory-tier-reference";

// Tier-4 owns these driver/context APIs at their concrete canonical homes.
export const SERVER_TYPE_API_HOMES = [
  "packages/server/src/transport/trpc/context.ts",
  "packages/server/src/transport/rate-limit.ts",
  "packages/server/src/transport/trpc/presence-registry.ts",
  "packages/server/src/transport/trpc/stream/socket-registry.ts",
  "packages/server/src/transport/jobs/oidc-gc-scheduler.ts",
] as const;

/** The server tier that consumes or declares an API, independent of its spelling. */
export function serverTypeTier(path: string): string | undefined {
  const root = sourceRoot("server");
  return path.startsWith(root) ? path.slice(root.length).split("/")[0] : undefined;
}

/** Concrete transport homes retain their existing ownership, not a factory-signature exception. */
export function serverTypeApiHome(path: string): boolean {
  return SERVER_TYPE_API_HOMES.some((home) => path === home);
}
export const SERVER_FACTORY_TYPE_HOME_ROOTS = ["entry", "transport", "infra", "foundation"].map((tier) => `packages/server/src/${tier}/`);

function packageRoot(name: PackageName): string {
  return `packages/${name}/`;
}

function sourceRoot(name: PackageName): string {
  return `${packageRoot(name)}src/`;
}

/** The sanctioned structural package-contract directory, not a declaration ownership grant. */
export function packageContractHome(name: PackageName): string {
  return `${sourceRoot(name)}contract/`;
}

const NATIVE_PACKAGES = PACKAGE_NAMES.filter((name) => PACKAGE_TYPE_HOMES[name].nativePilot);
const NATIVE_SERVER_ROOTS = ["packages/server/src/domain", "packages/server/src/foundation/observability"] as const;
export const TYPE_HOME_NATIVE_SOURCE_GLOBS = [
  ...NATIVE_PACKAGES.map((name) => `${sourceRoot(name)}**/*.{ts,tsx}`),
  ...NATIVE_SERVER_ROOTS.map((root) => `${root}/**/*.{ts,tsx}`),
  ...SERVER_FACTORY_TYPE_HOME_ROOTS.map((root) => `${root}**/*.{ts,tsx}`),
];
export const TYPE_HOME_NATIVE_CONTRACT_GLOBS = [
  ...SERVER_TYPE_API_HOMES,
  ...NATIVE_PACKAGES.map((name) => `${packageContractHome(name)}**/*.{ts,tsx}`),
  ...NATIVE_SERVER_ROOTS.flatMap((root) => [`${root}/**/contract/**/*.{ts,tsx}`, `${root}/**/contract.ts`]),
  "packages/server/src/infra/*/contract/**/*.{ts,tsx}",
  "packages/server/src/infra/*/contract.ts",
  "packages/server/src/transport/trpc/contract/**/*.{ts,tsx}",
  "packages/server/src/transport/jobs/contract/**/*.{ts,tsx}",
  "packages/server/src/foundation/env/contract.ts",
];

/** Classify the canonical package/world and answer only the sanctioned package-contract path question. */
export function packageTypeHome(path: string): PackageTypeHomeClassification | undefined {
  const packageName = PACKAGE_NAMES.find((name) => path.startsWith(packageRoot(name)));
  if (packageName === undefined) {
    return;
  }
  const policy = PACKAGE_TYPE_HOMES[packageName];
  const world = worldOf(path);
  if (packageName === "ui" && world === "node" && !path.startsWith(sourceRoot(packageName))) {
    return { packageName, world, category: "authoring-contract", home: path === UI_TOKEN_AUTHORING_CONTRACT_HOME, nativePilot: false };
  }
  return {
    packageName,
    world,
    category: policy.category,
    home: policy.category === "package-contract" ? path.startsWith(packageContractHome(packageName)) : null,
    nativePilot: policy.nativePilot,
  };
}

/** Native placement owns every exported type and zod shape here; generated declarations retain their semantic owner. */
export function nativeTypeHomeAdmission(path: string): boolean {
  return (
    TYPE_HOME_NATIVE_SOURCE_GLOBS.some((pattern) => matchesGlob(path, pattern)) &&
    !TYPE_HOME_NATIVE_CONTRACT_GLOBS.some((pattern) => matchesGlob(path, pattern)) &&
    !TYPE_HOME_NATIVE_UNADMITTED_GLOBS.some((pattern) => matchesGlob(path, pattern))
  );
}

/** D324's existing server-tier population delegates both direct and local export lists. */
export function nativeFactoryTypeHomePopulation(path: string): boolean {
  return SERVER_FACTORY_TYPE_HOME_ROOTS.some((root) => path.startsWith(root)) && nativeTypeHomeAdmission(path);
}
