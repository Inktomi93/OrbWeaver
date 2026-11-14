// The scrollbar's share of the list's port. A scrollbar that takes layout space (a classic one; an overlay one takes none) is
// reserved on both edges once it shows, so the rows centre in the scroller's box as they do beside an overlay scrollbar, on the
// axis of the composer the room centres under them. The width the port gives up is published
// for the arithmetic that places a row by hand: the shell's door FLIP subtracts it (`shell/motion.css`).
//
// The mark follows the measure, so it never toggles with overflow: the both-edges reservation is `stable`, and it keeps the
// gutter while it is on. A browser whose scrollbars take no space measures 0 and never reserves, so it lays out as before.
//
// Run it from a commit, never inside a ResizeObserver delivery: the mark resizes the scroller's own content box, which the
// scroller's observer (`content-growth.ts`) watches, and a resize inside a delivery is reported as a ResizeObserver loop.

/** The custom property on the scroller: the inline px its port gives up to scrollbar gutters. `shell/motion.css` reads this name. */
const GUTTER_PROPERTY = "--orb-message-list-gutter";
/** Present while the scrollbar takes layout space; the scroller's variant then reserves its gutter on both edges. */
const SCROLLBAR_SPACE_ATTRIBUTE = "data-scrollbar-space";

/** Publish the gutter and mark a scrollbar that takes space. The scroller draws no inline border, so its box less its port is the gutter. */
export function updateScrollbarGutter(el: HTMLElement): void {
  const gutterPx = el.offsetWidth - el.clientWidth;
  const value = `${String(gutterPx)}px`;
  if (el.style.getPropertyValue(GUTTER_PROPERTY) !== value) {
    el.style.setProperty(GUTTER_PROPERTY, value);
  }
  el.toggleAttribute(SCROLLBAR_SPACE_ATTRIBUTE, gutterPx > 0);
}
