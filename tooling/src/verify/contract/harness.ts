// The pre-single-pass `Check` vocabulary that survived the machine rewrite: the shared Violation /
// CheckContext / Check shapes still consumed by the injectable-baseline factories and the retained
// `monotonicTests` Check, plus `GateResult` — the per-gate record the check-structure.json writer emits.
import type { Project } from "ts-morph";
import type { GateSeverity } from "./gate-authority.ts";
import type { GateScan, GateTiming } from "./pass.ts";

export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly message: string;
  /** The three fields a FINAL policy's effective finding carries beyond the legacy triple (mixed runtime, #1584):
   *  the exact column and position token the central waiver engine bound, and the severity central authority
   *  stamped. A legacy row never sets them; a reader treats their absence as a legacy finding. */
  readonly column?: number;
  readonly token?: string;
  readonly severity?: GateSeverity;
}

export interface CheckContext {
  readonly root: string;
  readonly project: Project;
}

export interface Check {
  readonly name: string;
  readonly run: (ctx: CheckContext) => Violation[];
}

/** One gate's outcome, retained so callers that need per-gate detail (the check-structure.json
 *  writer) don't have to re-run the gate to get it. */
export interface GateResult {
  readonly name: string;
  readonly ok: boolean;
  readonly violations: readonly Violation[];
  /** The DENOMINATOR behind this verdict (`GateScan`) — how many files the gate was actually fed, and what
   *  a ratchet baseline admitted. Carried into check-structure.json so the canonical artifact stops
   *  reporting a green gate without saying whether it read anything (Codex GA-H-01/02, 2026-08-13). */
  readonly scan: GateScan;
  /** What this gate COST the run (#1107) — carried into check-structure.json for the same reason `scan`
   *  is: a claim about a gate's price must be re-derivable from the canonical artifact, never only from
   *  a scratch profiler. Missing or non-finite here is a BROKEN WRITER, not a fast gate: `timingAlarms`
   *  (lib/timing.ts) refuses the run rather than publishing a silent `undefined`. */
  readonly timing: GateTiming;
}
