// The fill outcome as a pure function of its reading (tooling/src/snap/ops/contrast-fill.ts `fillOutcome`), with no
// browser. tests/tooling/snap/ops/contrast-fill.int.test.ts proves the real capture lands in the right status class.
import { AA_NON_TEXT_RATIO } from "@orb/kit/theme-derivation";
import { expect, test } from "@orb/testkit/tooling";
import type { Rgb } from "../../../../tooling/src/floor/instrument/wcag.ts";
import type { ContrastFillReading } from "../../../../tooling/src/snap/contract/contrast.ts";
import { readFillChannels } from "../../../../tooling/src/snap/lib/contrast-fill.ts";
import { fillOutcome } from "../../../../tooling/src/snap/ops/contrast-fill.ts";

const SELECTOR = "#thumb";
const BOX = { matchIndex: 2, tag: "DIV", total: 3 } as const;
const EMPTY_FIELD = { matchIndex: 0, tag: "TEXTAREA", total: 1 } as const;
const FILL: Rgb = { r: 20, g: 20, b: 20 };
const TRACK: Rgb = { r: 10, g: 10, b: 10 };
const NO_INK = "NO INK TO JUDGE";

function measured(ratio: number): ContrastFillReading {
  return { kind: "measured", ratio, fill: FILL, surround: TRACK, channel: "fill", share: 0.9, surroundShare: 1, interiorPixels: 900, bandPixels: 300 };
}

test("a measured fill prints its ratio, both colours and the edge check for the border question", () => {
  const quiet = fillOutcome(SELECTOR, BOX, measured(1.2));
  expect(quiet.evidence).toMatchObject({
    status: "ok",
    method: "fill-sample",
    ratio: 1.2,
    passed: false,
    requiredRatio: AA_NON_TEXT_RATIO,
    foreground: FILL,
    backdrop: TRACK,
    fillChannel: { kind: "fill", share: 0.9 },
    candidates: 3,
    matchIndex: 2,
  });
  expect(quiet.outcome.failed).toBe(true);
  expect(quiet.outcome.line).toContain(`CONTRAST ${SELECTOR}: FILL 1.20:1  FAIL`);
  expect(quiet.outcome.line).toContain("channel fill 90% of the box · 20,20,20 on 10,10,10 (100% of the band)");
  expect(quiet.outcome.line).toContain(`next: pnpm snap --contrast-edge "${SELECTOR}"`);
  expect(quiet.outcome.line).not.toContain(NO_INK);

  // Positive control: a fill over the floor passes and does not fail the run.
  const loud = fillOutcome(SELECTOR, BOX, measured(AA_NON_TEXT_RATIO));
  expect(loud.evidence).toMatchObject({ status: "ok", passed: true });
  expect(loud.outcome.failed).toBe(false);
  expect(loud.outcome.line).toContain("PASS");
});

test("an empty field's fill verdict says it judged the box, never the text", () => {
  const field = fillOutcome(SELECTOR, EMPTY_FIELD, measured(AA_NON_TEXT_RATIO));
  expect(field.outcome.line).toContain(NO_INK);
});

test("a fill with no surround is refused, fails the run, and names the reason", () => {
  // The subject covers the whole clip, so no band lies outside it.
  const image = { data: new Uint8Array(10 * 10 * 3).fill(20), width: 10, height: 10, channels: 3 };
  const reading = readFillChannels(image, { interior: { left: 0, top: 0, width: 10, height: 10 }, radii: { tl: 0, tr: 0, br: 0, bl: 0 }, feather: 1 });
  const full = fillOutcome(SELECTOR, BOX, reading);
  expect(full.evidence).toMatchObject({ status: "refused", method: null, ratio: null, passed: null, sampled: 0 });
  expect(full.outcome.failed).toBe(true);
  expect(full.outcome.line).toContain(`CONTRAST ${SELECTOR}: NO VERDICT (fill-only, undecodable)`);
  expect(full.outcome.line).toContain("no surround to measure against");
  expect(full.outcome.line).not.toContain(NO_INK);
  // The same refusal on an empty field still says there was no ink to judge.
  expect(fillOutcome(SELECTOR, EMPTY_FIELD, reading).outcome.line).toContain(NO_INK);
});

test("a failed capture is an instrument error that fails the run and names the capture fault", () => {
  const fault = fillOutcome(SELECTOR, BOX, { kind: "capture-failed", reason: "screenshot failed twice: Target closed." });
  expect(fault.evidence).toMatchObject({ status: "instrument-error", ratio: null, passed: null, candidates: 3, matchIndex: 2 });
  expect(fault.outcome).toEqual({ line: `CONTRAST ${SELECTOR}: screenshot failed twice: Target closed.`, failed: true });
});
