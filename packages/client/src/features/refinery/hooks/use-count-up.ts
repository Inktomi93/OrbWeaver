// `useCountUp` — the hero gauge's settle animation (side-eye 2026-08-09 polish item 5, "the money
// shot"): when a run's overall score lands, the numeral counts 0 → score while the Meter sweeps to the
// same figure off the SAME value, so the two never disagree by a frame.
//
// WHY A HOOK AND NOT CSS. This is the one motion in the feature CSS genuinely cannot express: the
// animated thing is TEXT CONTENT, not a style property. `@property`/`counter()` can animate a number in
// a pseudo-element's `content`, but the result is unselectable, invisible to the accessibility tree,
// and cannot share a value with the Meter — so the figure and the bar would drift. The guide's "100% of
// animation happens in CSS" (§1.5) is about STYLE animation; a counted value has no style to key off.
//
// COMPOSITOR COST: none. Nothing here animates a style property at all — no layout, no paint beyond the
// glyph raster the number would have caused anyway. The `hero` voice is `tabular-nums` precisely so the
// ticking digits do not reflow the figure's width (which WOULD be a per-frame layout).
//
// REDUCED MOTION IS REMOVE, NOT SHORTEN (guide §3.9): under the preference the hook is a pure
// passthrough — the final value renders on the first frame, with no ramp and no intermediate state.
// Same posture as `useSmoothText` and `useEnterMotion`.
//
// RE-ENTRANCY: the ramp is keyed on the TARGET. A second run landing mid-ramp retargets from wherever
// the count currently is rather than restarting at zero (guide §3.2, interruptibility) — a re-run that
// snapped back to 0 would read as "the previous result was discarded", which is not what happened.

import { usePrefersReducedMotion } from "@orb/ui/lib";
import { useEffect, useRef, useState } from "react";

/** The ramp's duration. Deliberately inside the `--motion-layout` band (360ms) rather than a fourth
 *  duration token (guide §4.3): a count-up is a layout-scale settle, and the guide bans inventing a new
 *  step. Not read from CSS because this is a JS ramp, not a CSS transition — the number is the contract. */
const COUNT_UP_MS = 360;

/** The ease curve's exponent. Cubic is the house programmatic ease-out shape; a higher power would
 *  front-load the ramp so hard the count reads as an instant jump with a tail. */
const EASE_POWER = 3;

/** Ease-out (cubic) — the JS twin of `--ease-out-expo`'s intent: fast start, settled landing, no
 *  overshoot. A linear count reads mechanical; a bouncing one reads try-hard (guide §4.3). */
function easeOut(t: number): number {
  return 1 - (1 - t) ** EASE_POWER;
}

/** Decimal places in the TARGET, so the ramp lands on the target's own precision. Load-bearing: refinery
 *  scores are fractional (`overallScore: 7.5`), and rounding every frame to an integer would have made
 *  the count settle on **8** — the animation silently changing the number it animates to. Caught by the
 *  existing payload-view CT's `7.5/10` assertion; capped so a float artefact (0.30000000000000004) can
 *  never ask for 17 digits. */
const MAX_RAMP_DECIMALS = 2;
function decimalsOf(value: number): number {
  const fraction = String(value).split(".")[1];
  return fraction === undefined ? 0 : Math.min(fraction.length, MAX_RAMP_DECIMALS);
}

/** Round to `places`, then strip float noise — `Number(x.toFixed(n))` is exact for the 0-2 places here. */
function quantize(value: number, places: number): number {
  return Number(value.toFixed(places));
}

/**
 * The value to PRINT for a settling figure. Returns `target` immediately (no ramp) when `target` is
 * null, when the user prefers reduced motion, or on the very first value the hook ever sees — a number
 * that was already on screen when the surface mounted did not just "arrive", and animating it would be
 * motion the user did not cause (guide §3.8).
 */
export function useCountUp(target: number | null): number {
  const reducedMotion = usePrefersReducedMotion();
  const [shown, setShown] = useState(target ?? 0);
  // The last value we PRINTED, read inside the rAF loop without re-arming the effect on every frame.
  const shownRef = useRef(shown);
  shownRef.current = shown;
  // First landed value is not an arrival — see the doc comment.
  const seenRef = useRef(target !== null);

  useEffect(() => {
    if (target === null) {
      return;
    }
    const from = shownRef.current;
    if (reducedMotion || !seenRef.current || from === target) {
      seenRef.current = true;
      setShown(target);
      return;
    }
    const places = decimalsOf(target);
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now: number): void {
      const t = Math.min(1, (now - start) / COUNT_UP_MS);
      // The final frame sets the TARGET itself, never a quantized approximation of it — the printed
      // figure must be byte-identical to the value the Meter and the wire carry.
      setShown(t < 1 ? quantize(from + (target - from) * easeOut(t), places) : target);
      if (t < 1) {
        frame = requestAnimationFrame(step);
      }
    });
    return (): void => cancelAnimationFrame(frame);
  }, [target, reducedMotion]);

  return target === null ? 0 : shown;
}
