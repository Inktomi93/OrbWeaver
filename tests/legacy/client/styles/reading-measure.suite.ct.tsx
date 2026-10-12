// CT suite: the CLIENT STYLES TIER (`packages/client/src/styles/globals.css`) actually reaches the
// rendered component. Cross-cutting by construction — the rules under test are unattached to any one
// component (they select on `[data-slot=…]`), and the reading measure deliberately spans BOTH transcript
// row implementations — so this is a `.suite.ct.tsx`, not a per-component mirror.
//
// WHY IT EXISTS (#114). Until 2026-08-16 the playwright-ct harness sheet (`playwright/index.css`) loaded
// only `@orb/ui/styles/globals.css` + the app-shell's `shell.css`. The client tier — the 75ch reading
// measure, reading typography, the glass/grain treatments, the transcript edge-fade mask — was
// structurally ABSENT from every component test, so a styles-tier regression could not red a CT and the
// measure's own header said so in as many words. The harness now mirrors the production load order
// (shell.css → @orb/ui globals → client globals); these tests are the tripwire that keeps it loaded.
//
// EVERY ASSERTION DERIVES ITS EXPECTED VALUE FROM THE TOKEN, never a px literal: `--reading-measure` is
// `75ch`, which resolves against the element's own font, so the expected pixel width is measured off a
// throwaway probe planted INSIDE the very element under test (same inherited font ⇒ same `ch`).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { GhostRowStory, MessageRowStory } from "../features/chat/_ct-stories.tsx";

const CONTENT_COLUMN = '[data-slot="message-content-column"]';
const BUBBLE = '[data-slot="message-bubble"]';

/** Far wider than any real transcript column, so an UNCAPPED column stretches to it and the cap is the
 *  only thing that can hold the line length down (the pre-#97 defect measured ~200ch on a 2560 monitor). */
const WIDE_MOUNT = 2000;

const LONG_PROSE =
  "The archive keeps its own weather, and the weather keeps its own archive; every page that is read " +
  "is a page that is rewritten, and every page rewritten is a page that will be read again by someone " +
  "who does not know they are the second reader of a sentence that was never finished the first time.";

interface MeasureReading {
  /** `getComputedStyle().maxWidth` verbatim — `"none"` is the un-capped (pre-#97 / sheet-absent) render. */
  readonly maxWidth: string;
  /** `--reading-measure` resolved to px in the column's OWN font context. */
  readonly tokenPx: number;
  readonly renderedWidth: number;
  /** The SAME column re-measured with the cap forced off — the A/B that proves the cap is load-bearing
   *  here rather than coincidentally agreeing with some other constraint in the row's chrome. */
  readonly uncappedWidth: number;
}

/** Reads the cap, the token it must equal, and the with/without widths off the live column. The probe is
 *  planted inside the column so its `ch` resolves against the identical inherited font, then removed
 *  before anything layout can see (it is absolutely positioned, so it never perturbs the flex column). */
async function readMeasure(page: Page): Promise<MeasureReading> {
  return await page.evaluate((selector): MeasureReading => {
    const column = document.querySelector(selector);
    if (column === null || !(column instanceof HTMLElement)) {
      throw new Error(`no ${selector} mounted`);
    }
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.width = "var(--reading-measure)";
    column.append(probe);
    const tokenPx = probe.getBoundingClientRect().width;
    probe.remove();
    const maxWidth = getComputedStyle(column).maxWidth;
    const renderedWidth = column.getBoundingClientRect().width;
    // `!important` inline beats the stylesheet rule; restoring the (empty) inline value puts the sheet
    // back in charge, so nothing leaks into a later assertion.
    column.style.setProperty("max-width", "none", "important");
    const uncappedWidth = column.getBoundingClientRect().width;
    column.style.removeProperty("max-width");
    return { maxWidth, tokenPx, renderedWidth, uncappedWidth };
  }, CONTENT_COLUMN);
}

