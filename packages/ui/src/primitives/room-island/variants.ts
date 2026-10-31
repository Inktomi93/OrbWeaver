import { tv } from "#lib";

// An island that floats in a room's reading column (the composer, the band of controls above it): the card fill and
// edge at the card radius and the field inset, with no shadow, because the room's art behind it is the lift.
export const roomIslandVariants = tv({
  base: "rounded-card border border-tone-edge bg-card p-field text-card-foreground",
  variants: {
    // A bounded column surface passes its allocated height to shrinkable content.
    layout: { stack: "flex flex-col" },
    // A card that holds a text field takes its hover and focus lift on the opaque muted step and a focus edge in the
    // ring colour held back in alpha.
    holdsField: {
      true: "focus-within:border-ring/60 focus-within:bg-muted hover:border-input hover:bg-muted",
      false: "",
    },
    // A card that takes dropped files announces the armed state (`data-drag-over`) louder than focus.
    dropTarget: {
      true: "data-drag-over:border-primary data-drag-over:bg-muted data-drag-over:ring-2 data-drag-over:ring-ring",
      false: "",
    },
  },
  defaultVariants: { holdsField: false, dropTarget: false },
});
