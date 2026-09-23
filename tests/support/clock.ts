// Frozen clock for deterministic tests (docs/law/Spine-Testing.md §3 — no ambient `Date.now()` under tests/).
// Injected through the same composition seam production uses at entry/. A fixed instant; advance
// explicitly when a test needs time to move.

export interface Clock {
  readonly now: () => number;
  readonly advance: (ms: number) => void;
  readonly frozenAt: number;
}

// An arbitrary fixed epoch-ms (2025-06-15T12:26:40Z) — stable across runs so timestamp assertions pin.
// Exported: the factories (`support/factories/`) stamp every seeded row's timestamps from this instant
// (the schema's `unixepoch()` default would be nondeterministic), and per-domain harnesses may pin their
// local clocks to it so cross-fixture timestamp assertions agree.
export const FROZEN_AT_MS = 1_750_000_000_000;

export function createFrozenClock(startMs: number = FROZEN_AT_MS): Clock {
  let current = startMs;
  return {
    frozenAt: startMs,
    now: (): number => current,
    advance: (ms: number): void => {
      current += ms;
    },
  };
}

// ─── The TIMER half of the seam ────────────────────────────────────────────────────────────────────
// The frozen clock above answers "what time is it"; this answers "run this later". Production arms every
// bound through a `(fn, ms) => cancel` seam (the house `ScheduleOp` shape — `transport/jobs/workloads-worker.ts`,
// `domain/rpg/flush-barrier.ts`, `AgentSdkDeps.scheduleTimeout`), which is what lets a test trip the bound by
// hand instead of replacing the global clock. `vi.useFakeTimers` is the thing this replaces: it swaps the
// whole runtime's timers for every awaited promise in the file, and Spine-Testing.md §3 bans it everywhere but
// the one idle-timeout unit test whose SUBJECT is a real `setTimeout` window.

/** One timer the subject armed through the seam. */
interface ArmedTimer {
  readonly ms: number;
  readonly fn: () => void;
  state: "live" | "fired" | "cancelled";
}

export interface ManualTimer {
  /** Pass this where production wires the real `setTimeout` (the injected `scheduleTimeout`/wait dep). */
  readonly schedule: (fn: () => void, ms: number) => () => void;
  /** The `ms` of every LIVE bound, arm order — the assertion that the subject armed the bound it claims to. */
  readonly armed: () => readonly number[];
  /** The `ms` of every bound whose cancel was called — the happy path clearing its timer. */
  readonly cancelled: () => readonly number[];
  /** Trip every live bound, arm order. */
  readonly fire: () => void;
}

/** A hand-driven timer seam. Nothing global is replaced, so unrelated awaits in the same test settle normally. */
export function createManualTimer(): ManualTimer {
  const timers: ArmedTimer[] = [];
  const msWhere = (state: ArmedTimer["state"]): readonly number[] => timers.filter((t) => t.state === state).map((t) => t.ms);
  return {
    schedule: (fn, ms) => {
      const timer: ArmedTimer = { ms, fn, state: "live" };
      timers.push(timer);
      return (): void => {
        if (timer.state === "live") {
          timer.state = "cancelled";
        }
      };
    },
    armed: () => msWhere("live"),
    cancelled: () => msWhere("cancelled"),
    fire: (): void => {
      for (const timer of timers) {
        if (timer.state === "live") {
          timer.state = "fired";
          timer.fn();
        }
      }
    },
  };
}
