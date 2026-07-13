// `useEnterMotion` — the list-item ENTER transition for a genuinely-new chat row (motion guide §4.2
// item 1). The guide's rAF-flip pattern, adapted for the WINDOWED message list: the decision of
// whether this mount is an arrival is NOT made here (a virtualized row mounts on every scrollback) —
// the surface makes it in item space (`useNewArrivalKeys`, use-message-items.ts) and passes the
// verdict down as `enter`. This hook only executes it: mount in the "from" state (transparent, 4px
// low), flip to resting on the next frame so the transition has something to interpolate from.
//
// The flag is LATCHED at mount (`useState` initializer): the surface clears its fresh set right
// after the arrival commit, so later prop flips must not restart — and a scrollback remount gets
// `enter=false` and renders resting with NO transition classes at all.
//
// Reduced motion is REMOVE, not shorten (guide §3.9): under `prefers-reduced-motion` the latch never
// arms, so the row renders resting from its first frame — no hidden frame, no fast fade. (The manual
// appearance.reducedMotion toggle rides the globals.css `[data-reduced-motion]` transition-duration
// floor, same as every other transition in the app.)
//
// Compositor-only (guide §3.7): `opacity` + the Tailwind v4 standalone `translate` property — the
// transition must NAME `translate` (the button primitive's `scale` precedent; `transform` would not
// animate it). `--motion-base` + `ease-out-expo`, the house programmatic-motion pair — no bounce.

import { usePrefersReducedMotion } from "@orb/ui/lib";
import { useEffect, useState } from "react";

const ENTER_TRANSITION = "transition-[opacity,translate] duration-(--motion-base) ease-out-expo";
const ENTER_FROM = `${ENTER_TRANSITION} opacity-0 translate-y-1`;

/** Class fragment for a row's enter transition — `""` unless this mount is a genuine arrival. */
export function useEnterMotion(enter: boolean): string {
  const reducedMotion = usePrefersReducedMotion();
  // Mount-latched: only the FIRST render's verdict counts (see the header note).
  const [animate] = useState(enter && !reducedMotion);
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!animate) {
      return;
    }
    // One rAF after the "from" frame paints — the flip the transition interpolates across.
    const frame = requestAnimationFrame(() => setEntered(true));
    return (): void => cancelAnimationFrame(frame);
  }, [animate]);
  if (!animate) {
    return "";
  }
  return entered ? ENTER_TRANSITION : ENTER_FROM;
}
