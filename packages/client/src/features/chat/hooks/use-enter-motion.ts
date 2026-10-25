// `useEnterMotion` — the list-item ENTER transition for a genuinely-new chat row. Entrance is
// BUILT, exit is decided-against: a virtualized row has no honest unmount phase to animate.
// The rAF-flip pattern, adapted for the WINDOWED message list: the decision of
// whether this mount is an arrival is NOT made here (a virtualized row mounts on every scrollback) —
// the surface makes it in item space (`useNewArrivalKeys`, use-message-items.ts) and passes the
// verdict down as `enter`. This hook only executes it: mount in the "from" state (transparent, 4px
// low), flip to resting on the next frame so the transition has something to interpolate from.
//
// The flag is LATCHED at mount (`useState` initializer): the surface clears its fresh set right
// after the arrival commit, so later prop flips must not restart — and a scrollback remount gets
// `enter=false` and renders resting with NO transition classes at all.
//
// Reduced motion is REMOVE, not shorten: under `prefers-reduced-motion` the latch never
// arms, so the row renders resting from its first frame — no hidden frame, no fast fade. (The manual
// appearance.reducedMotion toggle rides the globals.css `[data-appearance-reduced-motion]` transition-duration
// floor, same as every other transition in the app.)
//
// The two states are the `Stack arrival` prop (`ARRIVAL` in `@orb/ui`): compositor properties only, on the house
// programmatic-motion pair.

import { usePrefersReducedMotion } from "@orb/ui/lib";
import { useEffect, useState } from "react";

/** The row's `arrival` state — absent unless this mount is a genuine arrival. */
export function useEnterMotion(enter: boolean): "from" | "settle" | undefined {
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
    return;
  }
  return entered ? "settle" : "from";
}
