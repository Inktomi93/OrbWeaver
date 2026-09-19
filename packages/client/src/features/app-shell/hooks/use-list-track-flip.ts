// useShellTrackFlip — the JS half of the shell's FLIP panel motion (shell.css, "THE PANEL PUSH IS A
// FLIP"). It owns exactly one fact per TRACK: the commit that just landed changed that grid track's
// width, and in which direction. CSS owns everything else — the distances are `--list-*`/`--context-*`
// vars, the duration/curve are the shared `--shell-motion`/`--shell-ease` co-motion vars, the keyframes
// are in shell.css. This is the data-attribute grammar the motion guide mandates (§1.5: no React
// animation hook; Base UI drives its own enter/exit the same way with `data-starting-style`).
//
// THE FILE NAME IS `use-list-track-flip.ts` AND THE HOOK IS NOT LIST-ONLY (#2456). The motion law cites
// this PATH as one of the two members of its §1.5 FLIP-inversion exception class
// (`docs/architecture/core/motion-and-animation-guide.md`), and a rename is a law-doc edit — so the
// second track arrived as a second argument here rather than as a THIRD exception-class member, which is
// what a sibling `use-panel-track-flip.ts` would have been (§1.5 says in as many words: "Anything else
// that reaches for JS to move pixels is a defect, not a third member"). One hook is also the only shape
// that can work: the two tracks share ONE restart, ONE release and ONE composed distance per element.
//
// TWO TRACKS, TWO ARMS, ONE STAMP. Each track's fact is stamped either as `data-<track>-flip` (motion
// allowed — the animated FLIP) or as `data-<track>-settle` (motion reduced — the same counter-translate
// for ONE frame, no duration; #262). Both cancel the SAME distances on the SAME elements; what differs is
// whether anything interpolates. shell.css turns either attribute into the same `--<track>-flip-dir`
// sign, so no distance is spelled twice.
//
// THE ATTRIBUTES ARE TRANSIENT, AND THAT IS A REQUIREMENT, NOT TIDINESS (#2449 -> #2456). The LIST arm
// used to SET `data-list-flip` and never remove it, which was invisible while it was the only track:
// a second `animation` rule keyed on a permanently-present second attribute wins the cascade forever and
// `animation` does not compose across rules, so the context track's FLIP silently DELETED the list
// track's (measured: after any context flip, list-undock cut 440 -> 56 in one frame instead of gliding
// over 13). The grammar below releases every flip attribute on `animationend`, so the resting DOM carries
// no motion attribute at all.
//
// …AND A MID-ANIMATION SECOND TOGGLE RESTARTS EXPLICITLY. With one animation NAME per element there is no
// longer a name change to restart on: setting `data-list-flip` from `in` to `out` re-runs nothing, and
// stamping `data-context-flip` beside a live `data-list-flip` re-runs nothing either — the element's
// animation keeps its original `from` corner and the new track's contribution never appears. A CSS
// animation (re)starts only when its selector transitions from not-matching to matching, so `restart`
// below removes every flip attribute, forces ONE style read, and re-stamps. The forced read happens ONLY
// on that path: on the ordinary first toggle nothing is live and nothing is flushed, which is what keeps
// the #151 corridor intact (forcing a layout in this effect unconditionally was a measured WRONG fix —
// app-shell.ct.tsx says so beside its corridor arm).
//
// WHY AN ATTRIBUTE AND NOT THE MODE ITSELF: keying the keyframes off `data-list-mode` would replay the
// entrance on FIRST PAINT, because the rule matches from the very first style resolution — motion the
// user did not cause (guide §3.8). A flip attribute is absent until a mode change actually happens, so a
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
import type { PanelMode, PanelName } from "#state";

/** The two attribute names each track owns. A mapped `Record` over `PanelName`, so the day a third shell
 *  track exists this is a tsc error rather than a forgotten string (constitution §5.5). `in` = the track
 *  opened (content pushed), `out` = it closed.
 *
 *  `as const satisfies` RATHER THAN AN ANNOTATION, and that is the gate's requirement rather than style:
 *  `css-selector-has-a-writer` resolves a `setAttribute` name through the value's LITERAL TYPE, so an
 *  annotation that widens these to `string` leaves every `[data-*-flip]` selector in shell.css looking
 *  like an authored hook nobody writes. `satisfies` keeps the exhaustiveness check and the literals. */
