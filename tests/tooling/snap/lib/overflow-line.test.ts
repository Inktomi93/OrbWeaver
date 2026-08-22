// The `--expect-no-overflow` verdict (tooling/src/snap/lib/overflow-line.ts): which combination of
// scroll delta, judged sides and child escapes prints FAIL, and what the operator is told.
// The MEASUREMENT half is layout arithmetic and is proved in a real browser
// (tests/tooling/snap/ops/overflow.ct.tsx) — jsdom has no layout, so nothing here fakes one.
import type { OverflowProbe } from "../../../../tooling/src/snap/index.ts";
import { overflowAssertionLine } from "../../../../tooling/src/snap/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function probe(overrides: Partial<OverflowProbe> = {}): OverflowProbe {
  return { scrollX: 0, scrollY: 0, judged: ["left", "top", "right", "bottom"], escapes: [], ...overrides };
}

test("overflowAssertionLine: a clean box passes and still states which sides were judged", () => {
  const outcome = overflowAssertionLine("[role=dialog]", probe());

  expect(outcome.failed).toBe(false);
  expect(outcome.line).toBe("ASSERT no-overflow [role=dialog]: PASS overflow=0x0 judged=left+top+right+bottom escapes=0");
});

// THE #444 DEFECT ITSELF: the historical arm reads 0x0 on a frame where a control is cut. A verdict
// that consulted only the scroll delta would print PASS here, which is exactly what shipped over #439.
test("overflowAssertionLine: a child escaping a box whose scroll delta is ZERO fails, naming the element, the side and the spill", () => {
  const outcome = overflowAssertionLine("[role=dialog]", probe({ escapes: [{ selector: 'button.footer-action "Blank chat"', side: "left", px: 35 }] }));

  expect(outcome.failed).toBe(true);
  expect(outcome.line).toBe(
    'ASSERT no-overflow [role=dialog]: FAIL overflow=0x0 judged=left+top+right+bottom escapes=1 — button.footer-action "Blank chat" exits left by 35px',
  );
});

test("overflowAssertionLine: the scroll arm keeps its own 1px tolerance and its own verdict", () => {
  expect(overflowAssertionLine("html", probe({ scrollX: 1 })).failed).toBe(false);
  expect(overflowAssertionLine("html", probe({ scrollX: 2 })).failed).toBe(true);
  expect(overflowAssertionLine("html", probe({ scrollY: 12 })).line).toContain("FAIL overflow=0x12");
});

// A blind spot the reader is not told about is how #439 happened. The judged SIDES are stated on the
// line, pass or fail, so "escapes=0" can never be mistaken for "nothing escapes".
test("overflowAssertionLine: declined sides are printed, so a PASS never overstates what was measured", () => {
  // A scrolling page: `bottom` is reachable and belongs to the scroll delta — `top` never is.
  expect(overflowAssertionLine("html", probe({ scrollY: 900, judged: ["left", "top", "right"] })).line).toContain("judged=left+top+right");
  expect(overflowAssertionLine(".pane", probe({ judged: [] })).line).toContain("judged=none");
});

test("overflowAssertionLine: several escapes are reported on one line", () => {
  const outcome = overflowAssertionLine(
    ".footer",
    probe({
      escapes: [
        { selector: "button.a", side: "left", px: 35 },
        { selector: "button.b", side: "bottom", px: 4 },
      ],
    }),
  );

  expect(outcome.line).toContain("escapes=2 — button.a exits left by 35px; button.b exits bottom by 4px");
});
