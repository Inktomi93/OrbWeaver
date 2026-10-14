import type { PackageName, World } from "../compiler/project-worlds.ts";

export const TYPE_HOME_CATEGORIES = [
  "primitive",
  "wire",
  "db-row",
  "domain",
  "client-view",
  "component",
  "package-contract",
  "standalone-declarations",
  "unqualified",
] as const;
export type TypeHomeCategory = (typeof TYPE_HOME_CATEGORIES)[number];

export type PackageTypeHomePolicy =
  | { readonly category: Extract<TypeHomeCategory, "package-contract">; readonly nativePilot: boolean }
  | { readonly category: Exclude<TypeHomeCategory, "package-contract">; readonly nativePilot: false };

/** A null home answer requires a declaration-semantic judgment rather than path admission. */
export interface PackageTypeHomeClassification {
  readonly packageName: PackageName;
  readonly world: World | undefined;
  readonly category: TypeHomeCategory;
  readonly home: boolean | null;
  readonly nativePilot: boolean;
}
