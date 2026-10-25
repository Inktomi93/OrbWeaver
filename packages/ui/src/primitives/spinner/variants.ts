import { TONE_INK, tv } from "#lib";

// Spinner ink uses the same token sizes as icons; the root also owns its loading reservation.
export const spinnerVariants = tv({
  slots: {
    root: "inline-flex items-center justify-center",
    label: "sr-only",
    glyph: "block-full inline-full",
  },
  variants: {
    size: {
      sm: { root: "block-(--size-icon-sm) inline-(--size-icon-sm)" },
      md: { root: "block-(--size-icon-md) inline-(--size-icon-md)" },
      lg: { root: "block-(--size-icon-lg) inline-(--size-icon-lg)" },
      xl: { root: "block-(--size-icon-xl) inline-(--size-icon-xl)" },
      hero: { root: "block-(--size-icon-hero) inline-(--size-icon-hero)" },
    },
    // The loader inherits `currentColor`; a brand wait takes the accent ink.
    tone: { default: {}, accent: { root: TONE_INK.accent }, muted: { root: TONE_INK.muted } },
  },
  defaultVariants: { tone: "default", size: "md" },
});
