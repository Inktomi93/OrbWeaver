// Seeded, deterministic id generator (spine/testing.md §3 — no unseeded ids under tests/). A
// zero-padded counter is enough for stable assertions today; swap to a seeded `typeid` once
// @orb/kit/ids lands (the determinism seam stays the same — injected at the composition root).

const PAD_WIDTH = 6;

export interface SeededIds {
  readonly next: (prefix?: string) => string;
  readonly reset: () => void;
}

export function createSeededIds(): SeededIds {
  let n = 0;
  return {
    next: (prefix = "id"): string => {
      n += 1;
      return `${prefix}_${String(n).padStart(PAD_WIDTH, "0")}`;
    },
    reset: (): void => {
      n = 0;
    },
  };
}
