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
import { motionIsReduced } from "#lib";
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
    // NO FLIP WHEN THE USER ASKED FOR NO MOTION (#151, measured per-frame on the live shell 2026-08-18 and
    // pinned by the CT beside this file's own). The reduced-motion CSS floor (@orb/ui globals.css) collapses
    // every `animation-duration` to 0.01ms — which does NOT make this animation instant. Chrome starts a
    // freshly-stamped animation PENDING, holding its `from` corner for one to two frames before the first
    // sample: measured `animation currentTime 0` across two consecutive rAFs with the grid still laid out at
    // the OLD track, so `.shell-main` — topbar and header band included — painted a full `--panel-w` out of
    // place (x 56 → -290 → 402 docking, 402 → 747 → 56 collapsing) and snapped back. A translate records no
    // layout-shift, so CLS read 0.0000 through the whole thing: the owner's "weird glitch where the home
    // header is and where the chats header with the count appears", CLS-invisible, worse with reduced motion
    // on — because reduced motion is the arm where it happens at all.
    //
    // A FLIP is a MOTION mechanism: it exists to make an instant layout change LOOK continuous. With motion
    // off there is nothing to make continuous, so the track just resizes — one frame, in place. That trades
    // the FLIP's zero-recorded-shift property for a real (single, expected) layout shift on this one toggle,
    // for the users who have asked not to be animated at. Correct pixels beat a clean metric.
    if (motionIsReduced()) {
      return;
    }
    // Setting the attribute is what starts the animation: the rule begins matching in this same style
    // resolution, before the browser paints the new track width.
    gridRef.current?.setAttribute(FLIP_ATTR, docked ? "in" : "out");
  }, [gridRef, listMode]);
}
