// CT support for driving + reading the brand weave under a COARSE pointer (#152).
//
// `touchDrag` goes through chromium's REAL touch pipeline (CDP `Input.dispatchTouchEvent`), not a
// hand-built DOM `TouchEvent`: a synthesized event would skip touch-action arbitration and gesture
// detection — which is exactly the machinery that decides whether a thumb reaches the weave's pointer
// listeners at all, so a synthetic drive can only ever prove the handler, never the affordance.
// Requires a touch-enabled context (`test.use({ hasTouch: true })`).
//
// The fingerprint pair is the weave's user-visible read: the canvas has no DOM to assert against, so
// "the silk rang" is proven as "the painted frame moved further than the web's own ambient motion"
// (the web-weave.ct.tsx mouse-path precedent). Always compare a drive delta against a noise floor
// sampled the same way — glint, dew and the spider move the frame every tick on their own.

import type { CDPSession, Locator, Page } from "@playwright/test";

export interface WeavePoint {
  readonly x: number;
  readonly y: number;
}

/** A real finger: touchStart → `steps` touchMoves → touchEnd, through the browser's own input path. */
export async function touchDrag(page: Page, from: WeavePoint, to: WeavePoint, steps: number): Promise<void> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const moves = Array.from({ length: steps }, (_, i) => ({
    x: from.x + ((to.x - from.x) * (i + 1)) / steps,
    y: from.y + ((to.y - from.y) * (i + 1)) / steps,
  }));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] });
  // A sequential chain, not an awaited loop: the ORDER of the moves is the gesture.
  await moves.reduce(
    (chain, point) => chain.then(async () => void (await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] }))),
    Promise.resolve(),
  );
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** A coarse whole-frame color fingerprint of a weave canvas — any recolor or deformation shifts it. */
export function frameFingerprint(canvas: Locator): Promise<string> {
  return canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const ctx = c.getContext("2d");
    if (ctx === null) {
      return "no-ctx";
    }
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i] as number;
      g += data[i + 1] as number;
      b += data[i + 2] as number;
    }
    return `${r}:${g}:${b}`;
  });
}

/** Channel-sum distance between two `frameFingerprint` readings. */
export function fingerprintDelta(a: string, b: string): number {
  const pa = a.split(":").map(Number);
  const pb = b.split(":").map(Number);
  return Math.abs((pa[0] ?? 0) - (pb[0] ?? 0)) + Math.abs((pa[1] ?? 0) - (pb[1] ?? 0)) + Math.abs((pa[2] ?? 0) - (pb[2] ?? 0));
}

/** Idle-frame spans the ambient ceiling samples over: several short beats plus one long one. */
const AMBIENT_SPANS = [2, 2, 2, 2, 30] as const;

/**
 * An upper bound on how far the weave's OWN motion moves the frame while nobody touches it.
 *
 * A single short sample is not a floor, it is a lottery: measured on one settled web, back-to-back
 * two-frame deltas ranged 16k–136k (the glint sweep dominates) while a 30-frame span read 74k. A
 * threshold built on one sample either flakes red or passes a drive that did nothing. So sample
 * repeatedly, across both short and long spans, and take the MAX — a ring is ~1.4M, an order of
 * magnitude clear of the worst ambient beat, so the ceiling costs the assertion nothing.
 */
export async function ambientCeiling(page: Page, canvas: Locator): Promise<number> {
  const samples = await AMBIENT_SPANS.reduce<Promise<readonly number[]>>(
    (chain, span) =>
      chain.then(async (acc) => {
        const before = await frameFingerprint(canvas);
        await waitFrames(page, span);
        return [...acc, fingerprintDelta(before, await frameFingerprint(canvas))];
      }),
    Promise.resolve([]),
  );
  return Math.max(...samples);
}

/** Wait N real browser frames — an rAF event condition, never a wall-clock sleep. */
export function waitFrames(page: Page, frames: number): Promise<void> {
  return page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        let i = 0;
        const step = (): void => {
          i += 1;
          if (i >= n) {
            resolve();
          } else {
            requestAnimationFrame(step);
          }
        };
        requestAnimationFrame(step);
      }),
    frames,
  );
}

/** The centre of a locator's box, in page coordinates (where `touchDrag` aims). */
export async function boxCentre(locator: Locator): Promise<WeavePoint> {
  const box = await locator.boundingBox();
  return { x: (box?.x ?? 0) + (box?.width ?? 0) / 2, y: (box?.y ?? 0) + (box?.height ?? 0) / 2 };
}
