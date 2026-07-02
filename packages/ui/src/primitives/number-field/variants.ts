import { tv } from "tailwind-variants";

// The number-field skin. Steppers are full size-touch-target squares (the ≥44px law — the brief's
// touch floor applies to the increment/decrement buttons, §4b axis 3); rings go inset because the
// group clips overflow for the rounded border. The scrub area is a drag-to-scrub label (Base UI
// ScrubArea) with a directional resize cursor; the ScrubAreaCursor is the custom pointer-lock glyph.
export const numberFieldVariants = tv({
  slots: {
    root: "flex w-full flex-col gap-field data-disabled:pointer-events-none data-disabled:opacity-50",
    scrubArea:
      "flex w-fit cursor-ew-resize select-none items-center gap-row text-label font-medium leading-label text-muted-foreground",
    scrubCursor: "flex text-foreground",
    group:
      "flex w-full items-stretch overflow-hidden rounded-control border border-border bg-input",
    decrement: [
      "flex size-touch-target shrink-0 cursor-pointer select-none items-center justify-center border-r border-border text-foreground",
      "transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent active:bg-accent/80",
      "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
      "disabled:pointer-events-none disabled:opacity-50 data-disabled:pointer-events-none data-disabled:opacity-50",
    ],
    input: [
      "h-touch-target w-full min-w-0 bg-transparent text-center text-body leading-body text-foreground tabular-nums",
      "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
    ],
    increment: [
      "flex size-touch-target shrink-0 cursor-pointer select-none items-center justify-center border-l border-border text-foreground",
      "transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent active:bg-accent/80",
      "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
      "disabled:pointer-events-none disabled:opacity-50 data-disabled:pointer-events-none data-disabled:opacity-50",
    ],
  },
});
