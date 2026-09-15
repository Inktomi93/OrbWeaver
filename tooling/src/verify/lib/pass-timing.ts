// PER-GATE COST ACCOUNTING for the single pass (#1107) — the clock the dispatcher charges, and the two
// rounding rules that make the published ledger's own arithmetic hold.
//
// WHY IT IS A MODULE AND NOT A FEW LINES IN lib/pass.ts: the dispatcher was already at the 450-line
// tooling cap, and this is a separable concern with a contract of its own — a phase's cost is charged in
// exactly one place, and the numbers leave rounded in exactly one direction. Keeping it here also gives
// the ROUNDING LAW below a home to be read in, rather than four helpers wedged between the scan tally and
// the walk.
//
// THE ROUNDING LAW. Per-phase and per-gate numbers round DOWN; the enclosing pass total rounds UP. That is
// what makes `Σ phaseMs === totalMs` and `PassTiming.totalMs >= Σ gates` true by ARITHMETIC rather than by
// rounding luck — an artifact whose parts add up to more than its whole is the exact shape `timingAlarms`
// refuses, and a ledger that can only refuse itself by rounding accident is not a ledger.
//
// WHY THE PHASE IN FLIGHT LIVES HERE TOO: "which phase is running" and "what is that phase costing" are
// one fact read two ways — the dispatcher charges the clock with it, and (until the legacy marker sweep
// retired with #2176) the gate-ignore stale sweep asked whether a suppression landed after its window.
import { performance } from "node:perf_hooks";
import type { GatePassResult, GatePhase, GateTiming, PassTiming } from "../contract/pass.ts";
import { GATE_PHASES } from "../contract/pass.ts";

/** 3 decimal places. Microsecond resolution is what `performance.now()` actually offers, and it keeps a
 *  250-gate artifact readable while still separating a 0.1ms gate from a 0.001ms one. */
const MS_SCALE = 1000;

/** Round DOWN into the INTEGER unit the ledger sums. Keeping the arithmetic integer until the published
 *  boundary prevents `40.329 + 0.001 + 0.001` becoming `40.330999…` and losing another microsecond when
 *  the already-floored parts are floored a second time. */
function floorMicros(ms: number): number {
  return Math.floor(ms * MS_SCALE);
}

function fromMicros(micros: number): number {
  return micros / MS_SCALE;
}

/** Round UP — the enclosing whole may only ever overstate, the mirror of `floorMs`. */
function ceilMs(ms: number): number {
  return Math.ceil(ms * MS_SCALE) / MS_SCALE;
}

/** The monotonic reading both ends of a charge are taken from. ONE spelling, so a future swap of the clock
 *  source cannot leave the two ends reading different ones. */
export function nowMs(): number {
  return performance.now();
}

/** One gate's running cost. Opaque on purpose: the dispatcher may only CHARGE it (per phase, from a
 *  reading it took itself) and CLOSE it — it can never write a duration in directly, which is how every
 *  number in the ledger stays something that was actually measured. */
export interface PhaseClock {
  /** Charge this phase with the time since `startedAt`. Called from the dispatcher's `finally`, so a hook
   *  that THREW is still charged — a gate that burns 90s and then dies is exactly the one whose cost a
   *  reader needs. */
  readonly charge: (phase: GatePhase, startedAt: number) => void;
  /** The finished record: every phase floored, and `totalMs` their exact sum. */
  readonly finish: () => GateTiming;
}

export function newPhaseClock(): PhaseClock {
  const ms: Record<GatePhase, number> = { begin: 0, visit: 0, visitFile: 0, run: 0, finalize: 0 };
  return {
    charge: (phase, startedAt): void => {
      ms[phase] += nowMs() - startedAt;
    },
    finish: (): GateTiming => {
      const phaseMs: Record<GatePhase, number> = { begin: 0, visit: 0, visitFile: 0, run: 0, finalize: 0 };
      let totalMicros = 0;
      for (const phase of GATE_PHASES) {
        const phaseMicros = floorMicros(ms[phase]);
        phaseMs[phase] = fromMicros(phaseMicros);
        totalMicros += phaseMicros;
      }
      return { totalMs: fromMicros(totalMicros), phaseMs };
    },
  };
}

/** The pass's own wall clock, closed AFTER the per-gate records are folded so `gateMs` is the sum of the
 *  exact numbers the artifact publishes — a reader subtracts them and gets the harness's own share (the
 *  walk, the dispatch, the sort) without re-deriving anything. */
export function passTiming(startedAt: number, gates: readonly GatePassResult[]): PassTiming {
  const gateMicros = gates.reduce((sum, gate) => sum + Math.round(gate.timing.totalMs * MS_SCALE), 0);
  return { totalMs: ceilMs(nowMs() - startedAt), gateMs: fromMicros(gateMicros) };
}

/** The phase the pass is CURRENTLY in. Module state, written only by `chargedPhase` below. */
let currentPhase: GatePhase = "begin";

/** RUN `body` AS THIS PHASE: enter it, take both readings, and charge the gate — the one door the
 *  dispatcher hands a hook call to. It exists in this shape so the dispatcher cannot enter a phase
 *  without timing it, or time one without entering it: the two facts have a single writer.
 *
 *  The `finally` charges even when `body` THREW — a gate that burns 90s and then dies is exactly the one
 *  whose cost a reader needs. `body` owns its own failure (the dispatcher's guard catches inside it);
 *  nothing is caught here. */
export function chargedPhase(clock: PhaseClock, phase: GatePhase, body: () => void): void {
  currentPhase = phase;
  const startedAt = nowMs();
  try {
    body();
  } finally {
    clock.charge(phase, startedAt);
  }
}

