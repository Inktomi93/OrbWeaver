import { tv } from "#lib";

// The decorative background-video skin (BG-V). Fills its positioned parent and COVERS by default —
// `object-cover` is the baked policy default (the recommended background fit). A consumer honoring a
// different fit passes an `object-contain`/`object-fill`/`object-none` utility via `className`, which
// tailwind-merge dedupes against this base. `block` kills the inline-video baseline descender gap.
export const backgroundVideoVariants = tv({
  base: "block h-full w-full object-cover",
});
