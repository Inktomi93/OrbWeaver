// Full authored TypeScript membership, with unresolved intent exposed instead of counted as clean.
import type { World } from "../../_shared/project-worlds.ts";

/** Required owner present, wrong root, closure-only, absent, or intent not yet classified. */
export const MEMBERSHIP_OUTCOMES = ["predicted", "drift", "import-only", "unowned", "unclassified"] as const;
export type MembershipOutcome = (typeof MEMBERSHIP_OUTCOMES)[number];
export const MEMBERSHIP_ENFORCEMENT = "test-coverage-and-lib-leaks";

/** Primary ownership and complete actual membership are separate facts. */
export interface MembershipRow {
  readonly file: string;
  readonly world: World | null;
  /** The required primary owner; null means the model has not assigned one. */
  readonly predicted: string | null;
  /** The programs that ROOT the file (include/files resolution through the compiler's own config reader). */
  readonly rootedBy: readonly string[];
  /** The programs whose import CLOSURE contains the file. */
  readonly containedBy: readonly string[];
  readonly outcome: MembershipOutcome;
}

export interface MembershipReport {
  readonly enforcement: typeof MEMBERSHIP_ENFORCEMENT;
  readonly programs: readonly string[];
  readonly rows: readonly MembershipRow[];
  readonly testEscapees: readonly string[];
  readonly libLeaks: readonly string[];
}
