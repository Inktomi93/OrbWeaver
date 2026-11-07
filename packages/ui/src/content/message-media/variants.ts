import { CENTRED, MAX_HEIGHT, tv } from "#lib";

export const messageMediaVariants = tv({
  variants: {
    centred: CENTRED,
    maxHeight: { scrollLg: MAX_HEIGHT.scrollLg },
    // The media takes its host's whole box, for a frame that sets the size.
    fill: { true: "block-full inline-full", false: "" },
  },
});
