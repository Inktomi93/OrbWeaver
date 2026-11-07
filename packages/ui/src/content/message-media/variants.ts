import { CENTRED, tv } from "#lib";

export const messageMediaVariants = tv({
  variants: {
    centred: CENTRED,
    // The media takes its host's whole box, for a frame that sets the size.
    fill: { true: "block-full inline-full", false: "" },
  },
});
