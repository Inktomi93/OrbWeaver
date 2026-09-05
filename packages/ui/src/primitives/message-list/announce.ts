// WHAT A VIRTUALIZED LOG ANNOUNCES — the message list's live-region rule, split out of message-list.tsx
// to keep the primitive under the 450-line cap (UI-Primitives-and-Reuse.md §13.7), like list-window.ts.
//
// The list is a `role="log"` and does NOT become a `feed` or a `grid`: `feed` has no live region (the
// streaming tail needs one) and `grid` promises tabular two-axis navigation this surface does not have.
// Roving tabindex is a focus-order technique, not a role.
//
// BUT `role="log"` carries an IMPLICIT `aria-live="polite"`, and the element carrying it is the SCROLL
// CONTAINER of a virtualizer: scrolling back through history MOUNTS historical rows inside that region,
// and every one of them is an "addition" a screen reader then reads out as newly-arrived content. A
// reader paging back through a long thread was read the whole thread at it (#1499).
//
// So the container declares `aria-live="off"` EXPLICITLY (the implicit politeness of `role="log"` cannot
// be dropped by omission) and the live region moves to the APPEND POINT — the last row. What that buys,
// stated honestly:
//   * the streaming tail (the ghost row) announces as its text grows, which is the one thing the live
//     region exists for and the reason this is a `log` at all;
//   * rows mounted by SCROLLING announce nothing — they are not the tail;
//   * a reader who scrolls away from the tail and back may hear the last message once more, because the
//     tail row is unmounted and remounted by the virtualizer. One row on a deliberate return to the end,
//     not every row on the way there.
// A stable, always-mounted live region is not reachable here: the tail row is virtualized like every
// other row, and the primitive is generic over its item type, so it cannot mirror the tail's text into a
// separate sr-only node.

/** `aria-live` for the row at `index` of a list of `count` items — `"polite"` for the append point (the
 *  tail), `undefined` for every other row (the container is `off`, so absence is silence). */
export function rowLiveness(index: number, count: number): "polite" | undefined {
  return index === count - 1 ? "polite" : undefined;
}