test("the transcript content column is capped at the --reading-measure token, and the cap BINDS at a wide mount", async ({ mount, page }) => {
  // `flat` deliberately, not `bubble`: the five bubble-family skins cap their INNER box themselves
  // (`messageBubbleClass`) and `document` caps at `max-w-prose`, so on those the column never reaches the
  // measure and the cap would be untestable-by-construction. flat's `w-full items-stretch` outer +
  // `w-full` inner is the un-capped arm — i.e. exactly the render #97 measured at ~98ch/1280px.
  await mount(<MessageRowStory chatStyle="flat" content={LONG_PROSE} width={WIDE_MOUNT} />);
  await expect(page.locator(CONTENT_COLUMN)).toBeVisible();

  const measure = await readMeasure(page);

  // The token resolved to a real width — a zero here would mean the probe never resolved the var and the
  // comparisons below would pass vacuously.
  expect(measure.tokenPx).toBeGreaterThan(0);
  // The defect this pins: `max-width: none` is exactly what the transcript rendered before #97, and
  // exactly what every CT rendered before #114 (the sheet was not loaded at all).
  expect(measure.maxWidth).not.toBe("none");
  expect(Number.parseFloat(measure.maxWidth)).toBeCloseTo(measure.tokenPx, 0);
  // It BINDS: with the cap forced off the same column spreads well past the measure at this mount, and
  // with it on the line length stops at the measure. (The row's own chrome — `max-w-(--width-shell-content)`
  // on the outer, shrink-to-fit alignment — is why the capped width is at-or-under the measure rather
  // than exactly it; the A/B is what proves the cap, not the raw number.)
  expect(measure.uncappedWidth).toBeGreaterThan(measure.tokenPx);
  expect(measure.renderedWidth).toBeLessThanOrEqual(measure.tokenPx + 0.5);
  expect(measure.renderedWidth).toBeLessThan(WIDE_MOUNT);
});

test("the streaming ghost row carries the SAME measure as the committed row (no reflow at commit)", async ({ mount, page }) => {
  const component = await mount(<GhostRowStory />);
  // The ghost is live-gated exactly as the production surface gates it — no turn, no row.
  await component.getByTestId("begin").click();
  await expect(page.locator(CONTENT_COLUMN)).toBeVisible();

  const measure = await readMeasure(page);

  expect(measure.tokenPx).toBeGreaterThan(0);
  expect(measure.maxWidth).not.toBe("none");
  // Same rule, same token, same resolved px as the committed row above — that equality IS the invariant
  // the styles-tier home exists to hold (a ghost on a different measure jumps visibly at commit).
  expect(Number.parseFloat(measure.maxWidth)).toBeCloseTo(measure.tokenPx, 0);
});

test("reading typography reaches the bubble — line-height rides --reading-line-height", async ({ mount, page }) => {
  await mount(<MessageRowStory chatStyle="bubble" content={LONG_PROSE} width={WIDE_MOUNT} />);
  await expect(page.locator(BUBBLE).first()).toBeVisible();

  const typography = await page.evaluate((selector) => {
    const bubble = document.querySelector(selector);
    if (bubble === null) {
      throw new Error(`no ${selector} mounted`);
    }
    const style = getComputedStyle(bubble);
    return {
      lineHeightPx: Number.parseFloat(style.lineHeight),
      fontSizePx: Number.parseFloat(style.fontSize),
      ratioToken: Number.parseFloat(style.getPropertyValue("--reading-line-height")),
    };
  }, BUBBLE);

  await expect
    .poll(
      async () =>
        (
          await page.evaluate((selector) => {
            const bubble = document.querySelector(selector);
            if (bubble === null) {
              throw new Error(`no ${selector} mounted`);
            }
            const style = getComputedStyle(bubble);
            return {
              lineHeightPx: Number.parseFloat(style.lineHeight),
              fontSizePx: Number.parseFloat(style.fontSize),
              ratioToken: Number.parseFloat(style.getPropertyValue("--reading-line-height")),
            };
          }, BUBBLE)
        ).ratioToken,
    )
    .toBeGreaterThan(0);
  await expect
    .poll(
      async () =>
        (
          await page.evaluate((selector) => {
            const bubble = document.querySelector(selector);
            if (bubble === null) {
              throw new Error(`no ${selector} mounted`);
            }
            const style = getComputedStyle(bubble);
            return {
              lineHeightPx: Number.parseFloat(style.lineHeight),
              fontSizePx: Number.parseFloat(style.fontSize),
              ratioToken: Number.parseFloat(style.getPropertyValue("--reading-line-height")),
            };
          }, BUBBLE)
        ).lineHeightPx,
    )
    .toBeCloseTo(typography.fontSizePx * typography.ratioToken, 1);
});
