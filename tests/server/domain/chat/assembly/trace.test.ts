// domain/chat/assembly/trace — the content-free SHAPE trace builder. The `breakpointDecision` is now CARRIED
// from `shape()` (the branch that aborted is the only thing that knows why it aborted), so what this file
// pins is that the builder REPORTS it verbatim and never re-derives it from stage row counts — the
// re-derivation it replaced could not see a depth ≥ 2 injection abort at all (#1462). The end-to-end proof
// that each abort cause gets its own label lives beside the decision itself, in `shape.test.ts`.

import type { ShapeBreakpointDecision, ShapeTraceRow } from "@orb/contracts/chat";
import { SHAPE_BREAKPOINT_DECISIONS } from "@orb/contracts/chat";
import { describe } from "vitest";
import { buildShapeTrace } from "../../../../../packages/server/src/domain/chat/assembly/trace.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const ROW: ShapeTraceRow = { role: "assistant", source: "canon", chars: 5 };

function stages(overrides: Partial<Parameters<typeof buildShapeTrace>[0]> = {}): Parameters<typeof buildShapeTrace>[0] {
  return {
    multiCharacter: false,
    withTail: [{ role: "user" }, { role: "assistant" }],
    injected: [{ role: "user" }, { role: "assistant" }],
    squashed: [{ role: "user" }, { role: "assistant" }],
    named: [{ role: "user" }, { role: "assistant" }],
    delivered: [ROW],
    ...overrides,
  };
}

describe("buildShapeTrace — the breakpointDecision is carried, never re-derived", () => {
  test("every decision reaches the trace verbatim, whatever the stage row counts say", () => {
    // The stages here are the shape a re-derivation would have read as "second-volatile-tail" every time.
    for (const decision of SHAPE_BREAKPOINT_DECISIONS) {
      expect(buildShapeTrace(stages(), undefined, decision).breakpointDecision).toBe(decision);
    }
  });

  test("a placed offset travels with its decision", () => {
    const trace = buildShapeTrace(stages(), 3, "placed");
    expect(trace.breakpointDecision).toBe("placed");
    expect(trace.cacheBreakpointFromEnd).toBe(3);
  });

  test("collapsed stage counts do NOT re-label a carried decision", () => {
    const collapsed = stages({ withTail: [{ role: "user" }, { role: "assistant" }, { role: "user" }], named: [{ role: "user" }, { role: "assistant" }] });
    // The old ladder read exactly this as `in-prefix-injection-or-squash`; the call said otherwise.
    expect(buildShapeTrace(collapsed, undefined, "second-volatile-tail").breakpointDecision).toBe("second-volatile-tail");
  });

  test("squashMerges is injected.length − squashed.length, and rows pass through verbatim", () => {
    const decision: ShapeBreakpointDecision = "second-volatile-tail";
    const trace = buildShapeTrace(
      stages({ injected: [{ role: "user" }, { role: "assistant" }, { role: "user" }], squashed: [{ role: "user" }, { role: "assistant" }] }),
      undefined,
      decision,
    );
    expect(trace.squashMerges).toBe(1);
    expect(trace.rows).toEqual([ROW]);
  });

  test("cacheBreakpointFromEnd is OMITTED (exactOptional), never present as an explicit undefined key", () => {
    const trace = buildShapeTrace(stages(), undefined, "no-stable-prefix");
    expect("cacheBreakpointFromEnd" in trace).toBe(false);
  });
});
