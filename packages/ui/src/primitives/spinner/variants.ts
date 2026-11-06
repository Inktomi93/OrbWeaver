import { INKS, TONE_TEXT, tv } from "#lib";

// The loader's colour classes sit on its root slot, so each shared map becomes a root-slot arm map.
function onRoot<Key extends string>(map: Readonly<Record<Key, string>>): Record<Key, { root: string }> {
  return Object.fromEntries(Object.entries<string>(map).map(([key, cls]) => [key, { root: cls }])) as Record<Key, { root: string }>;
}

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
    },
    // The loader inherits `currentColor` unless it takes a tone (a brand wait is `primary`) or a named ink.
    tone: onRoot(TONE_TEXT),
    ink: onRoot(INKS),
  },
  defaultVariants: { size: "md" },
});
