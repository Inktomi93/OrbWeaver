import { GROW, tv } from "#lib";

// An island that floats in a room's reading column (the composer, the band of controls above it): the card fill and
// edge at the card radius and the field inset, with no shadow, because the room's art behind it is the lift.
export const roomIslandVariants = tv({
  base: "rounded-card border border-tone-edge bg-card p-field text-card-foreground tone-host-card",
  variants: {
    grow: GROW,
    // A bounded column surface passes its allocated height to shrinkable content.
    layout: { stack: "flex flex-col" },
    // An island whose card the room steps in to the transcript's rows at a narrow width gives that step up from its own padding, so
    // what it holds keeps its place.
    paddingInlineNarrow: { inset: "@max-cq-28:px-(--size-room-island-inset-narrow)" },
    // A card that holds a text field is the field's edge, so it wears the form-control edge token at rest and the ring
    // colour on hover and focus: D159 solves the ring above the edge and at 3:1 on the card, so every state holds the
    // floor. Focus adds a ring and hover yields to it, so focus is the strongest state however the pointer sits.
    holdsField: {
      true: `
        border-input-border
        focus-within:border-ring focus-within:bg-muted
        focus-within:not-data-drag-over:ring focus-within:not-data-drag-over:ring-ring
        hover:bg-muted
        hover:not-focus-within:border-ring
      `,
      false: "",
    },
    // A card that takes dropped files announces the armed state (`data-drag-over`) louder than focus.
    dropTarget: {
      true: "data-drag-over:border-primary data-drag-over:bg-muted data-drag-over:ring-(length:--border-width-rule) data-drag-over:ring-ring",
      false: "",
    },
  },
  defaultVariants: { holdsField: false, dropTarget: false },
});
