import type { ts } from "ts-morph";

/** Authored repository paths used by native TypeScript config expansion. */
export interface AuthoredRepositoryInventory {
  readonly root: string;
  readonly trackedPaths: readonly string[];
  readonly untrackedPaths: readonly string[];
  readonly paths: readonly string[];
}

/** One runnable native TypeScript program and its authored root membership. */
export interface CompilerProgramMembership {
  readonly id: string;
  readonly config: string;
  readonly files: readonly string[];
  readonly references: readonly string[];
  readonly configPaths: readonly string[];
}

/** Native settings retained for semantic tools and post-transform diagnostics. */
export interface CompilerProgram extends CompilerProgramMembership {
  readonly commandLine: ts.ParsedCommandLine;
}

/** Filename-only projection of a transaction's final source tree. */
export interface CompilerSourceOverlay {
  readonly addedPaths: readonly string[];
  readonly deletedPaths: readonly string[];
}

export const COMPILER_CONFIG_FIELDS = ["include", "exclude"] as const;
export type CompilerConfigField = (typeof COMPILER_CONFIG_FIELDS)[number];

export interface CompilerConfigEntry {
  readonly field: CompilerConfigField;
  readonly value: string;
  readonly line: number;
}

export type CompilerConfigEntries =
  | { readonly status: "read"; readonly config: string; readonly entries: readonly CompilerConfigEntry[] }
  | { readonly status: "unparseable"; readonly config: string; readonly reason: string };
