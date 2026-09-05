// domain/chat/assembly/trace — the SHAPE-phase debug trace (the AssembleTrace
// philosophy: "debug metadata about what assembly did — NOT the prompt text"). Host/admin-only; answers
// "why did SHAPE produce this history + (not) place a cache breakpoint?" WITHOUT dumping RP content.
//
// Distinct consumers from shape()'s content-bearing `stages`: those feed the engine (the wire history)
// and this builder's own counts/decision derivation (they also fed the neo differential oracle's byte-diff
// until #428 ripped it out 2026-08-22). THIS is the content-FREE projection safe to log / show in the
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
  // Every stage carries the full `MessageRole` axis, DERIVED from the homed tuple, never re-spelled. The ONE
  // producer of a `system` row is the injection SPLICE — a capability-kept injection at the tail
  // (`turns.midConversationSystem`) or mid-array (`turns.historySystemRows`) — so `withTail` (pre-splice) in
  // fact never carries one. It is typed on the full axis anyway rather than `Exclude<…,"system">`: this is a
  // structural INPUT shape, and narrowing it would make the builder reject a caller that is already correct.
  // (`withTail` did briefly carry system, from the D129(B) narrator delivery `56a979d44` shipped; the owner
  // ruled that out 2026-08-18 — group narration is the assistant's own voice.)
  withTail: readonly { role: MessageRole }[];
  injected: readonly { role: MessageRole }[];
  squashed: readonly { role: MessageRole }[];
  named: readonly { role: MessageRole }[];
  /** The FINAL delivered rows, already content-free (SHAPE projects them where the squash runs are in hand —
   *  a merged row's provenance is only knowable there). Passed through verbatim. */
  delivered: readonly ShapeTraceRow[];
}

/**
 * Build the content-free SHAPE trace from shape()'s stage snapshots + its breakpoint call.
 *
 * `breakpointDecision` is CARRIED, never re-derived. It used to be reconstructed here from stage row counts,
 * and that reconstruction was wrong for one whole arm: a depth ≥ 2 `in_chat` injection aborts the breakpoint
 * while ADDING a row, so `named.length < withTail.length` reads false and the deep injection was reported as
 * "second-volatile-tail" — pointing a host at a nudge that does not exist and away from the injection that
 * actually cost them the cache. `shape()` now returns the decision the aborting branch made
 * (`assembly/shape` computeHistoryBreakpoint), so the label cannot disagree with the call.
 */
export function buildShapeTrace(stages: ShapeStages, cacheBreakpointFromEnd: number | undefined, breakpointDecision: ShapeBreakpointDecision): ShapeTrace {
  const squashMerges = stages.injected.length - stages.squashed.length;
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
