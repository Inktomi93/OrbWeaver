// The scrollbar's share of the list's port. A scrollbar that takes layout space (a classic one; an overlay one takes none) is
// reserved on both edges, so the rows centre in the scroller's box as they do beside an overlay scrollbar, on the axis of the
// composer the room centres under them. The width the port gives up is published for the arithmetic that places a row by
// hand: the shell's door FLIP subtracts it (`shell/motion.css`).
//
// The reservation is asked of the browser, not of the content: one read with the scrollbar forced on tells whether it takes
// space, so a short thread reserves before its first overflow and no frame paints the rows off the composer's axis when it
// grows. The reservation is `stable`, so overflow never changes the gutter; only the scrollbar's own width can (a zoom, which
// resizes the port). A browser whose scrollbars take no space reads 0, never reserves and publishes nothing.
//
// Run it from a commit, never inside a ResizeObserver delivery: the mark resizes the scroller's own content box, which the
// scroller's observer (`content-growth.ts`) watches, and a resize inside a delivery is reported as a ResizeObserver loop.

/** The custom property on the scroller: the inline px its port gives up to scrollbar gutters. `shell/motion.css` reads this name. */
const GUTTER_PROPERTY = "--orb-message-list-gutter";
/** Present while the browser's scrollbar takes layout space; the scroller's variant then reserves its gutter on both edges. */
const SCROLLBAR_SPACE_ATTRIBUTE = "data-scrollbar-space";

/** Mark a scrollbar that takes space and publish the gutter the port then gives up. The scroller draws no inline border, so its box less its port is the gutter. */
export function updateScrollbarGutter(el: HTMLElement): void {
  // Both reads force a synchronous layout inside the commit; the browser paints neither the forced scrollbar nor the restore.
  const { overflowY } = el.style;
  el.style.overflowY = "scroll";
  const scrollbarTakesSpace = el.offsetWidth > el.clientWidth;
  el.style.overflowY = overflowY;
  el.toggleAttribute(SCROLLBAR_SPACE_ATTRIBUTE, scrollbarTakesSpace);
  const gutterPx = el.offsetWidth - el.clientWidth;
  if (gutterPx === 0) {
    el.style.removeProperty(GUTTER_PROPERTY);
    return;
  }
  const value = `${String(gutterPx)}px`;
  if (el.style.getPropertyValue(GUTTER_PROPERTY) !== value) {
    el.style.setProperty(GUTTER_PROPERTY, value);
  }
}
