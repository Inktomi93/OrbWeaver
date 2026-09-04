// useListTrackFlip — the JS half of the shell's FLIP panel motion (shell.css, "THE PANEL PUSH IS A
// FLIP"). It owns exactly one fact: the commit that just landed CHANGED the LIST grid track's width, and
// in which direction. CSS owns everything else — the distance is `--panel-w`, the duration/curve are the
// shared `--shell-motion`/`--shell-ease` co-motion vars, the keyframes are in shell.css. This is the
// data-attribute grammar the motion guide mandates (§1.5: no React animation hook; Base UI drives its own
// enter/exit the same way with `data-starting-style`).
//
// TWO ARMS, ONE FACT. That fact is stamped either as `data-list-flip` (motion allowed — the animated FLIP)
// or as `data-list-settle` (motion reduced — the same counter-translate for ONE frame, no duration; #262).
// Both cancel the SAME distance on the SAME element; what differs is whether anything interpolates.
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

/** The reduced-motion twin (#262). Same two directions, same distance var, ZERO duration — see the
 *  motion-off arm below and shell.css "THE REDUCED-MOTION SETTLE". */
const SETTLE_ATTR = "data-list-settle";

/** Only a DOCKED list occupies a grid track — `overlay` and `collapsed` both leave it at 0, so flipping
 *  between those two moves no content and must not animate. */
function occupiesTrack(mode: PanelMode): boolean {
  return mode === "docked";
}

/** THE REDUCED-MOTION SETTLE (#262): hold the counter-translate for exactly ONE painted frame, then drop
 *  it. Returns the effect cleanup — cancelling the pending release AND clearing the attribute, so a second
 *  toggle inside those two frames re-stamps from scratch (both happen before that commit paints, so the
 *  hand-off is invisible) and an unmount leaves no translate behind.
 *
 *  WHY TWO rAFs: one is not guaranteed to survive a paint. The caller runs inside the click's own task,
 *  BEFORE that frame's rendering steps, so a callback registered there runs in THAT frame — cancelling the
 *  translate before it was ever painted, which is byte-identical to not settling at all. The second hop
 *  lands in the following frame's rendering steps, so exactly one painted frame carries the hold. */
function settleWithoutMotion(grid: HTMLDivElement, docked: boolean): () => void {
  grid.setAttribute(SETTLE_ATTR, docked ? "in" : "out");
  let inner = 0;
  const outer = requestAnimationFrame(() => {
    inner = requestAnimationFrame(() => {
      grid.removeAttribute(SETTLE_ATTR);
    });
  });
  return (): void => {
    cancelAnimationFrame(outer);
    cancelAnimationFrame(inner);
    grid.removeAttribute(SETTLE_ATTR);
  };
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
    const grid = gridRef.current;
    // `was === null` is the first commit (nothing to have moved from); `was === docked` is a mode change
    // that left the track where it was. Named rather than early-returned so this effect has ONE exit — the
    // reduced-motion arm below hands back a cleanup, and a mixed implicit/explicit return is a tsc error.
    const trackMoved = was !== null && was !== docked && grid !== null;
    let release: (() => void) | undefined;
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
    // for the users who have asked not to be animated at. That ruling STANDS — no FLIP is armed here, and
    // re-arming one under reduced motion is the thing this file exists to refuse.
    //
    // ITS SECOND HALF DOES NOT (#262). "Correct pixels beat a clean metric" is how that trade was recorded
    // here; the raw shift it accepted was then measured, and it is 2.3x the CWV budget on exactly the users
    // the #151 fix was made for. Merged tree 2026-08-19, the former perf meter's `--goto <section>`
    // (reports/perf-meter/scls-*): presets 0.2032 · characters 0.2333 · corpus 0.2295 with the app's
    // reduced-motion setting on, against 0.0112 · 0.0038 · 0 with motion on, and analytics — the one section
    // whose swap moves no LIST track — 0 on both. One entry, one source node: `div.shell-main`, x 56 -> 363.
    //
    // THE SETTLE IS NOT A FLIP, AND IT IS NOT MOTION. It stamps the same counter-translate — same
    // `--list-track-docked` distance, same element — with NO duration, NO easing and NO animation object
    // (which is what kept the #151 pending-animation hold from coming back: there is nothing to be pending),
    // then drops it. `.shell-main` therefore paints its OLD column for exactly one frame and its new one
    // ever after: a single instant cut, one frame later than before, with nothing in between to perceive as
    // movement. The browser scores it at zero because the held frame's visual start position is UNCHANGED
    // and the release is a transform change, which is not layout instability (the same physics the FLIP
    // rides, probed with a positive control in shell.css).
    //
    // The mechanism (one painted frame, two rAFs, why) is `settleWithoutMotion`'s own docblock.
    if (trackMoved && motionIsReduced()) {
      release = settleWithoutMotion(grid, docked);
    } else if (trackMoved) {
      // Setting the attribute is what starts the animation: the rule begins matching in this same style
      // resolution, before the browser paints the new track width.
      grid.setAttribute(FLIP_ATTR, docked ? "in" : "out");
    }
    return release;
  }, [gridRef, listMode]);
}
