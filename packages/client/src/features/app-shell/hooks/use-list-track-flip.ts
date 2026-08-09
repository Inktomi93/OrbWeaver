// useListTrackFlip — the JS half of the shell's FLIP panel motion (shell.css, "THE PANEL PUSH IS A
// FLIP"). It owns exactly one fact: the commit that just landed CHANGED the LIST grid track's width, and
// in which direction. CSS owns everything else — the distance is `--panel-w`, the duration/curve are the
// shared `--shell-motion`/`--shell-ease` co-motion vars, the keyframes are in shell.css. This is the
// data-attribute grammar the motion guide mandates (§1.5: no React animation hook; Base UI drives its own
// enter/exit the same way with `data-starting-style`).
//
// WHY AN ATTRIBUTE AND NOT THE MODE ITSELF: keying the keyframes off `data-list-mode` would replay the
// entrance on FIRST PAINT, because the rule matches from the very first style resolution — motion the
// user did not cause (guide §3.8). `data-list-flip` is absent until a mode change actually happens, so a
// page load is still.
//
// WHY `useLayoutEffect`: the whole mechanism is that the counter-translate lands in the SAME frame as the
// layout change it cancels. A passive `useEffect` runs after paint, so the browser would paint one frame
// with the content already jumped — which is precisely the layout shift this exists to erase, plus a
// visible double-move. This is the same hide-coupled-DOM-work rule UI-Architecture §4a states for
// `<Activity>`.
//
// SHELL-TIER: `no-effect-on-shared-selection` bans effects keyed on shared selection in `features/**`;
// app-shell is the shell tier and is exempt for exactly this class of layout/appearance root effect.

import type { RefObject } from "react";
import { useLayoutEffect, useRef } from "react";
import type { PanelMode } from "#state";

/** The stamped attribute; `in` = the track opened (content pushed right), `out` = it closed. */
const FLIP_ATTR = "data-list-flip";

/** Only a DOCKED list occupies a grid track — `overlay` and `collapsed` both leave it at 0, so flipping
 *  between those two moves no content and must not animate. */
function occupiesTrack(mode: PanelMode): boolean {
  return mode === "docked";
}

/** Stamp the flip direction on the shell grid whenever the LIST track's width changes. No-op on the
 *  first commit (nothing to have moved from) and on any mode change that leaves the track where it was. */
export function useListTrackFlip(gridRef: RefObject<HTMLDivElement | null>, listMode: PanelMode): void {
  // `null` = no commit has been observed yet, which is what makes the first paint still.
  const previous = useRef<boolean | null>(null);
  useLayoutEffect(() => {
    const docked = occupiesTrack(listMode);
    const was = previous.current;
    previous.current = docked;
    if (was === null || was === docked) {
      return;
    }
    // Setting the attribute is what starts the animation: the rule begins matching in this same style
    // resolution, before the browser paints the new track width.
    gridRef.current?.setAttribute(FLIP_ATTR, docked ? "in" : "out");
  }, [gridRef, listMode]);
}
