// A short rail scrolls its sections. This ends the scroller on the middle of a button, so the next section shows half
// clipped at rest, and keeps the current section in view, which nothing else does for a programmatic change.

import { SCROLL_EDGE_EPSILON_PX, syncScrollFade } from "@orb/ui/scroll-area";
import type { RefObject } from "react";
import { useEffect } from "react";

const MAX_SIZE = "max-block-size";
const CURRENT_ATTRIBUTE = "aria-current";

// The scroller holds one wrapper per section group, and each wrapper holds that group's buttons.
function buttonsOf(scroller: HTMLElement): Element[] {
  return Array.from(scroller.children).flatMap((group) => Array.from(group.children));
}

/** The scroller's box ends on the midline of the last button that fits, or stays whole when all fit or one whole button would not. */
function fitSections(scroller: HTMLElement): void {
  // Measuring in the whole box would clamp a scrolled position to the taller box's smaller range.
  const position = scroller.scrollTop;
  scroller.style.removeProperty(MAX_SIZE);
  const room = scroller.clientHeight;
  if (scroller.scrollHeight - room <= SCROLL_EDGE_EPSILON_PX) {
    return;
  }
  const origin = scroller.getBoundingClientRect().top - scroller.scrollTop;
  let cut: number | undefined;
  let fitting = 0;
  for (const button of buttonsOf(scroller)) {
    const { top, height } = button.getBoundingClientRect();
    const middle = top - origin + height / 2;
    if (height > 0 && middle <= room) {
      // The first button's midline would leave less than one whole button on show.
      cut = fitting === 0 ? undefined : middle;
      fitting += 1;
    }
  }
  if (cut !== undefined) {
    scroller.style.setProperty(MAX_SIZE, `${String(Math.floor(cut))}px`);
  }
  scroller.scrollTop = position;
}

/** Scrolls the current section's button, with half a button of its neighbour, into view. */
function revealCurrent(scroller: HTMLElement): void {
  const current = buttonsOf(scroller).find((button) => button.hasAttribute(CURRENT_ATTRIBUTE));
  const view = scroller.clientHeight;
  if (current === undefined || scroller.scrollHeight - view <= SCROLL_EDGE_EPSILON_PX) {
    return;
  }
  const { top, height } = current.getBoundingClientRect();
  const start = top - (scroller.getBoundingClientRect().top - scroller.scrollTop);
  // A view too short for the button and both margins keeps the button and trims the margin.
  const margin = Math.max(0, Math.min(height / 2, (view - height) / 2));
  if (start - margin < scroller.scrollTop) {
    scroller.scrollTop = start - margin;
  } else if (start + height + margin > scroller.scrollTop + view) {
    scroller.scrollTop = start + height + margin - view;
  }
}

/** Fit the section scroller to its room, and keep the current section in view as the layout settles or the section changes. */
export function useRailSectionsFit(scrollerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const scroller = scrollerRef.current;
    const rail = scroller?.parentElement;
    if (!(scroller && rail)) {
      return;
    }
    const resize = new ResizeObserver(() => {
      fitSections(scroller);
      revealCurrent(scroller);
      syncScrollFade(scroller);
    });
    // The spacer grows into whatever the scroller gives up, so watching it would answer the fit with another fit.
    const observeLayout = (): void => {
      resize.disconnect();
      resize.observe(rail);
      for (const sibling of rail.children) {
        if (sibling !== scroller && getComputedStyle(sibling).flexGrow === "0") {
          resize.observe(sibling);
        }
      }
      for (const group of scroller.children) {
        resize.observe(group);
      }
    };
    // Observing again delivers a fresh size, so a new button or a new current button is fitted and revealed as well.
    const layout = new MutationObserver(observeLayout);
    layout.observe(rail, { childList: true });
    layout.observe(scroller, { childList: true, subtree: true, attributes: true, attributeFilter: [CURRENT_ATTRIBUTE] });
    observeLayout();
    return (): void => {
      resize.disconnect();
      layout.disconnect();
      scroller.style.removeProperty(MAX_SIZE);
    };
  }, [scrollerRef]);
}
