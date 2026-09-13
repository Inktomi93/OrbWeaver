// The pre-single-pass `Check` vocabulary that survived the machine rewrite: `Violation` and
// `CheckContext` are still consumed by the legacy gate modules, plus `GateResult` — the per-gate record
// the check-structure.json writer emits.
//
// `Check` ITSELF NOW HAS NO IMPLEMENTER. Its last one was `monotonic-tests`, deleted whole with the
// test-baseline manifest (#2217, owner ruling) — `pnpm ast refs Check --in tooling/src/verify` answers 2
// hits in 2 files, the declaration below and the re-export in `index.ts`. Stated rather than deleted here:
// whether the shape retires with the mixed runtime or survives the cutover is the loader's call, not this
// module's, and a header that claims a live consumer is the lie this note exists to stop.
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
