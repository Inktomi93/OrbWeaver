// The shapes `ops/knip-negative-liveness.ts` judges and reports: the slice of a knip config it reads, and
// the verdict over its literal negative patterns.

/** The knip keys whose negative patterns subtract files from knip's view. */
export const KNIP_PATTERN_KEYS = ["entry", "project", "ignore"] as const;

type KnipPatternKey = (typeof KNIP_PATTERN_KEYS)[number];

/** The slice of a knip config the stage reads: pattern lists at the top level and per workspace. */
export interface KnipPatternConfig {
  readonly entry?: string | readonly string[];
  readonly project?: string | readonly string[];
  readonly ignore?: string | readonly string[];
  readonly workspaces?: Readonly<Record<string, KnipPatternConfig>>;
}

/** One negative pattern as authored, with its path after the negation and production marker are removed. */
export interface KnipNegation {
  readonly workspace: string;
  readonly key: KnipPatternKey;
  readonly pattern: string;
  /** Relative to the workspace root. */
  readonly relative: string;
}

/** One literal negative pattern whose path is not a tracked file. */
export interface DeadKnipNegation {
  readonly workspace: string;
  readonly key: KnipPatternKey;
  readonly pattern: string;
  /** The pattern's path resolved against its workspace root, repo-relative. */
  readonly path: string;
}

export interface KnipNegativeOutcome {
  /** Literal negative patterns judged. */
  readonly literal: number;
  /** Wildcard negative patterns skipped (the declared scope limit). */
  readonly wildcard: number;
  readonly dead: readonly DeadKnipNegation[];
}
