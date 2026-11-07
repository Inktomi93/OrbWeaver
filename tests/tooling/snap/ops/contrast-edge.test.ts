// The edge outcome as a pure function of its reading (tooling/src/snap/ops/contrast-edge.ts `edgeOutcome`), with no
// browser. tests/tooling/snap/ops/contrast-edge.int.test.ts proves the real capture lands in the right status class.
import { AA_NON_TEXT_RATIO } from "@orb/kit/theme-derivation";
import { expect, test } from "@orb/testkit/tooling";
import type { Rgb } from "../../../../tooling/src/floor/instrument/wcag.ts";
import type { ContrastEdgeSide, ContrastEdgeSideReading } from "../../../../tooling/src/snap/contract/contrast.ts";
import { CONTRAST_EDGE_SIDES } from "../../../../tooling/src/snap/contract/contrast.ts";
import { readEdgeChannels } from "../../../../tooling/src/snap/lib/contrast-edge.ts";
import { edgeOutcome } from "../../../../tooling/src/snap/ops/contrast-edge.ts";

const SELECTOR = "#field";
const SUBJECT = { matchIndex: 0, total: 1 } as const;
const PAGE: Rgb = { r: 255, g: 255, b: 255 };
const CLEAR_INK: Rgb = { r: 138, g: 138, b: 138 };
const FAINT_INK: Rgb = { r: 224, g: 224, b: 224 };
const CLEAR_RATIO = 4.5;
const FAINT_RATIO = 1.5;

function measuredSide(side: ContrastEdgeSide, ratio: number, ink: Rgb): ContrastEdgeSideReading {
  return { side, kind: "measured", ratio, ink, neighbour: PAGE, inkShare: 1, neighbourShare: 1, inkPixels: 200, neighbourPixels: 200 };
}

const allClear = CONTRAST_EDGE_SIDES.map((side) => measuredSide(side, CLEAR_RATIO, CLEAR_INK));

test("the worst side carries the verdict and is named, even when the perimeter average clears the floor", () => {
  const sides = CONTRAST_EDGE_SIDES.map((side) =>
    side === "bottom" ? measuredSide(side, FAINT_RATIO, FAINT_INK) : measuredSide(side, CLEAR_RATIO, CLEAR_INK),
  );
  // Three clear sides and one faint one average above 3:1, so an averaging verdict would pass this border.
  expect((3 * CLEAR_RATIO + FAINT_RATIO) / sides.length).toBeGreaterThan(AA_NON_TEXT_RATIO);

  const split = edgeOutcome(SELECTOR, SUBJECT, { kind: "measured", sides });
  expect(split.evidence).toMatchObject({
    status: "ok",
    method: "edge-sample",
    ratio: FAINT_RATIO,
    passed: false,
    foreground: FAINT_INK,
    sampled: 4,
    reason: null,
  });
  expect(split.outcome.failed).toBe(true);
  expect(split.outcome.line).toContain(`CONTRAST-EDGE ${SELECTOR}: ${FAINT_RATIO.toFixed(2)}:1  FAIL`);
  expect(split.outcome.line).toContain("worst side bottom");
  expect(split.outcome.line).toContain("bottom: 1.50:1 FAIL 224,224,224 on 255,255,255");
  expect(split.outcome.line).toContain("top: 4.50:1 PASS");

  // Positive control: the same four sides all clear pass.
  const clear = edgeOutcome(SELECTOR, SUBJECT, { kind: "measured", sides: allClear });
  expect(clear.evidence).toMatchObject({ status: "ok", ratio: CLEAR_RATIO, passed: true, reason: null });
  expect(clear.outcome.failed).toBe(false);
  expect(clear.outcome.line).toContain("PASS");
});

test("a side nobody could measure fails a border whose measured sides all clear, and the detail names it", () => {
  const sides = allClear.map((row) => (row.side === "left" ? ({ side: "left", kind: "refused", reason: "neighbour band too thin" } as const) : row));
  const partial = edgeOutcome(SELECTOR, SUBJECT, { kind: "measured", sides });
  expect(partial.evidence).toMatchObject({ status: "ok", passed: false, sampled: 3 });
  expect(partial.evidence.reason).toContain("left: NO VERDICT (neighbour band too thin)");
  expect(partial.outcome.failed).toBe(true);
});

test("a borderless subject is refused with the reason and the arm to use instead", () => {
  const image = { data: new Uint8Array(12 * 12 * 3).fill(255), width: 12, height: 12, channels: 3 };
  const geometry = {
    interior: { left: 2, top: 2, width: 8, height: 8 },
    radii: { tl: 0, tr: 0, br: 0, bl: 0 },
    feather: 1,
    borders: { top: 0, right: 0, bottom: 0, left: 0 },
    pad: 1,
  };
  const none = edgeOutcome(SELECTOR, SUBJECT, readEdgeChannels(image, geometry));
  expect(none.evidence).toMatchObject({ status: "refused", ratio: null, passed: null, method: null });
  expect(none.outcome.failed).toBe(true);
  expect(none.outcome.line).toContain(`CONTRAST-EDGE ${SELECTOR}: NO VERDICT (edge unmeasurable)`);
  expect(none.outcome.line).toContain("no border on any side");
  expect(none.outcome.line).toContain("use --contrast");
});

test("painted sides that all refuse are a refusal, never a pass", () => {
  const sides = CONTRAST_EDGE_SIDES.map((side) => ({ side, kind: "refused", reason: "neighbour band too thin" }) as const);
  const unread = edgeOutcome(SELECTOR, SUBJECT, { kind: "measured", sides });
  expect(unread.evidence).toMatchObject({ status: "refused", ratio: null, passed: null });
  expect(unread.outcome.failed).toBe(true);
  expect(unread.outcome.line).toContain("NO VERDICT (no side could be measured)");
});

test("a failed capture is an instrument error that fails the run and names the capture fault", () => {
  const fault = edgeOutcome(SELECTOR, SUBJECT, { kind: "capture-failed", reason: "screenshot failed twice: Target closed." });
  expect(fault.evidence).toMatchObject({ status: "instrument-error", ratio: null, passed: null, candidates: 1, matchIndex: 0 });
  expect(fault.outcome).toEqual({ line: `CONTRAST-EDGE ${SELECTOR}: screenshot failed twice: Target closed.`, failed: true });
});
