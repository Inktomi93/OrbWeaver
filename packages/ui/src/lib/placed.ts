/**
 * A box a feature lays out of its parent's flow, by what it is: the one home of `position` with its insets for that box. `pinned` stays at the top of its scrollport and `pinnedEnd` at the foot; every
 * other arm sits in a positioned host. `fill` lies over the whole host, `topBand` across its head, `startEdge` and `endEdge` run its height at one side,
 * `flushStart` and `flushEnd` sit in a block-start corner with no inset, `lineEnd` at the inline end of its line, `startRail` a `row` step outside the
 * start edge, `footBand` across the foot a `block` step up, `cornerStart` a `tight` step in from the block-start, inline-start corner.
 * `outWhileEmpty` keeps a live region mounted while it takes no room.
 */
export const PLACED = {
  fill: "absolute inset-0",
  pinned: "sticky inset-bs-0",
  pinnedEnd: "sticky inset-be-0",
  topBand: "absolute inset-x-0 inset-bs-0",
  startEdge: "absolute inset-y-0 inset-s-0",
  endEdge: "absolute inset-y-0 inset-e-0",
  flushStart: "absolute inset-bs-0 inset-s-0",
  flushEnd: "absolute inset-bs-0 inset-e-0",
  lineEnd: "absolute inset-e-0",
  startRail: "absolute inset-y-tight -inset-s-row",
  footBand: "absolute inset-x-0 inset-be-block",
  cornerStart: "absolute inset-s-tight inset-bs-tight",
  outWhileEmpty: "empty:absolute",
} as const;

// Where a mark sits in its positioned parent's corner. `badge` pins it to the block-start, inline-end corner, the
// place a count, a lock, a close or a selection check rides on a tile or a control; `tight` is the same corner on a
// glyph-sized host, where the mark must stay clear of the glyph.
export const CORNER = {
  badge: "absolute inset-e-field inset-bs-field",
  tight: "absolute inset-e-tight inset-bs-tight",
} as const;

// A row pinned to the foot of a scrolling dialog body: it gives its block inset back as the dialog gets short, drops it
// and its inline inset when the dialog stacks, so a stacked label keeps the whole line, and stops pinning under the tiny step, where a pinned row would cover the content.
//
// `header` pins a message's name row to the scrollport's top as the row's one raised layer: only its top inset is cancelled, because a
// negative bottom margin lets the band paint past the row's foot, and the one-pixel overshoot is the clip the pin observer reads. A
// `headerOutside` row sits outside its box, so over a wallpaper the chrome plate supplies that inset and nothing is cancelled.
export const PINNED = {
  dialogFooter: "sticky inset-be-0 dialog-short:py-tight dialog-stacked:p-0 dialog-tiny:static",
  header: "-mbs-row sticky -inset-bs-px z-(--z-raised)",
  headerOutside: "not-in-data-[has-bg-image]:-mbs-row sticky -inset-bs-px z-(--z-raised)",
} as const;
