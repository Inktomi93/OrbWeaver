// The reservation seam for rendered image probes (#625/#654): hold an image request PENDING, measure the
// box the layout reserved for it, then RELEASE it and measure again. The two boxes being identical is the
// whole claim — "the reserved box IS the true box", i.e. zero layout shift when the bytes land.
//
// Why a held route and not just a slow image: `aspect-ratio` is a POST-intrinsic-size rule. A pre-load
// `<img>` with no definite inline size lays out 0×0 and the ratio has nothing to act on, so a probe that
// only measures the SETTLED image cannot see the defect at all — it is invisible by construction unless the
// measurement happens while the bytes are still in flight.

import type { Locator, Page, Route } from "@playwright/test";

/** The `portrait` size preset's exact dimensions — the ratio a reserved box is checked against. */
export const PORTRAIT_W = 1024;
export const PORTRAIT_H = 1536;
export const PORTRAIT_RATIO = PORTRAIT_W / PORTRAIT_H;

/** An SVG carrying its own intrinsic size, so the browser reports naturalWidth/naturalHeight from the bytes
 *  alone. The circle makes a stretch visible as an ellipse (the #622 distortion axis). */
const PORTRAIT_SVG_BODY = `<svg xmlns="http://www.w3.org/2000/svg" width="${PORTRAIT_W}" height="${PORTRAIT_H}"><rect width="${PORTRAIT_W}" height="${PORTRAIT_H}" fill="#222"/><circle cx="512" cy="512" r="400" fill="#eee"/></svg>`;

/**
 * Hold every request for `url` pending, and hand back the release. REGISTER THIS AFTER `routeTrpc` — page
 * routes resolve LIFO, so an image route added first would swallow the tRPC handler's turn.
 *
 * The release THROWS when no request ever arrived rather than resolving quietly: a silent no-op here would
 * make the follow-up "settled" poll time out somewhere else entirely, which reads as a component defect
 * instead of a probe that never ran.
 */
/**
 * The element's LAYOUT box — `offsetWidth/offsetHeight`, never `boundingBox()`. A bounding box carries CSS
 * TRANSFORMS, and a lightbox image measured while its Dialog is still scaling in reads a few percent small
 * (measured 285×427.5 mid-animation against 294.75×442.1 settled), which is indistinguishable from a real
 * reservation defect. The reserved box is a LAYOUT fact, so measure it in layout terms.
 */
export function layoutBox(locator: Locator): Promise<{ readonly w: number; readonly h: number }> {
  return locator.evaluate((el) => ({ w: (el as HTMLElement).offsetWidth, h: (el as HTMLElement).offsetHeight }));
}

export async function holdPortraitImage(page: Page, url: string): Promise<() => Promise<void>> {
  let held: Route | undefined;
  await page.route(`**${url}`, (route) => {
    held = route;
  });
  return async (): Promise<void> => {
    if (held === undefined) {
      throw new Error(`holdPortraitImage: nothing ever requested ${url} — the probe never ran, so its box is not a measurement.`);
    }
    await held.fulfill({ status: 200, contentType: "image/svg+xml", body: PORTRAIT_SVG_BODY });
  };
}
