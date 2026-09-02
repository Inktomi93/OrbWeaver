// The single-pass RESULT shapes — what one gate run produced and what the harness observed while it ran.
// Homed here (not beside the dispatcher) because the five-slot template puts every exported shape in
// contract/ (docs/architecture/core/Core-Tooling-Law.md §2.5); lib/pass.ts is the machine, this is its vocabulary.
import type { Finding } from "./gate.ts";

/** A gate's own count of units the shared walk cannot see (`ctx.scan({unit,…})`). */
export interface DeclaredScan {
  readonly unit: string;
  readonly candidates: number;
  readonly scanned: number;
  readonly skipReasons: Readonly<Record<string, number>>;
}

/** ONE resolved SEMANTIC POPULATION a gate declared (`ctx.scan({population:[…]})`) — the member
 *  denominator its verdict rests on, folded across every declaration for that `source`. */
export interface PopulationScan {
  readonly source: string;
  /** Members resolved and judged. `0` at real-tree scope is a BLIND derivation (exit 2). */
  readonly members: number;
  /** Declarations seen but not resolvable into members. `> 0` is denominator LOSS (exit 2). */
  readonly unresolved: number;
}

/** A refused population verdict, raised ONLY at the real-tree entrypoint (`ops/structure.ts`) — the same
 *  placement, and for the same reason, as the zero-SCAN alarm: a scoped run and a conformance
 *  mini-project both legitimately resolve zero members, so `scope.kind` cannot tell them apart. */
export interface PopulationAlarm {
  readonly gate: string;
  readonly source: string;
  /** `empty` — the derivation returned nothing (unconditional); `unresolved` — declarations the reader
   *  could not resolve, raised ONLY behind a green verdict (a gate that already reported them rides the
   *  ordinary violation exit — see lib/population.ts). */
  readonly reason: "empty" | "unresolved";
  readonly members: number;
  readonly unresolved: number;
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
  /** The SEMANTIC MEMBER populations the gate declared (#946), sorted by `source`. Empty for the ~200
   *  gates whose verdict is per-file/per-node and has no member denominator to lose. */
  readonly populations: readonly PopulationScan[];
}

/** The five hooks a gate can own, in the order the pass runs them. ONE importable spelling — the
 *  harness's error attribution (`ToolError.phase`) and its cost ledger (`GateTiming.phaseMs`) are the
 *  same axis, and a sixth phase must fail `tsc` in both readers at once. */
export type GatePhase = "begin" | "visit" | "visitFile" | "run" | "finalize";

/** WALL-CLOCK ONE GATE'S OWN HOOKS CONSUMED this pass (#1107). Recorded by the harness for every gate,
 *  like `GateScan` and for the same reason one level over: `reports/check-structure.json` carried a
 *  verdict and a denominator but NO COST, so every gate-cost claim in this repo had to come from a
 *  scratch profiler nobody committed and nobody could re-derive (the 2026-08-30 research lane measured
 *  `run` hooks at 199s of a 292s pass exactly that way — and its own report says the artifact carrying
 *  no per-gate timing is why nobody could see it).
 *
 *  Each phase is FLOORED to 3dp and `totalMs` is their exact sum, so `Σ phaseMs === totalMs` and
 *  `PassTiming.totalMs >= Σ gates` hold by construction rather than by rounding luck. `visit` includes
 *  the per-dispatch timer overhead spent measuring it (two `performance.now()` per dispatched node) —
 *  the honest attribution, since that cost exists only because the gate subscribed to the kind. */
export interface GateTiming {
  /** `Σ phaseMs` — the number to sort by. */
  readonly totalMs: number;
  readonly phaseMs: Readonly<Record<GatePhase, number>>;
}

/** The PASS's own wall clock beside the sum of its gates (#1107). `totalMs - gateMs` is the harness's
 *  share — the ts-morph walk, the dispatch, the finding sort — the number that says whether a slow run
 *  is the gates' fault or the machine's. `totalMs` is CEILED to 3dp for the same
 *  invariant-by-construction reason `GateTiming` floors: `totalMs >= gateMs` is never a rounding claim. */
export interface PassTiming {
  readonly totalMs: number;
  /** `Σ gates[].timing.totalMs`. */
  readonly gateMs: number;
}

export interface GatePassResult {
  readonly name: string;
  readonly ok: boolean;
  readonly findings: readonly Finding[];
  readonly scan: GateScan;
  /** What this gate COST the pass (#1107) — recorded for every gate, never opt-in. */
  readonly timing: GateTiming;
}

export interface ToolError {
  readonly gate: string;
  readonly phase: GatePhase;
  readonly message: string;
}

export interface PassResult {
  readonly gates: readonly GatePassResult[];
  readonly toolErrors: readonly ToolError[];
  /** What the pass itself cost, beside the sum of its gates (#1107). */
  readonly timing: PassTiming;
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
