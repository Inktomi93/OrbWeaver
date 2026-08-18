import { tv } from "#lib";

// Avatar sizes ride display tokens, decoupled from control-height/touch-target tokens — an avatar that
// IS a button composes inside `Button` and inherits its own hit area.
export const avatarVariants = tv({
  slots: {
    root: "relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-muted align-middle select-none",
    image: "size-full object-cover",
    // The fallback's FILL is not a variant (#103): it derives from the active theme's own `--color-primary`
    // per seed, which is a relative-color expression rather than a class — `avatar.tsx` sets it as the one
    // inline `backgroundColor` (see `hue.ts` for why a token/utility cannot carry it). The INK stays the
    // theme's own `primary-foreground`, so the pairing the palette already AA-sweeps is the one in use.
    fallback: "flex size-full items-center justify-center bg-primary text-label leading-label font-medium text-primary-foreground uppercase",
  },
  variants: {
    size: {
      sm: { root: "size-avatar-sm" },
      md: { root: "size-avatar-md" },
      lg: { root: "size-avatar-lg" },
      hero: { root: "size-avatar-hero" },
      // THE CELL IS THE SIZE (added 2026-08-16, program 102 — the home face shelf). Every step above is a
      // display TOKEN: the avatar decides its own box. This one hands the decision to the layout — the
      // portrait fills a fixed grid track and stays square. It is a real variant rather than a call-site
      // `w-full`: pre-#146 `size-avatar-*` was a custom-token utility tailwind-merge could not classify, so a
      // call-site width resolved against it by stylesheet order; post-#146 it resolves last-wins, so the call
      // site silently defeats the sized box instead. Both are "the size is not the call site's to state"
      // (`ui-size-via-variant` exists for exactly this, and reds the call site). Only correct inside a track that HAS a width of its own —
      // in an auto-sized flow it collapses, which is the honest failure of "the cell is the size".
      fill: { root: "aspect-square h-auto w-full" },
    },
    shape: {
      round: { root: "rounded-full" },
      square: { root: "rounded-control" },
      // The PORTRAIT step (density-pass-spec.md §2.1 assigns `--radius-base` to portraits); `card` is the
      // floating-island step and an avatar never floats.
      rounded: { root: "rounded-base" },
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
        root: "shadow-glow ring-2 ring-ring ring-offset-2 ring-offset-background",
      },
    },
  },
  defaultVariants: {
    size: "md",
    shape: "round",
    aspect: "square",
    ring: "none",
  },
});
