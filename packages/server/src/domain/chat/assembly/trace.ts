// domain/chat/assembly/trace — the SHAPE-phase debug trace (the AssembleTrace
// philosophy: "debug metadata about what assembly did — NOT the prompt text"). Host/admin-only; answers
// "why did SHAPE produce this history + (not) place a cache breakpoint?" WITHOUT dumping RP content.
//
// Distinct consumers from shape()'s content-bearing `stages`: those feed the engine (the wire history)
// and the differential oracle (byte-diff). THIS is the content-FREE projection safe to log / show in the
// inspector — counts, roles, the squash-merge count, and the breakpoint decision + abort reason.

/** The content-free SHAPE stage shape `buildShapeTrace` reads (structurally compatible with shape()'s
 *  `stages`). File-local: the cross-boundary trace shape, if ever wired to a client view, lands in
 *  `@orb/contracts/chat` (AssembleTrace) — this is the internal builder input. */
interface ShapeStages {
  multiCharacter: boolean;
  withTail: readonly { role: "user" | "assistant" }[];
  injected: readonly { role: "user" | "assistant" }[];
  squashed: readonly { role: "user" | "assistant" }[];
  named: readonly { role: "user" | "assistant" }[];
}

/** Why SHAPE did / didn't place the §8 cache breakpoint — the abort taxonomy, content-free. The axis is
 *  declared once as a tuple and DERIVED (no inline-union re-spell; §7.5). */
const BREAKPOINT_DECISIONS = [
  "placed",
  "no-stable-prefix",
  "in-prefix-injection-or-squash",
  "second-volatile-tail",
] as const;
type BreakpointDecision = (typeof BREAKPOINT_DECISIONS)[number];

interface ShapeTrace {
  multiCharacter: boolean;
  /** Row counts per stage (no content). `injected − squashed` = how many adjacent same-role merges fired. */
  stageCounts: {
    withTail: number;
    injected: number;
    squashed: number;
    named: number;
  };
  /** Adjacent same-role merges the squash performed (a non-zero count flags a boundary the breakpoint
   *  math must be conservative around). */
  squashMerges: number;
  cacheBreakpointFromEnd: number | undefined;
  breakpointDecision: BreakpointDecision;
}

/**
 * Build the content-free SHAPE trace from shape()'s stage snapshots + the resolved breakpoint offset.
 * Pure. The `breakpointDecision` is DERIVED from observable stage facts (it never re-runs the breakpoint
 * logic — `computeHistoryBreakpoint` is the single source of the offset; this only labels the outcome):
 *   • offset present                  → "placed"
 *   • withTail ≤ 1                     → "no-stable-prefix"
 *   • a prefix-internal squash merged  → "in-prefix-injection-or-squash"
 *   • otherwise (a nudge/continuation appended a second tail) → "second-volatile-tail"
 */
export function buildShapeTrace(
  stages: ShapeStages,
  cacheBreakpointFromEnd: number | undefined,
): ShapeTrace {
  const squashMerges = stages.injected.length - stages.squashed.length;
  const stableCount = stages.withTail.length - 1;
  let breakpointDecision: BreakpointDecision;
  if (cacheBreakpointFromEnd !== undefined) {
    breakpointDecision = "placed";
  } else if (stableCount < 1) {
    breakpointDecision = "no-stable-prefix";
  } else if (stages.named.length < stages.withTail.length) {
    // The shaped prefix is shorter than the stable canon → a prefix-internal squash (or a depth≥2
    // injection mutating the prefix) collapsed it; either way the breakpoint can't pin a stable byte.
    breakpointDecision = "in-prefix-injection-or-squash";
  } else {
    breakpointDecision = "second-volatile-tail";
  }
  return {
    multiCharacter: stages.multiCharacter,
    stageCounts: {
      withTail: stages.withTail.length,
      injected: stages.injected.length,
      squashed: stages.squashed.length,
      named: stages.named.length,
    },
    squashMerges,
    cacheBreakpointFromEnd,
    breakpointDecision,
  };
}
