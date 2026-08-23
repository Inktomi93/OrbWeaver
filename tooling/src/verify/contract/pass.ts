// The single-pass RESULT shapes — what one gate run produced and what the harness observed while it ran.
// Homed here (not beside the dispatcher) because the five-slot template puts every exported shape in
// contract/ (docs/design/tooling-package.md §2.5); lib/pass.ts is the machine, this is its vocabulary.
import type { Finding } from "./gate.ts";

/** A gate's own count of units the shared walk cannot see (`ctx.scan({unit,…})`). */
export interface DeclaredScan {
  readonly unit: string;
  readonly candidates: number;
  readonly scanned: number;
  readonly skipReasons: Readonly<Record<string, number>>;
}

/** PER-GATE SCAN HEALTH — the DENOMINATOR behind a gate's verdict, recorded by the harness for every
 *  gate from the one walk (no gate opts in). Without it a `scanRoot`/predicate regression is invisible:
 *  the gate runs, reads NOTHING, finds nothing, and renders ✓ — the zero-scan placebo. `scanned === 0`
 *  at real-tree scope is therefore a BROKEN CHECKER (the structure op exits 2), not a clean gate. */
export interface GateScan {
  /** Files this run offered to the walk (the whole scoped fileset) — the denominator. */
  readonly candidates: number;
  /** Files this gate's `scanRoot` ADMITTED. This is the number the zero-scan alarm reads. */
  readonly scanned: number;
  /** `candidates - scanned`. */
  readonly skipped: number;
  /** Why they were skipped. The harness knows exactly one reason; gates add their own via `ctx.scan`. */
  readonly skipReasons: Readonly<Record<string, number>>;
  /** Files a hook ACTUALLY ran on (`visitFile` called, or ≥1 subscribed node dispatched). Read it BESIDE
   *  `scanned`, never instead: a `run`-only gate walks the project itself, so 0 here is normal for it,
   *  while `visited === 0` with `scanned` large on a visit/visitFile gate means a dead kind subscription. */
  readonly visited: number;
  /** Findings a committed ratchet BUDGET absolved this run — declared debt, not violations. */
  readonly admitted: number;
  /** The RATIFIED SUBSET of `admitted` (#569): permanent by a recorded ruling / documented tool-FP, not
   *  backlog. `admitted - admittedRatified` is the burnable half every consumer prints beside it. */
  readonly admittedRatified: number;
  /** Present only when the gate declared units of its own. */
  readonly declared?: DeclaredScan;
}

export interface GatePassResult {
  readonly name: string;
  readonly ok: boolean;
  readonly findings: readonly Finding[];
  readonly scan: GateScan;
}

export interface ToolError {
  readonly gate: string;
  readonly phase: "begin" | "visit" | "visitFile" | "run" | "finalize";
  readonly message: string;
}

export interface PassResult {
  readonly gates: readonly GatePassResult[];
  readonly toolErrors: readonly ToolError[];
}

/** One parsed `@orb-gate-ignore` marker. `malformed` is the GATE-AUTHORING §4.3 verdict: a marker missing
 *  its `: <reason>` (or carrying an empty `()` position) suppresses NOTHING — a bare-marker-exempts rule is
 *  a rubber stamp — and is itself reported by `gate-ignore-inventory` so it cannot sit there LOOKING like
 *  protection. */
export interface GateIgnoreMarker {
  readonly gate: string;
  /** §4.3a: the guarded POSITION (a finding's `token`), when the marker names one. `undefined` = the
   *  marker covers every finding of its gate on the guarded node. */
  readonly position: string | undefined;
  readonly reason: string;
  readonly malformed: boolean;
}
