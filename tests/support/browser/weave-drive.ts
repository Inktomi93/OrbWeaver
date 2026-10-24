// CT support for driving + reading the brand weave under a COARSE pointer.
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

import type { Locator } from "@playwright/test";

/** A real finger: touchStart → `steps` touchMoves → touchEnd, through the browser's own input path. */
/** A coarse whole-frame color fingerprint of a weave canvas — any recolor or deformation shifts it. */
export function frameFingerprint(canvas: Locator): Promise<string> {
  return canvas.evaluate((el) => {
    if (!(el instanceof HTMLCanvasElement)) {
      throw new TypeError("frameFingerprint: expected a canvas element");
    }
    const c = el;
    const ctx = c.getContext("2d");
    if (ctx === null) {
      return "no-ctx";
    }
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (const [index, value] of data.entries()) {
      switch (index % 4) {
        case 0:
          r += value;
          break;
        case 1:
          g += value;
          break;
        case 2:
          b += value;
          break;
      }
    }
    return `${r}:${g}:${b}`;
  });
}

/** Exactly two coarse fingerprints captured in ONE browser evaluation. Arity is part of the evidence:
 *  a missing target/reference must refuse rather than collapse into a zero-delta comparison. */
export async function frameFingerprintPair(canvases: Locator): Promise<readonly [string, string]> {
  const frames = await canvases.evaluateAll((elements) =>
    elements.map((el) => {
      if (!(el instanceof HTMLCanvasElement)) {
        throw new TypeError("frameFingerprintPair: expected canvas elements");
      }
      const c = el;
      const ctx = c.getContext("2d");
      if (ctx === null) {
        return "no-ctx";
      }
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let r = 0;
      let g = 0;
      let b = 0;
      for (const [index, value] of data.entries()) {
        switch (index % 4) {
          case 0:
            r += value;
            break;
          case 1:
            g += value;
            break;
          case 2:
            b += value;
            break;
        }
      }
      return `${r}:${g}:${b}`;
    }),
  );
  if (frames.length !== 2 || frames[0] === undefined || frames[1] === undefined) {
    throw new Error(`paired weave fingerprint expected exactly 2 canvases, got ${String(frames.length)}`);
  }
  return [frames[0], frames[1]];
}

/** Channel-sum distance between two `frameFingerprint` readings. */
/** Idle-frame spans the ambient ceiling samples over: several short beats plus one long one. */
/**
 * An upper bound on how far the weave's OWN motion moves the frame while nobody touches it.
 *
 * A single short sample is not a floor, it is a lottery: measured on one settled web, back-to-back
 * two-frame deltas ranged 16k–136k (the glint sweep dominates) while a 30-frame span read 74k. A
 * threshold built on one sample either flakes red or passes a drive that did nothing. So sample
 * repeatedly, across both short and long spans, and take the MAX — a ring is ~1.4M, an order of
 * magnitude clear of the worst ambient beat, so the ceiling costs the assertion nothing.
 */
/** Wait N real browser frames — an rAF event condition, never a wall-clock sleep. */
/** The centre of a locator's box, in page coordinates (where `touchDrag` aims). */
