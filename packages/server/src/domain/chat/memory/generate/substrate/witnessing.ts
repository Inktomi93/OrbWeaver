// domain/chat/memory/generate/substrate/witnessing — the present-at-seq WITNESSING predicate (core/Knowledge-Cluster.md
// §4 / inv 12). PURE: given a block's `messages.seq` span and a character's join/leave horizons, decide whether
// the character was present for that span. The horizons are DATA (passed in by the engine / `loadWitnessHorizons`)
// — this layer reaches into no db (determinism). A character genuinely cannot recall a scene it wasn't in,
// including across kick→re-add (multiple intervals — the kicked span is absent).

import type { WitnessInterval } from "../../types.ts";

/**
 * Whether a `[seqStart, seqEnd]` span overlaps ANY presence interval (the character was present for at least
 * part of the span). An interval covers seq `s` iff `joinSeq ≤ s < (leftSeq ?? +∞)` (leftSeq EXCLUSIVE — the
 * character is gone from `leftSeq` onward). Overlap with `[seqStart, seqEnd]` iff `joinSeq ≤ seqEnd` AND
 * (`leftSeq` is null OR `leftSeq > seqStart`). Empty horizons ⇒ never witnessed (no presence).
 */
export function spanWitnessed(seqStart: number, seqEnd: number, horizons: readonly WitnessInterval[]): boolean {
  for (const iv of horizons) {
    if (iv.joinSeq <= seqEnd && (iv.leftSeq === null || iv.leftSeq > seqStart)) {
      return true;
    }
  }
  return false;
}
