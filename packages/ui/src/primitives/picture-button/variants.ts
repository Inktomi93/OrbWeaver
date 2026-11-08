import { TOUCH_TARGET_PSEUDO, tv } from "#lib";

// Content-sized: the picture child (a portrait, a band of art) is the box and owns the touch floor, so no scale step's
// height can leave a picture larger than it painting outside its own hit target.
export const pictureButtonVariants = tv({
  base: "p-0",
  variants: {
    // A picture under the touch floor (a gutter chip) keeps its box and takes the pointer-conditional target on `::before`,
    // layout-neutral, so the row it sits in does not grow.
    reach: { floor: ["relative", TOUCH_TARGET_PSEUDO] },
    // Whether the shared recipe paints a style. Unpainted, the button draws nothing at any state: the art stays the
    // affordance and dims a step on hover instead of gaining a tint.
    painted: { true: "", false: "cursor-pointer bg-transparent text-current hover:opacity-hover" },
    // A tile with a caption under its picture: `start` sets the caption at the tile's start, and `centre` holds a lone mark in the middle of the tile.
    caption: { start: "flex-col items-stretch gap-tight text-start", centre: "flex-col items-center justify-center gap-tight" },
  },
});
