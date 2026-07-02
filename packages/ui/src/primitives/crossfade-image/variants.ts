import { tv } from "tailwind-variants";

// The crossfade-image skin — a `bg-muted` box (so a null/not-yet-loaded src still reads as a
// placeholder, not a hole) housing two absolutely-positioned `<img>` layers stacked on top of each
// other. `revealed` only defines the `false` (not-yet-faded-in) branch; `true` rides the ambient
// base (opacity-100) — the same one-branch-variant shape as the segmented-clock `filled` variant
// (charts/meter/variants.ts). Timing is the `--motion-base` token (matches the dialog/toast opacity
// fades) — `durationMs` on the component is a caller ESCAPE HATCH (inline style), never a class.
export const crossfadeImageVariants = tv({
  slots: {
    root: "relative block w-full overflow-hidden bg-muted",
    image:
      "absolute inset-0 size-full object-cover opacity-100 transition-opacity duration-(--motion-base) ease-out-expo",
  },
  variants: {
    revealed: {
      false: { image: "opacity-0" },
    },
  },
});
