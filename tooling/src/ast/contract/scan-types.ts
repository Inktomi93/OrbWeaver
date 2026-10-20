import type { Node } from "ts-morph";

const SKIP_REASONS = ["out-of-scope", "out-of-filter", "test-file", "declaration-file"] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];
const SCAN_STATUSES = ["complete", "partial", "error"] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];
export type ScopeMatch = string | readonly string[];

export interface ScanMeta {
  readonly verb: string;
  readonly scope: string;
  readonly langs: Readonly<Record<string, number>>;
  readonly scanned: number | null;
  readonly skipped: number | null;
  readonly skippedBy: Readonly<Record<SkipReason, number>>;
  readonly matches: number;
  readonly status: ScanStatus;
}

export interface ScanSpec {
  readonly scope: ScopeMatch;
  readonly label: string;
  readonly skip?: readonly SkipRule[];
}

export interface Scope {
  prefix: string;
  label: string;
}

export interface RegistryDef {
  readonly name: string;
  readonly filePath: string;
  readonly rows: readonly { readonly key: string; readonly node: Node }[];
}

const COLUMN_CLASSES = ["read-write", "write-only", "read-only", "neither", "provenance"] as const;
export type ColumnClass = (typeof COLUMN_CLASSES)[number];

export interface Flags {
  in: string | null;
  json: boolean;
  max: number;
  filesOnly: boolean;
  public: boolean;
  all: boolean;
  near: number | null;
}

export interface Hit {
  file: string;
  line: number;
  kind: string;
  text: string;
}

export interface SkipRule {
  readonly reason: SkipReason;
  readonly test: (filePath: string) => boolean;
}
