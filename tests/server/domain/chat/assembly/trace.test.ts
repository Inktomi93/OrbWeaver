// domain/chat/assembly/trace — pins the header's breakpointDecision derivation ladder (the four labels are
// DERIVED from stage facts, never re-run breakpoint logic): placed / no-stable-prefix / in-prefix-injection-
// or-squash / second-volatile-tail. Pure builder.

import type { ShapeTraceRow } from "@orb/contracts/chat";
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

describe("buildShapeTrace — the breakpointDecision ladder", () => {
  test("an offset present ⇒ placed, regardless of the other stage facts", () => {
    const trace = buildShapeTrace(stages(), 3);
    expect(trace.breakpointDecision).toBe("placed");
    expect(trace.cacheBreakpointFromEnd).toBe(3);
  });

  test("no offset AND withTail ≤ 1 ⇒ no-stable-prefix (nothing to pin)", () => {
    const trace = buildShapeTrace(stages({ withTail: [{ role: "user" }] }), undefined);
    expect(trace.breakpointDecision).toBe("no-stable-prefix");
    expect(trace.cacheBreakpointFromEnd).toBeUndefined();
  });

  test("named shorter than withTail ⇒ in-prefix-injection-or-squash (a prefix-internal squash collapsed it)", () => {
    const trace = buildShapeTrace(
      stages({ withTail: [{ role: "user" }, { role: "assistant" }, { role: "user" }], named: [{ role: "user" }, { role: "assistant" }] }),
      undefined,
    );
    expect(trace.breakpointDecision).toBe("in-prefix-injection-or-squash");
  });

  test("otherwise (a nudge/continuation appended a second tail) ⇒ second-volatile-tail", () => {
    const trace = buildShapeTrace(stages(), undefined);
    expect(trace.breakpointDecision).toBe("second-volatile-tail");
  });

  test("squashMerges is injected.length − squashed.length, and rows pass through verbatim", () => {
    const trace = buildShapeTrace(
      stages({ injected: [{ role: "user" }, { role: "assistant" }, { role: "user" }], squashed: [{ role: "user" }, { role: "assistant" }] }),
      undefined,
    );
    expect(trace.squashMerges).toBe(1);
    expect(trace.rows).toEqual([ROW]);
  });

  test("cacheBreakpointFromEnd is OMITTED (exactOptional), never present as an explicit undefined key", () => {
    const trace = buildShapeTrace(stages(), undefined);
    expect("cacheBreakpointFromEnd" in trace).toBe(false);
  });
});
