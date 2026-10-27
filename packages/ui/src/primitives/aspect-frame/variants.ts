import { tv } from "#lib";
import { MEDIA_ASPECT_CLASSES } from "./aspect.ts";

export const aspectFrameVariants = tv({
  slots: {
    root: "relative inline-full",
    content: "absolute inset-0 min-block-0 min-inline-0",
  },
  variants: {
    aspect: {
      square: { root: MEDIA_ASPECT_CLASSES.square },
      portrait: { root: MEDIA_ASPECT_CLASSES.portrait },
      landscape: { root: MEDIA_ASPECT_CLASSES.landscape },
    },
  },
});
