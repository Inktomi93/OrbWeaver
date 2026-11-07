import type { ClassValue } from "tailwind-variants";
import { TOUCH_TARGET_PSEUDO, tv } from "#lib";
import type { BUTTON_BOX_STEPS } from "../button/box-hit-area.ts";

// A square display box at a glyph step, never a control height and never pointer-narrowed, for a micro control inside a
// dense row (a chip's dismiss, a row's trailing delete) where a control height would outgrow its host. Every step sits
// under the touch floor, so each carries the pointer-conditional hit area on `::before`: the CTA ring owns `::after`
// unlayered (`styles/primitives.css`), and one pseudo cannot be both. `shrink-0` keeps the square its token's box in a
// crowded flex row. Each step passes its class as a whole literal so Tailwind's scanner sees it.
function glyphBox(box: string): string[] {
  return [box, "relative shrink-0 p-0", TOUCH_TARGET_PSEUDO];
}

export const glyphButtonVariants = tv({
  variants: {
    glyph: {
      xs: glyphBox("size-(--size-glyph-xs)"),
      sm: glyphBox("size-(--size-glyph-sm)"),
      md: glyphBox("size-(--size-glyph-md)"),
      lg: glyphBox("size-(--size-glyph-lg)"),
    } satisfies Record<(typeof BUTTON_BOX_STEPS.glyphButton)[number], ClassValue>,
  },
});
