// Sideways-reach probes for a scroller that must reflow instead of scrolling sideways. Both functions run in the page
// through `evaluate`, so each stands alone.

/** The nearest ancestor of `origin` that scrolls on the block axis: the pane or transcript a column of content sits in. */
export function nearestScroller(origin: Element): Element {
  for (let up = origin.parentElement; up !== null; up = up.parentElement) {
    if (/auto|scroll/u.test(getComputedStyle(up).overflowY)) {
      return up;
    }
  }
  throw new Error("The subject has no scrolling ancestor");
}

/**
 * The leaf boxes of `list` that run past its inline end, each with the slots it sits in and how far each overshoots, and the scroller's own sideways
 * scroll. A box inside an overflow box (a swipe carousel, a clipped strip) is built to hold its children past the edge, so it
 * is not judged.
 */
export function sidewaysReach(list: Element): { readonly scrolls: number; readonly wideners: string[] } {
  const edge = list.getBoundingClientRect().right;
  const past = (element: Element): boolean => element.getBoundingClientRect().right > edge + 1;
  const inStrip = (element: Element): boolean => {
    for (let up = element.parentElement; up !== null && up !== list; up = up.parentElement) {
      if (/auto|scroll|hidden|clip/u.test(getComputedStyle(up).overflowX)) {
        return true;
      }
    }
    return false;
  };
  const trail = (element: Element): string => {
    const slots: string[] = [];
    for (let up = element.parentElement; up !== null && up !== list && slots.length < 6; up = up.parentElement) {
      const overshoot = Math.round(up.getBoundingClientRect().right - edge);
      slots.push(`${up.getAttribute("data-slot") ?? up.tagName.toLowerCase()}${overshoot > 0 ? `(+${String(overshoot)})` : ""}`);
    }
    return slots.join(" < ");
  };
  return {
    scrolls: list.scrollWidth - list.clientWidth,
    wideners: [...list.querySelectorAll("*")]
      .filter((element) => past(element) && ![...element.children].some(past) && !inStrip(element))
      .map(
        (element) =>
          `${element.tagName.toLowerCase()}[${element.getAttribute("data-slot") ?? ""}] "${element.textContent.slice(0, 20)}" past by ${String(Math.round(element.getBoundingClientRect().right - edge))} in ${trail(element)}`,
      ),
  };
}
