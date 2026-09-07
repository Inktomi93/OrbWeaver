// SELECTION_RING — the app-wide SELECTED-CELL idiom, in ONE spelling: a 2px INSET `--color-primary` ring,
// and nothing else. The grid-cell half of the ruled pair whose row half is `SELECTION_RAIL` — E2's
// "ring for a selected grid cell; left rail plus tint for a selected list row".
//
// WHY IT IS A FRAGMENT AND NOT EACH CELL'S OWN CLASSES (#1840, side-eye 2026-09-06 E2). The census found
// FIVE rendered selection idioms where two are ruled, and two of the five were the same job painted twice:
// `PickerCell` (the ratified one — #929/E6) drew a 2px inset ring, while `MediaGrid` drew an OUTSET ring
// PLUS the rationed `--shadow-glow` PLUS a gradient `::after` border ring in globals.css PLUS a check
// badge — four layers for the state its sibling states in one. "One idiom" is only true while every
// carrier paints the SAME declarations, which is exactly the argument `SELECTION_RAIL`'s header makes for
// the row half; a ring whose carriers each keep their own copy is a ring that drifts.
//
// THE INSET IS LOAD-BEARING, not a preference: an OUTSET 2px ring grows the cell's painted footprint, so
// picking a thumbnail nudged its neighbours (`picker-cell/variants.ts` states the same rule as the owner's
// zero-shift bar). The glow went with the outset ring — `--shadow-glow` is the ONE rationed Ember accent
// and a grid of selectable thumbnails is not the focal moment it is reserved for; its other consumers
// (the avatar's selected ring, the home hearth room, the refinery focal) are untouched.
//
// TWO CONSTANTS, ONE IDIOM, because the two carriers publish two different STATE ATTRIBUTES: a Base UI
// radio-backed picker cell is `data-checked` and a media cell is `data-selected`. Each is a WHOLE literal
// so Tailwind's scanner still sees it (it never assembles class names), and they live in one file so the
// pair cannot drift — the same reason `SELECTION_RAIL` is a fragment rather than a `list-row` detail.
//
// CONSEQUENCE FOR ANYONE ADDING A CARRIER: add it here, keyed on whichever attribute the carrier owns.
// A third spelling is a third idiom, which is the finding this file closes.

/** The selected-cell ring for a `data-checked` carrier (Base UI radio/checkbox-backed picker cells). */
export const SELECTION_RING_CHECKED = "data-checked:ring-2 data-checked:ring-inset data-checked:ring-primary";

/** The selected-cell ring for a `data-selected` carrier (media/thumbnail cells). */
export const SELECTION_RING_SELECTED = "data-selected:ring-2 data-selected:ring-inset data-selected:ring-primary";
