// The type-membership REPORT's shapes (type-worlds phase 0, #1351) — the contract home for
// `ops/tests-type-membership.ts`, which classifies every test file's actual membership against the world
// model's prediction. The verdict is still "≥1 program"; phase 6 turns `predicted` into the pass condition.

/** `predicted` — rooted by exactly the program the world model predicts · `drift` — rooted by some OTHER program
 *  (the model and a config disagree) · `import-only` — inside a closure but a root of nothing (accidental
 *  membership, the class the ≥1 verdict cannot see) · `unowned` — in zero programs (today's violation). */
export const MEMBERSHIP_OUTCOMES = ["predicted", "drift", "import-only", "unowned"] as const;
export type MembershipOutcome = (typeof MEMBERSHIP_OUTCOMES)[number];

/** One test file's membership, actual vs predicted. */
export interface MembershipRow {
  readonly file: string;
  /** The program the world model predicts roots this file (`_shared/project-worlds.ts`). */
  readonly predicted: string | undefined;
  /** The programs that ROOT the file (include/files resolution through the compiler's own config reader). */
  readonly rootedBy: readonly string[];
  /** The programs whose import CLOSURE contains the file. */
  readonly containedBy: readonly string[];
  readonly outcome: MembershipOutcome;
}