const TRACK_ATTRS = {
  list: { flip: "data-list-flip", settle: "data-list-settle" },
  context: { flip: "data-context-flip", settle: "data-context-settle" },
} as const satisfies Record<PanelName, { readonly flip: string; readonly settle: string }>;

/** Run `visit` over BOTH tracks — the ONE spelling of "both", so no caller below enumerates them again. */
function eachTrack(visit: (track: PanelName) => void): void {
  visit("list");
  visit("context");
}

/** The keyframe names shell.css arms on a track flip. The release below listens for the END of one of
 *  THESE — an `animationend` bubbling up from anything else inside the shell (a shimmer, a toast) must
 *  never drop a live FLIP. This is the JS half of a JS↔CSS name coupling and this Set is its one home;
 *  `app-shell.ct.tsx` pins that the attribute is actually released after a real toggle, so a renamed
 *  keyframe reds a test instead of silently pinning the attribute forever. */
const SHELL_FLIP_ANIMATIONS = new Set(["shell-main-flip", "shell-trail-flip", "shell-centre-flip", "shell-list-panel-flip", "shell-context-panel-flip"]);

/** Only a DOCKED panel occupies a grid track — `overlay` and `collapsed` both leave it at 0, so flipping
 *  between those two moves no content and must not animate. */
function occupiesTrack(mode: PanelMode): boolean {
  return mode === "docked";
}

/** Is `animation` one of the shell's own track FLIPs? `CSSAnimation` is the only `Animation` subclass
 *  that carries an `animationName`, which is what makes this question answerable at all. */
function isShellFlip(animation: Animation): boolean {
  return animation instanceof CSSAnimation && SHELL_FLIP_ANIMATIONS.has(animation.animationName);
}

/** THE REDUCED-MOTION SETTLE (#262): hold the counter-translate for exactly ONE painted frame, then drop
 *  it. Returns the release — cancelling the pending drop AND clearing the attributes, so a second toggle
 *  inside those two frames re-stamps from scratch (both happen before that commit paints, so the hand-off
 *  is invisible).
 *
 *  WHY TWO rAFs: one is not guaranteed to survive a paint. The caller runs inside the click's own task,
 *  BEFORE that frame's rendering steps, so a callback registered there runs in THAT frame — cancelling the
 *  translate before it was ever painted, which is byte-identical to not settling at all. The second hop
 *  lands in the following frame's rendering steps, so exactly one painted frame carries the hold. */
function settleWithoutMotion(grid: HTMLDivElement, direction: Partial<Record<PanelName, "in" | "out">>): () => void {
  eachTrack((track) => {
    const value = direction[track];
    if (value !== undefined) {
      grid.setAttribute(TRACK_ATTRS[track].settle, value);
    }
  });
  let inner = 0;
  const clear = (): void => {
    eachTrack((track) => grid.removeAttribute(TRACK_ATTRS[track].settle));
  };
  const outer = requestAnimationFrame(() => {
    inner = requestAnimationFrame(clear);
  });
  return (): void => {
    cancelAnimationFrame(outer);
    cancelAnimationFrame(inner);
    clear();
  };
}

/** Arm the animated FLIP for the tracks that moved, and hand back the release that drops the attributes.
 *  The release fires on the first `animationend` of one of the shell's own FLIP keyframes — every element
 *  this arms starts in the SAME style resolution and shares `--shell-motion`, so they finish together and
 *  one end is the end of all of them (that co-motion invariant is shell.css's own, asserted by the
 *  "co-motion parity" CT).
 *
 *  THE NO-ANIMATION ARM IS SYNCHRONOUS, not a frame hop and not a timeout: the phone block cancels every
 *  FLIP rule (`animation: none`), so on a phone nothing starts, no `animationend` ever fires, and the
 *  attribute would otherwise sit on the grid until the next toggle — which is the exact state #2456
 *  exists to abolish. `getAnimations()` flushes pending STYLE (never layout — the #151 wrong fix forced
 *  layout here and made `.shell-main` jolt for two frames; app-shell.ct.tsx's corridor arm still watches
 *  for it), which is the same recalculation the animation's own creation needs, so asking immediately is
 *  both cheap and conclusive. It also costs no `requestAnimationFrame`: the shell's rAF budget is
 *  observed elsewhere (`use-command-shortcut.ts`'s own pending-frame CT counts every request in the
 *  document), so a frame hop here would be a shell-wide side effect for a phone-only tidy-up. */
