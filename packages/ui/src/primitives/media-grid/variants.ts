import { FOCUS_RING, SELECTION_RING_SELECTED, tv } from "#lib";

// The media-grid cell skin (ui-package-design §6.1 / work-order #6). Cells are square (aspect
// reserved by the grid host, not by the image) so nothing shifts while thumbnails lazy-load. The
// `group` parent lets the selected badge react to `data-selected` without a second wrapper.
export const mediaGridVariants = tv({
  slots: {
    root: "relative overflow-auto overscroll-contain",
    cell: [
      "group relative flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-control bg-muted outline-none",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      "hover:ring-2 hover:ring-ring/50",
      FOCUS_RING,
      // ONE RING, THE SHARED ONE (#1840, side-eye 2026-09-06 E2). This cell used to paint FOUR layers for
      // the state `PickerCell` states in one: an OUTSET accent ring, the rationed `--shadow-glow`, a
      // gradient `::after` border ring in globals.css, and the check badge below. The census counted that
      // as a third grid idiom beside the two ruled ones. It now wears `SELECTION_RING_SELECTED` — the same
      // two declarations the ratified picker cell wears, inset so picking cannot nudge a neighbour — and
      // the badge stays, because "ring + check" IS the ruled cell idiom.
      //
      // THE GLOW'S RULING SURVIVES; ITS INPUT LEFT. `--shadow-glow` is the ONE rationed Ember accent and
      // the comment here claimed a selected thumbnail is the "focus/character moment" it is reserved for.
      // A grid where every cell is selectable and one happens to be chosen is not that moment — the token
      // keeps its other consumers (the avatar's selected ring, the home hearth room, the refinery focal),
      // which are single focal objects rather than one member of a grid.
      SELECTION_RING_SELECTED,
    ],
    // THE IMAGE STATES ITS OWN RESERVATION (#1159). The cell above already reserves the square, so
    // nothing can shift here — but "nothing shifts" was true only of the CELL, and the `<img>` itself
    // declared no box of its own: no `width`+`height` attributes, no aspect-ratio, only percentage
    // sizing. The client's `[space]` flagger reads AUTHORED intent, never the resolved height
    // (motion-flaggers.ts states why: a computed height is reported for a bare `<img>` too, so a
    // resolved-height check never fires), and it filed `<img> has no reserved box · [data-slot=
    // media-grid-image]` on the Background surface (side-eye 2026-09-02 config drive 2, G7). Declaring
    // the ratio the cell already imposes makes the reservation legible to a reader and to the flagger.
    // GEOMETRY-PRESERVING: `h-full`/`w-full` are both definite inside the square cell, so the ratio
    // never participates in sizing — it is the authored statement of a box the layout already had.
    image: "aspect-square h-full w-full object-cover",
    placeholder: "h-full w-full bg-muted",
    selectedBadge: "absolute top-field right-field flex items-center justify-center rounded-full bg-primary p-field text-primary-foreground",
  },
});
