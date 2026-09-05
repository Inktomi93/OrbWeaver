import type { SourceFile } from "ts-morph";

export const PACKAGE_RESOURCE_PATHS = {
  root: "package.json",
  client: "packages/client/package.json",
  contracts: "packages/contracts/package.json",
  db: "packages/db/package.json",
  kit: "packages/kit/package.json",
  server: "packages/server/package.json",
  ui: "packages/ui/package.json",
  tooling: "tooling/package.json",
} as const;

export type PackageResourceId = keyof typeof PACKAGE_RESOURCE_PATHS;

export const STATIC_CONFIG_RESOURCE_PATHS = {
  eslint: "eslint.config.js",
  depcruise: ".dependency-cruiser.cjs",
  vitest: "vitest.config.ts",
  playwright: "playwright.config.ts",
  ct: "playwright-ct.config.ts",
} as const;

export type StaticConfigResourceId = keyof typeof STATIC_CONFIG_RESOURCE_PATHS;

export type PackageStringMap = Readonly<Record<string, string>>;

export interface PackageDependencyFacts {
  readonly runtime: PackageStringMap;
  readonly development: PackageStringMap;
  readonly peer: PackageStringMap;
  readonly optional: PackageStringMap;
}

export interface PackageMetadata {
  readonly id: PackageResourceId;
  readonly path: string;
  readonly name: string;
  readonly private: boolean;
  readonly scripts: PackageStringMap;
  readonly dependencies: PackageDependencyFacts;
  readonly exports: PackageStringMap;
}

export interface StaticConfigRow {
  readonly key: string;
  readonly value: string;
  readonly line: number;
}

export interface StaticConfigFacts {
  readonly id: StaticConfigResourceId;
  readonly path: string;
  readonly rows: readonly StaticConfigRow[];
}

/** Parser injection keeps providers independent from Project construction and workspace ownership. */
export type StaticSourceParser = (path: string, text: string) => SourceFile;
