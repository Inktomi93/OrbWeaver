// THE SETTINGS CONTENT PANE'S SCROLL-SPY WIRING — the WHEN half of the spy, split out of
// `surfaces/config-content-surface.tsx` when that file crossed the 450-line component-size cap (#1632
// train 81). Nothing here changed behaviour: the effect body is verbatim, its one dependency
// (`activeGroup`) is unchanged, and both refs are still minted exactly once per pane.
//
// WHY IT LANDED IN `hooks/` AND NOT IN `lib/config-scroll-spy.ts`, which is where the name points.
// That file's own header records the split this extraction had to preserve: "The host owns the WHEN
// (which listener, which suppression window — `config-jump.ts`); this file owns the WHAT: where the
// reader is, how a jumped-to section announces itself, and the one-frame wait every scroll here needs."
// Folding three observers, an rAF loop and a suppression handshake into that module would have made it
// own both halves and quietly retired a recorded ruling to satisfy a line count. So the WHAT stays pure
// and importable, and the WHEN becomes a hook — which is what it always was, minus a home.
//
// THE HOOK MINTS THE TWO REFS RATHER THAN TAKING THEM, and that is not a stylistic call: a ref read as
// `X.current` inside an effect is only provably stable to `useExhaustiveDependencies` when the ref was
// created in the same component, so a parameter-taking spelling is RED under biome and the only way past
// it is a suppression — the escape hatch that is banned outright. Minting them here is also the truer
// shape: the scroller and its suppression window are the spy's own instrumentation, and the pane borrows
// them back for the JSX `ref` and for `config-jump.ts`'s two verbs, which already take both as arguments.

import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import type { ConfigGroupId } from "#state";
import { configAnchorId, setActiveConfigSub } from "#state";
import { computeActiveSub, computeVisibleSettings } from "../lib/config-scroll-spy.ts";

/** How many frames the initial pass will wait for the group's anchors to mount before measuring anyway. */
const MAX_ANCHOR_POLL_FRAMES = 20;

/**
 * THE SPY, keyed on the active group: the section crossing the spy line lights the LIST row.
 *
 * @param activeGroup - the open group, or `null` — the spy's ONE dependency, so a group switch tears the
 *   observers down and rebuilds them against the new anchor prefix.
 * @returns the pane's scroller ref (for the JSX `ref` and every measurement) and the programmatic-jump
 *   suppression window (`config-jump.ts` owns when it opens and closes; a ref, never state, because a
 *   jump must not re-render the pane to silence a listener).
 */
export function useConfigScrollSpy(activeGroup: ConfigGroupId | null): {
  readonly contentRef: RefObject<HTMLDivElement | null>;
  readonly suppressSpyRef: RefObject<boolean>;
} {
  const contentRef = useRef<HTMLDivElement>(null);
  const suppressSpyRef = useRef(false);

  useEffect(() => {
    const container = contentRef.current;
    if (container === null || activeGroup === null) {
      return;
    }
    const prefix = configAnchorId(activeGroup, "");
    let ticking = false;
    let waited = false;
    let tick = 0;
    // ONE PASS, TWO READINGS (#926 contract 4): the section crossing the spy line lights the LIST row, and
    // the rows intersecting the pane's box ARE the teacher's roster. Deriving them from a second observer
    // would let the pane and the LIST disagree about where the reader is by exactly one frame.
    const computeActive = (writeSub: boolean): void => {
      const sub = computeActiveSub(container, prefix);
      // ONE STORE WRITE for one measurement (the store's own tri-state doc carries the argument contract):
      // `undefined` leaves the section alone — either because the pass measured none, or because this tick
      // waited out a jump and the section the jump NAMED outranks the spy's guess (see `waited` below).
      setActiveConfigSub(writeSub && sub !== null ? sub : undefined, computeVisibleSettings(container, prefix));
    };
    // ONE rAF-COALESCED ENTRY POINT for all three triggers below, so a burst (a section resolving while the
    // reader scrolls) still costs one measurement per frame and the teacher cannot flicker per pixel.
    //
    // A SUPPRESSED REQUEST IS HELD, NEVER DROPPED, and that is the whole reason this is a loop (#926,
    // MEASURED as an empty roster in the CT): a jump suppresses the spy for up to `SPY_REARM_FALLBACK_MS`
    // (`config-jump.ts`) and the group's rows mount during exactly that window, so every mutation burst the
    // roster needs lands while suppressed — and after the jump re-arms, nothing fires again until the reader
    // happens to scroll. The LIST's row survived this only because `selectConfigGroup` names its first
    // section outright. Re-queueing on the next frame keeps the mid-flight frames out (which is what
    // suppression is for) while guaranteeing exactly one measurement the moment the jump settles.
    const run = (): void => {
      if (suppressSpyRef.current) {
        waited = true;
        tick = requestAnimationFrame(run);
        return;
      }
      ticking = false;
      // A TICK THAT WAITED OUT A JUMP MEASURES THE ROSTER ONLY. The jump NAMED the section the reader asked
      // for, and re-deriving it from the settled geometry overwrites that answer with the spy's own guess:
      // MEASURED (config-content-surface.ct "a distant section-row click lands on the target") — landing
      // "Effects" scrolls it to the top, which for the last-but-one section is also the scroller's BOTTOM,
      // and `computeActiveSub`'s at-bottom arm then lights "Library". The LIST would lie about where the
      // click just took you. The roster has no such authority to overwrite: nothing else declares it, and
      // what it reports is a pure fact about the settled viewport.
      computeActive(!waited);
      waited = false;
    };
    const schedule = (): void => {
      if (ticking) {
        return;
      }
      ticking = true;
      tick = requestAnimationFrame(run);
    };
    container.addEventListener("scroll", schedule, { passive: true });
    // A SCROLL LISTENER ALONE IS BLIND TO THE TWO OTHER WAYS THE VISIBLE SET CHANGES (#926), and they need
    // DIFFERENT observers because they are different facts:
    //  · the pane RESIZES — the owner's ruling is explicit that the roster's COUNT tracks the viewport, and
    //    a taller pane shows more rows at the same scrollTop. That is the scroller's own box ⇒ ResizeObserver.
    //  · the BODY CHANGES under a still scroller — a section's suspense resolving, the advanced fold opening,
    //    a dependent row appearing. MEASURED (#926 CT, first spelling): a `ResizeObserver` on the scroller
    //    does NOT fire for this, because the scroller is `h-full` and its own box never moves while
    //    scrollHeight grows — the roster stayed EMPTY until the reader's first scroll. So the mutation is
    //    watched as a mutation.
    // Neither is a second INTERSECTION observer: the viewport measurement itself is still the one spy pass.
    const resize = new ResizeObserver(schedule);
    resize.observe(container);
    const mutations = new MutationObserver(schedule);
    mutations.observe(container, { childList: true, subtree: true });
    let attempts = 0;
    let raf = 0;
    const initialCompute = (): void => {
      if (container.querySelector(`[id^="${prefix}"]`) === null && attempts++ < MAX_ANCHOR_POLL_FRAMES) {
        raf = requestAnimationFrame(initialCompute);
        return;
      }
      if (!suppressSpyRef.current) {
        computeActive(true);
      }
    };
    raf = requestAnimationFrame(initialCompute);
    return (): void => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(tick);
      resize.disconnect();
      mutations.disconnect();
      container.removeEventListener("scroll", schedule);
    };
  }, [activeGroup]);

  return { contentRef, suppressSpyRef };
}
