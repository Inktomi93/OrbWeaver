import { HOVER_REVEAL, TOUCH_TARGET_PSEUDO, tv } from "#lib";

// `base` is content-sized: the picture child (a portrait, a band of art) is the box and owns the touch floor, so no scale step's
// height can leave a picture larger than it painting outside its own hit target.
//
// The cue of a picture that can be replaced is two parts. The mark rides the house hover reveal: hidden at rest where the pointer can hover,
// shown on hover and focus, and always shown where it cannot, so a touch reader finds the control without a hover. The drop layer is the
// state of a file held over the picture, a dashed accent ring and a fill that the solid focus ring never draws, so a drop target reads apart
// from a focused button. Both parts are decoration over a picture the button already names, so they take no pointer and no name.
export const pictureButtonVariants = tv({
  slots: {
    base: "p-0",
    mark: [
      `
        pointer-events-none absolute inset-e-0 inset-be-0 flex items-center justify-center rounded-full border-rule border-input-border bg-muted p-tight
        text-foreground
      `,
      HOVER_REVEAL.hover,
    ],
    drop: [
      "pointer-events-none absolute inset-0 flex items-center justify-center rounded-full border-rule border-dashed border-primary bg-accent text-foreground",
      "opacity-0 transition-opacity duration-(--motion-fast) group-data-drag-over:opacity-100",
    ],
  },
  variants: {
    // A picture under the touch floor (a gutter chip) keeps its box and takes the pointer-conditional target on `::before`,
    // layout-neutral, so the row it sits in does not grow. It is raised so the reach stays above a positioned neighbour (a card's art overlay).
    // Below the `cq-16` container step the pseudo takes the 44px physical floor (`avatar-reach.ts`): the touch token scales with
    // the text, so its square would outgrow the row's small inset and gap and overlay the scroller's clip and the bubble.
    reach: {
      floor: {
        base: [
          "relative",
          "z-(--z-raised)",
          TOUCH_TARGET_PSEUDO,
          "@max-cq-16:before:block-(--size-touch-target-physical) @max-cq-16:before:inline-(--size-touch-target-physical)",
        ],
      },
    },
    // Whether the shared recipe paints a style. Unpainted, the button draws nothing at any state: the art stays the
    // affordance and dims a step on hover instead of gaining a tint.
    painted: { true: { base: "" }, false: { base: "cursor-pointer bg-transparent text-current hover:opacity-hover" } },
    // A button that takes a replacement picture: it is the `group` its cue parts key on, and anchors them with `relative`.
    cue: { replace: { base: "group relative" } },
    // A tile with a caption under its picture: `start` sets the caption at the tile's start, and `centre` holds a lone mark in the middle of the tile.
    caption: {
      start: { base: "flex-col items-stretch gap-tight text-start" },
      centre: { base: "flex-col items-center justify-center gap-tight" },
    },
  },
});
