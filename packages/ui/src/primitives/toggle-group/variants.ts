import { tv } from "tailwind-variants";

// The toggle-group skin — a segmented row on bg-muted; the child <Toggle>s carry their own pressed
// skin. Base UI's roving tabindex handles arrow-key movement across items.
export const toggleGroupVariants = tv({
  base: "inline-flex w-fit items-center gap-field rounded-control bg-muted p-field",
});
