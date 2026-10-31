import { tv } from "#lib";

// Content-sized: the picture child (a portrait, a band of art) is the box and owns the touch floor, so no scale step's
// height can leave a picture larger than it painting outside its own hit target.
export const pictureButtonVariants = tv({
  base: "p-0 block-auto inline-auto",
  variants: {
    // Whether the shared recipe paints a style. Unpainted, the button draws nothing at any state: the art stays the
    // affordance and dims a step on hover instead of gaining a tint.
    painted: { true: "", false: "cursor-pointer bg-transparent text-current hover:opacity-80" },
  },
});
