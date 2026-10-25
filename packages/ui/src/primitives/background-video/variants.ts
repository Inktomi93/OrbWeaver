import { tv } from "#lib";

export const backgroundVideoVariants = tv({
  base: "block block-full inline-full",
  variants: {
    // How the frame fills its box: `cover` and `contain` verbatim, `stretch` fills both axes, `center` paints the
    // natural size centred.
    fit: {
      cover: "object-cover",
      contain: "object-contain",
      stretch: "object-fill",
      center: "object-none",
    },
    // A thumbnail inside a surface (a composer attachment) takes the grouped-content radius.
    rounded: { none: "", base: "rounded-base" },
  },
  defaultVariants: { fit: "cover", rounded: "none" },
});
