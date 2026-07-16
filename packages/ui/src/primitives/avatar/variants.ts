import { tv } from "#lib";

// Avatar sizes ride display tokens, decoupled from control-height/touch-target tokens — an avatar that
// IS a button composes inside `Button` and inherits its own hit area.
export const avatarVariants = tv({
  slots: {
    root: "relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-muted align-middle select-none",
    image: "size-full object-cover",
    fallback: "flex size-full items-center justify-center text-label leading-label font-medium uppercase",
  },
  variants: {
    size: {
      sm: { root: "size-avatar-sm" },
      md: { root: "size-avatar-md" },
      lg: { root: "size-avatar-lg" },
      hero: { root: "size-avatar-hero" },
    },
    shape: {
      round: { root: "rounded-full" },
      square: { root: "rounded-control" },
      rounded: { root: "rounded-card" },
    },
    aspect: {
      square: {},
      // `w-auto` overrides only the width half of `size-avatar-*` — height still rides the size token,
      // and `aspect-portrait` computes the narrower width from it.
      portrait: { root: "aspect-portrait w-auto" },
    },
    ring: {
      none: {},
      accent: {
        root: "shadow-glow ring-2 ring-(--color-primary) ring-offset-2 ring-offset-background",
      },
    },
    // String keys so VariantProps stays string-typed; avatar.tsx computes the hue bucket and always passes it.
    hue: {
      "1": { fallback: "bg-chart-1 text-primary-foreground" },
      "2": { fallback: "bg-chart-2 text-primary-foreground" },
      "3": { fallback: "bg-chart-3 text-primary-foreground" },
      "4": { fallback: "bg-chart-4 text-primary-foreground" },
      "5": { fallback: "bg-chart-5 text-primary-foreground" },
    },
  },
  defaultVariants: {
    size: "md",
    shape: "round",
    aspect: "square",
    ring: "none",
  },
});
