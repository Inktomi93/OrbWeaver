// CT: the refinery TEACHING state's three-step flow row, after the owner's 2026-08-09 ruling
// ("01/02/03 markers = REDRAW without numbers (the §6 ban stays absolute; mock loses this one)").
//
// The row is the whole point of these three tests, and each one pins a different half of the ruling:
//   1. the SEQUENCE survives without numerals — the three stage names render in stage order;
//   2. the MARKERS are gone AND the praised copy is byte-identical — one exact-text assertion over the
//      row's rendered text does both, so a re-introduced `01` and a reworded sentence fail the same way
//      (the mock's copy was signed off verbatim; the numerals were not);
//   3. nothing the redraw ADDED talks: the stage glyphs and the flow chevrons are decoration, so the
//      order a screen reader gets is DOM order, not five newly-announced graphics.
// Mounted through the feature front door (a relative import into packages/client/src hands the story a
// different React context instance and mounts blank).

import { expect, test } from "@playwright/experimental-ct-react";
import { TeachingStateStory } from "../_ct-stories.tsx";

const STEPS_ROW = '[data-testid="refinery-teaching-steps"]';
// The WHOLE teaching state — deliberately wider than the row for the marker sweep below: the ban is on
// numbered markers in this state, not merely in one of its containers, and this scope is the one that
// exists in the PRE-redraw source too (which is what makes that test a real historical control).
const TEACHING = '[data-testid="refinery-teaching"]';

/** The row's rendered text, whitespace-collapsed — the mock's step copy, verbatim, and NOTHING else. */
const EXPECTED_ROW_TEXT = [
  "Score",
  "A critique per field, with a 1-10 and what to fix.",
  "Rewrite",
  "Only the fields you selected, using the score and your guidance.",
  "Analyze",
  "Compares the rewrite against your ORIGINAL — never the previous rewrite.",
].join("");

/** The mock's step markers, as the owner ruling names them. */
const MARKERS = ["01", "02", "03"];
/** Three stage glyphs + two between-cell chevrons — every one of them decoration. */
const GLYPH_COUNT = 5;
/** The narrowest real mount for this state: a 390px phone with the shell's CONTENT gutters removed. */
const PHONE_CONTENT_PX = 358;
/** Sub-pixel slack for a fractional layout box — never a real overflow budget. */
const SUBPIXEL = 0.5;

test("the three stages read in flow order without a single numbered marker", async ({ mount, page }) => {
  await mount(<TeachingStateStory />);
  const row = page.locator(STEPS_ROW);
  await expect(row).toBeVisible();

  const text = ((await row.textContent()) ?? "").replaceAll(/\s+/gu, " ").trim();
  // Exact, not `toContain`: this is simultaneously the copy-verbatim pin and the no-marker pin. A
  // resurrected "01" cell would land INSIDE this string and fail here, and so would a reworded step.
  expect(text.replaceAll(" ", "")).toBe(EXPECTED_ROW_TEXT.replaceAll(" ", ""));
});

test("the marker numerals are absent as rendered text (the mock's 01/02/03 lost to the house ban)", async ({ mount, page }) => {
  await mount(<TeachingStateStory />);
  const teaching = page.locator(TEACHING);
  await expect(teaching).toBeVisible();
  // Named individually so a failure says WHICH marker came back. `1-10` in the Score copy is a range,
  // not a marker — a bare-digit sweep would flag it, which is why the ban is asserted on the markers.
  await Promise.all(MARKERS.map(async (marker) => await expect(teaching.getByText(marker, { exact: true })).toHaveCount(0)));
});

test("the flow row stays INSIDE the narrowest real mount — no cell clipped off the pane's edge", async ({ mount, page }) => {
  // Measured, not assumed: at 358px the row rendered 448px wide and — because the teaching Stack centres
  // its children — hung off BOTH edges, with the Score cell's left half cut away by the pane. A
  // `scrollWidth - clientWidth` read on the row itself sees none of that (a non-wrapping flex row does not
  // scroll, its overflowing children just paint outside it), which is why this asserts the rendered BOX
  // against the frame's box instead. The narrowest real mount for this state is the phone CONTENT pane.
  await mount(<TeachingStateStory width={PHONE_CONTENT_PX} />);
  const row = page.locator(STEPS_ROW);
  await expect(row).toBeVisible();
  const frame = await page.locator('[data-testid="teaching-frame"]').boundingBox();
  const box = await row.boundingBox();
  expect(frame).not.toBeNull();
  expect(box).not.toBeNull();
  expect(box?.x ?? 0, "the flow row's left edge must not sit outside the pane").toBeGreaterThanOrEqual((frame?.x ?? 0) - SUBPIXEL);
  expect((box?.x ?? 0) + (box?.width ?? 0), "…nor its right edge").toBeLessThanOrEqual((frame?.x ?? 0) + (frame?.width ?? 0) + SUBPIXEL);
});

test("the stage glyphs and the flow chevrons are decoration — the sequence is DOM order, not five new graphics", async ({ mount, page }) => {
  await mount(<TeachingStateStory />);
  const row = page.locator(STEPS_ROW);
  await expect(row.locator("svg")).toHaveCount(GLYPH_COUNT);
  await expect(row.locator("svg:not([aria-hidden='true'])")).toHaveCount(0);
  // …and nothing in the row is exposed as an image/graphic role to a reader.
  await expect(row.getByRole("img")).toHaveCount(0);
});
