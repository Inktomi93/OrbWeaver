// Frozen clock for deterministic tests (core/Spine-Testing.md §3 — no ambient `Date.now()` under tests/).
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
