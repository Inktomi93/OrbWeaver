// CT: the `{{macro}}` chip's WEIGHT — crunch-list item 14 ("THE BLUE PROBLEM"). The chip shipped as a
// full-saturation `Badge intent="info"` (solid tone by default: `bg-info` + `text-info-foreground`), so a
// preview of what the model receives read as a run of prose interrupted by saturated blue lozenges — the
// loud half of the blue family the mocks never paint (mock `.tok`, docs/design/mocks/preset-redesign/
// context-readouts.html:73 — info-colored TEXT on a ~10% info tint, no fill, no border).
//
// The owner ruling that bounds this fix: `--color-info` STAYS BLUE. The defect is the pill's RENDERING,
// not the palette — so these assert the two things that had to move (the fill receded to a tint; the text
// became the hue itself) against the RESOLVED token, never an authored class, and never a hardcoded color.
//
// The third assertion is the F-6 invariant this fix must not break: the in-flow arm draws NO border box.
// `tone="soft"` carries a hairline in every other position; on an `inline` box a border adds horizontal
// advance, which is exactly the punctuation-detachment (`{{user}} 's voice`) the inline arm exists to kill.

import { expect, test } from "@playwright/experimental-ct-react";
import { MacroText } from "../../../../../packages/client/src/features/preset/components/macro-text.tsx";
import { resolvedTokenColor } from "../../../../support/ct/resolved-token-color.ts";

/** One literal run, one macro run, one literal run — the shape every real readout hands this component. */
const RUN = [
  { kind: "text", value: "You are " },
  { kind: "macro", value: "char" },
  { kind: "text", value: ", here." },
] as const;

const CHIP_TEXT = "{{char}}";

/** `oklch(… / 0.15)` / `color(srgb … / 0.15)` — the modern notation's trailing alpha. */
const SLASH_ALPHA_RE = /\/\s*([\d.]+)\s*\)/u;
/** `rgba(r, g, b, a)` — the legacy notation Chromium still resolves some colors into. */
const RGBA_RE = /^rgba?\(([^)]*)\)$/u;

/** The alpha channel of a computed color string, whatever notation Chromium resolved it into
 *  (`color(srgb r g b / a)`, `oklab(… / a)`, `rgba(…, a)`) — 1 when no alpha is stated. */
function alphaOf(computed: string): number {
  const slash = SLASH_ALPHA_RE.exec(computed);
  if (slash?.[1] !== undefined) {
    return Number.parseFloat(slash[1]);
  }
  const rgba = RGBA_RE.exec(computed);
  const parts = rgba?.[1]?.split(",");
  return parts !== undefined && parts.length === 4 ? Number.parseFloat(parts[3] ?? "1") : 1;
}

test("the macro chip's fill RECEDES to a tint — the solid info pill is gone", async ({ mount }) => {
  const run = await mount(<MacroText tokens={RUN} />);
  const chip = run.getByText(CHIP_TEXT);
  const background = await chip.evaluate((el) => getComputedStyle(el).backgroundColor);
  // The shape of the defect, stated as the thing that must NOT be true: an opaque paint of the info token.
  expect(background).not.toBe(resolvedTokenColor("color.info"));
  expect(alphaOf(background)).toBeLessThan(0.5);
  // …and it is a real tint, not a silent drop to transparent — the chip must still read as a chip.
  expect(alphaOf(background)).toBeGreaterThan(0);
});

test("the macro chip keeps the INFO hue — the fix is the rendering, not the palette (owner ruling)", async ({ mount }) => {
  const run = await mount(<MacroText tokens={RUN} />);
  // The quiet arm's TEXT is the info token itself (the solid arm's fill), not `info-foreground`. Asserting
  // the resolved token both proves the hue survived and reds if anyone re-hues `--color-info` to "fix" this.
  await expect(run.getByText(CHIP_TEXT)).toHaveCSS("color", resolvedTokenColor("color.info"));
});

test("the quieted chip still draws NO border box (the F-6 in-flow invariant)", async ({ mount }) => {
  const run = await mount(<MacroText tokens={RUN} />);
  const widths = await run.getByText(CHIP_TEXT).evaluate((el) => {
    const style = getComputedStyle(el);
    return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth];
  });
  for (const width of widths) {
    expect(Number.parseFloat(width)).toBe(0);
  }
});

// THE PREVIEW MUST COPY (side-eye R-5, the regression the F-1/F-6 fix introduced). Chipping macros through
// `Badge` inherited the base's `select-none`, which is right for a status pill and catastrophic for a token
// inside quoted wire text: selecting the readout and copying it returned the prose with the `{{input}}`
// silently MISSING and nothing saying anything had been dropped. This panel's stated job is "the string the
// model receives / the string you'd search for", so a copy that loses the macros is the one failure it
// cannot have. Asserted through the SELECTION the user would actually make, not through a class name.
test("selecting the run copies the BRACED macro with it — the preview is quotable", async ({ mount, page }) => {
  const run = await mount(<MacroText tokens={RUN} />);
  const selected = await run.evaluate((el) => {
    const selection = globalThis.getSelection();
    selection?.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(el);
    selection?.addRange(range);
    return selection?.toString() ?? "";
  });
  expect(selected).toContain(CHIP_TEXT);
  // The prose either side survives too — the fix must not turn the run into a chips-only selection.
  expect(selected).toContain("You are ");
  // And the computed property is the mechanism, stated once so a re-inherited `select-none` reds here too.
  await expect(run.getByText(CHIP_TEXT)).toHaveCSS("user-select", "text");
  await page.evaluate(() => globalThis.getSelection()?.removeAllRanges());
});

test("the chip is MONO — it inherits the datum run's own type face, so it reads as part of the wire text", async ({ mount }) => {
  const run = await mount(<MacroText tokens={RUN} />);
  const [chipFace, runFace] = await Promise.all([
    run.getByText(CHIP_TEXT).evaluate((el) => getComputedStyle(el).fontFamily),
    run.evaluate((el) => getComputedStyle(el).fontFamily),
  ]);
  expect(chipFace).toBe(runFace);
  expect(chipFace).toContain("mono");
});
