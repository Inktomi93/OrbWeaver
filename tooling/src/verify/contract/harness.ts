// The pre-single-pass `Check` vocabulary that survived the machine rewrite: the shared Violation /
// CheckContext / Check shapes still consumed by the injectable-baseline factories and the retained
// `monotonicTests` Check, plus `GateResult` — the per-gate record the check-structure.json writer emits.
import type { Project } from "ts-morph";
import type { GateScan } from "./pass.ts";

export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly message: string;
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
}
