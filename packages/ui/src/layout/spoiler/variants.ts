import { tv } from "#lib";

// Content the reader asked not to see yet: blurred and not selectable while `data-concealed` is set.
export const spoilerVariants = tv({
  base: "data-concealed:blur-md data-concealed:select-none",
});
