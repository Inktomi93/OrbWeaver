// domain/chat/assembly/trace — the SHAPE-phase debug trace (the AssembleTrace
// philosophy: "debug metadata about what assembly did — NOT the prompt text"). Host/admin-only; answers
// "why did SHAPE produce this history + (not) place a cache breakpoint?" WITHOUT dumping RP content.
//
// Distinct consumers from shape()'s content-bearing `stages`: those feed the engine (the wire history)
// and the differential oracle (byte-diff). THIS is the content-FREE projection safe to log / show in the
// inspector — counts, roles, the squash-merge count, and the breakpoint decision + abort reason.
//
// CONSUMER (PD-132): the host/admin assembly inspector reads this on demand — `chat.getShapeTrace` re-runs
// SHAPE against the current canon (`verbs/read.ts::createGetShapeTrace`, requireHost) and returns this shape,
// rendered by the client `assembly-preview-panel`. The cross-boundary `ShapeTrace` lives in
// `@orb/contracts/chat` (the wire home); THIS builder maps the internal SHAPE stages onto it.

import type { ShapeBreakpointDecision, ShapeTrace, ShapeTraceRow } from "@orb/contracts/chat";
import type { MessageRole } from "@orb/kit/message-role";

/** The content-free SHAPE stage shape `buildShapeTrace` reads (structurally compatible with shape()'s
 *  `stages`). File-local: the internal builder input (the wire projection is `@orb/contracts/chat`'s
 *  `ShapeTrace`). */
interface ShapeStages {
  multiCharacter: boolean;
  // Every stage carries the full `MessageRole` axis, DERIVED from the homed tuple, never re-spelled. Two
  // ways a `system` row is in here, and `withTail` (pre-splice) can now carry the second: a capability-kept
  // depth-0 INJECTION (`turns.midConversationSystem`, post-splice only), and a narrator canon row DELIVERED
  // as system on a model measured for mid-history system rows (`turns.historySystemRows`, D129(B) — the
  // dispatch runs while `withTail` is built). This stage was `Exclude<…,"system">` until that landed.
  withTail: readonly { role: MessageRole }[];
  injected: readonly { role: MessageRole }[];
  squashed: readonly { role: MessageRole }[];
  named: readonly { role: MessageRole }[];
  /** The FINAL delivered rows, already content-free (SHAPE projects them where the squash runs are in hand —
   *  a merged row's provenance is only knowable there). Passed through verbatim. */
  delivered: readonly ShapeTraceRow[];
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
export function buildShapeTrace(stages: ShapeStages, cacheBreakpointFromEnd: number | undefined): ShapeTrace {
  const squashMerges = stages.injected.length - stages.squashed.length;
  const stableCount = stages.withTail.length - 1;
  let breakpointDecision: ShapeBreakpointDecision;
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
    // Omit the field entirely when no breakpoint was placed (exactOptional — absent, never undefined-valued).
    ...(cacheBreakpointFromEnd !== undefined ? { cacheBreakpointFromEnd } : {}),
    breakpointDecision,
    rows: stages.delivered,
  };
}
