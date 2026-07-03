import { tv } from "tailwind-variants";

// Pressed state lives on the child <Toggle>s themselves — don't add a pressed variant here.
export const toggleGroupVariants = tv({
  base: "inline-flex w-fit items-center gap-field rounded-control bg-muted p-field",
});
