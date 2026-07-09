// Reading-typography wiring CT (Phase 4b §B.5.3) — proves the appearance "reading" knobs actually reach
// the rendered message DOM as COMPUTED CSS, not just as root custom properties. app-shell.ct.tsx already
// proves the STAMPING half (getUserSettings → useAppearance → useAppearanceRootEffects → `--font-scale`
// on <html>); the same effect body stamps every `--reading-*` var in one shot. What nothing asserted
// until now is the CONSUMPTION half: the client globals.css rules on `[data-slot="message-bubble"]` /
// `[data-slot="message-attribution"]` reading those vars into real properties. `ReadingTypographyFixture`
// stamps NON-DEFAULT reading values through the REAL hook and renders the two slots; these tests read the
// resolved computed styles off them. Every expectation is anchored to values read LIVE off the DOM (the
// `--text-body`/`--text-label` tokens + the stamped `--reading-*` vars) — never a hardcoded px/token
// literal (the golden rule; theme-scope.ct.tsx / message-row.ct.tsx precedent).

import { expect, test } from "@playwright/experimental-ct-react";
import type { ReactElement } from "react";
import { ReadingTypographyFixture } from "../_cascade-fixtures";

// The test's chosen non-default reading values — each clearly distinct from the schema defaults
// (line-height 1.55, letter-spacing 0em, paragraph-spacing 0.75rem, name-scale 1, body-scale 1) so a
// broken var (falling back to the default or `normal`) can't coincidentally satisfy the assertion.
const LINE_HEIGHT = 2;
const LETTER_SPACING_EM = 0.05;
const PARAGRAPH_SPACING_REM = 1.5;
const NAME_SCALE = 1.4;
const BODY_SCALE = 1.3;

function fixture(): ReactElement {
  return (
    <ReadingTypographyFixture
      lineHeight={LINE_HEIGHT}
      letterSpacing={LETTER_SPACING_EM}
      paragraphSpacing={PARAGRAPH_SPACING_REM}
      nameScale={NAME_SCALE}
      bodyScale={BODY_SCALE}
      justify={true}
    />
  );
}

test("reading vars drive the message bubble's computed line-height / letter-spacing / body-scale / paragraph-spacing / justify", async ({
  mount,
}) => {
  const cmp = await mount(fixture());
  const bubble = cmp.getByTestId("reading-bubble");

  // Read the bubble's resolved properties + the tokens/vars its globals.css rules compose from, all live
  // off the real element — so the expected values are reconstructed from source, not guessed.
  const b = await bubble.evaluate((el) => {
    const cs = getComputedStyle(el);
    const rootFontPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const secondP = el.querySelectorAll("p")[1];
    return {
      fontSizePx: Number.parseFloat(cs.fontSize),
      lineHeightPx: Number.parseFloat(cs.lineHeight),
      letterSpacingPx: Number.parseFloat(cs.letterSpacing),
      textAlign: cs.textAlign,
      rootFontPx,
      textBodyRem: Number.parseFloat(cs.getPropertyValue("--text-body")),
      bodyScaleVar: Number.parseFloat(cs.getPropertyValue("--reading-body-scale")),
      paragraphMarginTopPx:
        secondP === undefined ? Number.NaN : Number.parseFloat(getComputedStyle(secondP).marginTop),
    };
  });

  // body-scale → `font-size: calc(var(--text-body) * var(--reading-body-scale))`. Rebuilt from the token
  // (--text-body, rem) × root font-size × the stamped scale var — proves the scale is IN the calc (a rule
  // that dropped it would land on text-body alone and fail at BODY_SCALE ≠ 1).
  expect(b.bodyScaleVar).toBeCloseTo(BODY_SCALE, 5);
  expect(b.fontSizePx).toBeCloseTo(b.textBodyRem * b.rootFontPx * BODY_SCALE, 1);

  // line-height → `line-height: var(--reading-line-height)` (unitless; Chrome resolves the computed value
  // to px = factor × font-size). The ratio recovers the stamped factor independent of font-size.
  expect(b.lineHeightPx / b.fontSizePx).toBeCloseTo(LINE_HEIGHT, 2);

  // letter-spacing → `letter-spacing: var(--reading-letter-spacing)` (`${x}em`; em resolves against the
  // element's own font-size). The ratio recovers the stamped em value.
  expect(b.letterSpacingPx / b.fontSizePx).toBeCloseTo(LETTER_SPACING_EM, 3);

  // paragraph-spacing → `[data-slot="message-bubble"] p + p { margin-top: var(--reading-paragraph-spacing) }`
  // (`${x}rem`; rem resolves against the root font-size). Only the SECOND paragraph (the `p + p`) gets it.
  expect(b.paragraphMarginTopPx / b.rootFontPx).toBeCloseTo(PARAGRAPH_SPACING_REM, 3);

  // justify → `html[data-justify-body-text] [data-slot="message-bubble"] { text-align: justify }`. The
  // hook sets the presence attr on <html>; the bubble's computed text-align flips.
  expect(b.textAlign).toBe("justify");
});

test("reading name-scale drives the attribution's computed font-size", async ({ mount }) => {
  const cmp = await mount(fixture());
  const attribution = cmp.getByTestId("reading-attribution");

  const a = await attribution.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      fontSizePx: Number.parseFloat(cs.fontSize),
      rootFontPx: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      textLabelRem: Number.parseFloat(cs.getPropertyValue("--text-label")),
      nameScaleVar: Number.parseFloat(cs.getPropertyValue("--reading-name-scale")),
    };
  });

  // name-scale → `[data-slot="message-attribution"] { font-size: calc(var(--text-label) * var(--reading-name-scale)) }`.
  expect(a.nameScaleVar).toBeCloseTo(NAME_SCALE, 5);
  expect(a.fontSizePx).toBeCloseTo(a.textLabelRem * a.rootFontPx * NAME_SCALE, 1);
});
