// The final policy runtime's scope and compiler-manifest contract. Requests name intent; resolutions carry
// exact authored path identities and compiler facts without command-specific argv or lint ownership.
import type { ts } from "ts-morph";

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

export interface PolicyProgramMembership {
  /** Stable program identity. Equal to the canonical repo-relative config path. */
  readonly id: string;
  readonly config: string;
  /** Authored current files admitted by TypeScript's parsed config. */
  readonly files: readonly string[];
  /** Direct canonical project-reference configs. */
  readonly references: readonly string[];
  /** This config plus every transitive authored local `extends` input. */
  readonly configPaths: readonly string[];
}

/** Compiler-native settings for tools checking transformed source without reparsing config semantics. */
export interface CompilerProgram extends PolicyProgramMembership {
  readonly commandLine: ts.ParsedCommandLine;
}

export const COMPILER_CONFIG_FIELDS = ["include", "exclude"] as const;
export type CompilerConfigField = (typeof COMPILER_CONFIG_FIELDS)[number];

/** ONE authored root-selection entry, as the config SPELLS it — the half `ParsedCommandLine` consumes and
 *  destroys. `fileNames` is the folded, expanded ANSWER; this is the QUESTION, and a liveness reader judges
 *  the question (an entry that expands to nothing is exactly what `fileNames` cannot show you). */
export interface CompilerConfigEntry {
  readonly field: CompilerConfigField;
  /** Unfolded (no `extends` inheritance applied) and unexpanded (no glob walk), byte-identical to source. */
  readonly value: string;
  /** 1-based line of the entry's own string literal WITHIN ITS OWN CONFIG TEXT. Carried because a liveness
   *  finding anchors at the entry, and re-deriving it by scanning for the literal mis-anchors every entry a
   *  config spells twice. */
  readonly line: number;
}

/** A parse failure is a distinct fact, never an empty entry list: a tsconfig that silently defaulted checks
 *  a program nobody declared, so every consumer must be able to tell "no entries" from "I could not read". */
export type CompilerConfigEntries =
  | { readonly status: "read"; readonly config: string; readonly entries: readonly CompilerConfigEntry[] }
  | { readonly status: "unparseable"; readonly config: string; readonly reason: string };

/** In-memory source filenames presented to native config expansion. Config JSON and its inheritance graph
 * remain physical authored inputs; this overlay describes only the transaction's final source tree. */
export interface CompilerSourceOverlay {
  readonly addedPaths: readonly string[];
  readonly deletedPaths: readonly string[];
}

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