function flipWithMotion(grid: HTMLDivElement, direction: Partial<Record<PanelName, "in" | "out">>): () => void {
  eachTrack((track) => {
    const value = direction[track];
    if (value !== undefined) {
      grid.setAttribute(TRACK_ATTRS[track].flip, value);
    }
  });
  const release = (): void => {
    grid.removeEventListener("animationend", onEnd);
    eachTrack((track) => grid.removeAttribute(TRACK_ATTRS[track].flip));
  };
  function onEnd(event: AnimationEvent): void {
    if (SHELL_FLIP_ANIMATIONS.has(event.animationName)) {
      release();
    }
  }
  grid.addEventListener("animationend", onEnd);
  if (!grid.getAnimations({ subtree: true }).some(isShellFlip)) {
    release();
  }
  return release;
}

/** Stamp the flip direction on the shell grid whenever EITHER track's width changes. No-op on the first
 *  commit (nothing to have moved from) and on any mode change that leaves both tracks where they were. */
export function useShellTrackFlip(gridRef: RefObject<HTMLDivElement | null>, listMode: PanelMode, contextMode: PanelMode): void {
  // `null` = no commit has been observed yet, which is what makes the first paint still.
  const previous = useRef<Record<PanelName, boolean> | null>(null);
  // THE LIVE FLIP'S RELEASE, HELD ACROSS COMMITS — not an effect cleanup, deliberately. React runs a
  // cleanup and the next effect in the same task, so releasing there would remove the attributes a beat
  // before this effect re-adds them and the browser would never observe the stop: the animation would
  // carry on with its OLD `from` corner and the second toggle would look frozen. Holding the release here
  // lets the restart below drop the attributes AND flush style before re-stamping. Written and read only
  // from effects/handlers (never during render — `react-hooks/refs`).
  const live = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    const docked: Record<PanelName, boolean> = { list: occupiesTrack(listMode), context: occupiesTrack(contextMode) };
    const was = previous.current;
    previous.current = docked;
    const grid = gridRef.current;
    if (was === null || grid === null) {
      return;
    }
    // `was === null` is the first commit (nothing to have moved from); an unchanged flag is a mode change
    // that left that track where it was (docked ⇄ overlay moves no content).
    const direction: Partial<Record<PanelName, "in" | "out">> = {};
    eachTrack((track) => {
      if (was[track] !== docked[track]) {
        direction[track] = docked[track] ? "in" : "out";
      }
    });
    if (direction.list === undefined && direction.context === undefined) {
      return;
    }
    // THE RESTART (see the header): a live flip is STOPPED and the stop is made observable with one forced
    // style read before the new stamp, because a single animation name cannot restart on a value change.
    if (live.current !== null) {
      live.current();
      live.current = null;
      grid.getBoundingClientRect();
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
    // THE SETTLE IS NOT A FLIP, AND IT IS NOT MOTION. It stamps the same counter-translates — same distances,
    // same elements — with NO duration, NO easing and NO animation object (which is what kept the #151
    // pending-animation hold from coming back: there is nothing to be pending), then drops them.
    // `.shell-main` therefore paints its OLD column for exactly one frame and its new one ever after: a
    // single instant cut, one frame later than before, with nothing in between to perceive as movement. The
    // browser scores it at zero because the held frame's visual start position is UNCHANGED and the release
    // is a transform change, which is not layout instability (the same physics the FLIP rides, probed with a
    // positive control in shell.css).
    //
    // The mechanism (one painted frame, two rAFs, why) is `settleWithoutMotion`'s own docblock.
    live.current = motionIsReduced() ? settleWithoutMotion(grid, direction) : flipWithMotion(grid, direction);
  }, [gridRef, listMode, contextMode]);
}
