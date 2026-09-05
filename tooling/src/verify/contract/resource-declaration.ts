// Closed, JSON-ready resource requests. Descriptors name facts; only ResourceHost owns their paths.
import type { PackageResourceId, StaticConfigResourceId } from "./resource-config.ts";
import type { AuthoredTreeId } from "./resource-tree.ts";

export const GATE_RESOURCE_REQUEST_KINDS = ["authored-tree", "authored-css", "product-css", "package-metadata", "static-config", "tracked-files"] as const;

export type GateResourceRequest =
  | { readonly kind: "authored-tree"; readonly id: AuthoredTreeId }
  | { readonly kind: "authored-css" }
  | { readonly kind: "product-css" }
  | { readonly kind: "package-metadata"; readonly id: PackageResourceId }
  | { readonly kind: "static-config"; readonly id: StaticConfigResourceId }
  | { readonly kind: "tracked-files" };
