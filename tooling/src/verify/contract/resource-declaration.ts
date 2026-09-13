// Closed, JSON-ready resource requests. Descriptors name facts; only ResourceHost owns their paths.
//
// THIS SET IS FROZEN (2026-09-11, #1930). Eighteen kinds, closed. The per-member provenance — which ruling
// authorized each one, what a new kind costs across the four mandatory policing surfaces, the two reads
// deliberately NOT minted (a staged-blob/git-index read; `jsonc`), and the ONE condition that reopens the
// set — is `docs/design/gate-runtime-standardization.md` §12.4. A read no kind here serves does NOT get a
// nineteenth arm: it STOPS that conversion, which leaves the gate legacy and armed, and that refusal is a
// SUCCESS. Reopening is a ruling, never a lane's call; the bar is two or more independent consumers, because
// a capability serving one gate is that gate's private reader wearing a contract's clothes (§11.5).
//
// TWO INDEPENDENT PROPERTIES, each with its own predicate, because conflating them is wrong in both
// directions and the wrong answer is silent.
//
//   UNPOPULATED — the request contributes no AUTHORED path to the policy's effective population. Three
//   kinds are: the two demand kinds, and `installed-package`, whose subject lives in the pnpm store outside
//   the checkout and has no repo-relative spelling at all. `resolveResourceDeclarations` would otherwise
//   refuse each of them as "an empty fact", which is the correct rule for every other kind.
//
//   DEMAND — the request's SUBJECT is not known at planning time; the policy supplies it at the call. Only
//   `authored-path` and `authored-text` are. `installed-package` is unpopulated but fully declared, so it is
//   acquirable at planning while the demand kinds are not.
//
// Both rules are NAMED here rather than applied as a silent skip somewhere downstream, because a silently
// skipped declaration is exactly how a request that resolved nothing reads as a clean zero.
import type { ConfigSnapshotRunner } from "./config-snapshot.ts";
import type { PackageResourceId, StaticConfigResourceId } from "./resource-config.ts";
import type { LedgerId } from "./resource-document.ts";
import type { ExactResourceId } from "./resource-exact.ts";
import type { InstalledPackageRequest } from "./resource-installed.ts";
import type { JsonResourceId } from "./resource-json.ts";
import type { MirrorFamilyId } from "./resource-mirror.ts";
import type { AuthoredTreeId } from "./resource-tree.ts";

export const GATE_RESOURCE_REQUEST_KINDS = [
  "authored-tree",
  "authored-css",
  "product-css",
  "package-metadata",
  "static-config",
  "native-config",
  "tracked-files",
  "json",
  "installed-package",
  "mirror-index",
  "documents",
  "ledger",
  "exact-file",
  "vendor-css-surface",
  "token-contract",
  "devtools-closure",
  "authored-path",
  "authored-text",
] as const;

/** Kinds contributing no authored path to the effective population.
 *  @public knip type-face false positive — the one-home vocabulary tuple behind the exported `GateResourceUnpopulatedKind` union
 *  — the ONE importable spelling of this axis, which nothing outside this module enumerates YET; un-exporting it would
 *  invite the re-spell `no-inline-union-redecl` exists to stop. */
export const GATE_RESOURCE_UNPOPULATED_KINDS = ["installed-package", "authored-path", "authored-text"] as const;
export type GateResourceUnpopulatedKind = (typeof GATE_RESOURCE_UNPOPULATED_KINDS)[number];

/** Kinds whose subject arrives at the call rather than at planning. A strict subset of the unpopulated set.
 *  @public knip type-face false positive — the one-home vocabulary tuple behind the exported `GateResourceDemandKind` union (line
 *  63) — the ONE importable spelling of this axis, which nothing outside this module enumerates YET; un-exporting it would invite
 *  the re-spell `no-inline-union-redecl` exists to stop. */
export const GATE_RESOURCE_DEMAND_KINDS = ["authored-path", "authored-text"] as const;
/** @public knip type-face false positive — the importable union spelling of the `GATE_RESOURCE_DEMAND_KINDS` vocabulary, reached
 *  structurally from line 85 and never named at a call site. */
export type GateResourceDemandKind = (typeof GATE_RESOURCE_DEMAND_KINDS)[number];

export type GateResourceRequest =
  | { readonly kind: "authored-tree"; readonly id: AuthoredTreeId }
  | { readonly kind: "authored-css" }
  | { readonly kind: "product-css" }
  | { readonly kind: "package-metadata"; readonly id: PackageResourceId }
  | { readonly kind: "static-config"; readonly id: StaticConfigResourceId }
  | { readonly kind: "native-config"; readonly id: ConfigSnapshotRunner }
  | { readonly kind: "tracked-files" }
  | { readonly kind: "json"; readonly id: JsonResourceId }
  | ({ readonly kind: "installed-package" } & InstalledPackageRequest)
  | { readonly kind: "mirror-index"; readonly id: MirrorFamilyId }
  | { readonly kind: "documents" }
  | { readonly kind: "ledger"; readonly id: LedgerId }
  /** ONE declaration PER ID, even though the door is called with a list: a policy that declared one exact
   *  file must not be able to read a second by widening its argument. */
  | { readonly kind: "exact-file"; readonly id: ExactResourceId }
  | { readonly kind: "vendor-css-surface" }
  | { readonly kind: "token-contract" }
  | { readonly kind: "devtools-closure" }
  | { readonly kind: "authored-path" }
  | { readonly kind: "authored-text" };

export function isGateResourceDemandKind(kind: GateResourceRequest["kind"]): kind is GateResourceDemandKind {
  return (GATE_RESOURCE_DEMAND_KINDS as readonly string[]).includes(kind);
}

export function isGateResourceUnpopulatedKind(kind: GateResourceRequest["kind"]): kind is GateResourceUnpopulatedKind {
  return (GATE_RESOURCE_UNPOPULATED_KINDS as readonly string[]).includes(kind);
}
