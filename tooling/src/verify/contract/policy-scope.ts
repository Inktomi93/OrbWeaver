// The final policy runtime's scope and compiler-manifest contract. Requests name intent; resolutions carry
// exact authored path identities and compiler facts without command-specific argv or lint ownership.
import type { CompilerProgramMembership } from "../../_shared/compiler-programs-contract.ts";

export type {
  CompilerConfigEntries,
  CompilerProgram,
  CompilerSourceOverlay,
} from "../../_shared/compiler-programs-contract.ts";

export const POLICY_SCOPE_KINDS = ["whole", "changed", "file", "folder", "package", "project"] as const;
/** @public knip type-face false positive — a structural field (`kind`) of the exported `PolicyScopeResolution` shape,
 *  never referenced by its own name at any call site. */
export type PolicyScopeKind = (typeof POLICY_SCOPE_KINDS)[number];

export type PolicyScopeRequest =
  | { readonly kind: "whole" }
  | { readonly kind: "changed" }
  | { readonly kind: "file"; readonly paths: readonly string[] }
  | { readonly kind: "folder"; readonly path: string }
  | { readonly kind: "package"; readonly name: string }
  | { readonly kind: "project"; readonly config: string };

export const POLICY_SEMANTIC_PATH_STATUSES = ["present", "added", "modified", "renamed-existing", "deleted"] as const;
/** @public knip type-face false positive — a structural field (`status`) of the exported `PolicySemanticPath` shape,
 *  never referenced by its own name at any call site. */
export type PolicySemanticPathStatus = (typeof POLICY_SEMANTIC_PATH_STATUSES)[number];

export interface PolicySemanticPath {
  readonly path: string;
  readonly status: PolicySemanticPathStatus;
  readonly previousPath: string | null;
}

export type PolicyProgramMembership = CompilerProgramMembership;

/** @public knip type-face false positive — the one-home vocabulary tuple behind the exported `PolicyPathOwnershipReason` union
 *  — the ONE importable spelling of this axis, which nothing outside this module enumerates YET; un-exporting it would
 *  invite the re-spell `no-inline-union-redecl` exists to stop. */
export const POLICY_PATH_OWNERSHIP_REASONS = ["compiler-membership", "outside-compiler-programs", "deleted-conservative-all-programs"] as const;
/** @public knip type-face false positive — a structural field (`reason`) of the exported `PolicyPathOwnership` shape,
 *  never referenced by its own name at any call site. */
export type PolicyPathOwnershipReason = (typeof POLICY_PATH_OWNERSHIP_REASONS)[number];

export interface PolicyPathOwnership {
  readonly path: string;
  readonly status: PolicySemanticPathStatus;
  readonly previousPath: string | null;
  readonly programIds: readonly string[];
  readonly reason: PolicyPathOwnershipReason;
}

export interface PolicyWorkspacePackage {
  readonly name: string;
  /** Canonical repo-relative directory, or `.` for the workspace root. */
  readonly path: string;
}

export interface PolicyScopeInventoryReceipt {
  readonly source: "git";
  readonly trackedCommand: readonly string[];
  readonly untrackedCommand: readonly string[];
  readonly trackedCount: number;
  readonly untrackedCount: number;
  readonly authoredCount: number;
  readonly mergeBase: { readonly ref: "main" | "origin/main"; readonly commit: string } | null;
}

/** Internal read model shared by the pure resolver leaves; the public resolution exposes only receipt. */
export interface PolicyRepositoryInventory {
  readonly root: string;
  readonly trackedPaths: readonly string[];
  readonly untrackedPaths: readonly string[];
  readonly paths: readonly string[];
  readonly receipt: PolicyScopeInventoryReceipt;
}

export interface PolicyChangedSelection {
  readonly semanticPaths: readonly PolicySemanticPath[];
  readonly mergeBase: NonNullable<PolicyScopeInventoryReceipt["mergeBase"]>;
}

export interface PolicyScopeResolution {
  readonly request: PolicyScopeRequest;
  readonly kind: PolicyScopeKind;
  readonly label: string;
  /** Null means the complete repository was requested. Every narrowed request carries semantic identity. */
  readonly requestedPaths: readonly PolicySemanticPath[] | null;
  /** Current authored files only; deletions remain in semanticPaths and ownership. */
  readonly currentPaths: readonly string[];
  readonly semanticPaths: readonly PolicySemanticPath[];
  readonly programs: readonly PolicyProgramMembership[];
  readonly requestedProgramIds: readonly string[];
  readonly ownership: readonly PolicyPathOwnership[];
  readonly workspacePackage: PolicyWorkspacePackage | null;
  readonly projectConfig: string | null;
  readonly inventory: PolicyScopeInventoryReceipt;
}
