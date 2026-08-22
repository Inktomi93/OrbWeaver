// Result shapes for the non-gate verify verbs: the SCOPED single-pass run, the gate self-proof
// (conformance), and the db schema-vs-baseline reconcile. Homed here per the five-slot type law
// (docs/design/tooling-package.md §2.5).
import type { GateDescriptor } from "./gate.ts";
import type { PassResult } from "./pass.ts";

/** What one `cli.ts scoped` run produced: the incremental-safe gates' pass, the whole-project gates it
 *  DEFERRED (a scoped clean is never a full all-clear), and how many files were in scope. */
export interface ScopedResult {
  readonly pass: PassResult;
  readonly deferred: readonly GateDescriptor[];
  readonly files: number;
}

/** One failed gate self-proof example. A conformance failure is a TOOL error (exit 2), never a violation:
 *  the gate's own claim about itself is what broke. */
export interface ConformanceFailure {
  readonly gate: string;
  readonly arm: "mustFlag" | "mustPass";
  readonly why: string;
  readonly detail: string;
}

/** The committed squashed baseline vs what the live `@orb/db/schema` generates. */
export interface SchemaBaselineComparison {
  /** Statements the LIVE schema generates (normalized), sorted. */
  readonly expected: readonly string[];
  /** Statements the COMMITTED baseline holds (normalized), sorted. */
  readonly actual: readonly string[];
  /** In the live schema, absent from the baseline — the "you changed the schema and forgot to regen" arm. */
  readonly missingFromBaseline: readonly string[];
  /** In the baseline, absent from the live schema — a stale/hand-edited baseline. */
  readonly staleInBaseline: readonly string[];
}
