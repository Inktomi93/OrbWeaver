import { tv } from "tailwind-variants";

// Teach tailwind-merge the type-scale tokens: by default it classifies unknown `text-*` values as
// COLORS, so `text-label` + `text-muted-foreground` "conflict" and the size token is silently
// dropped (recorded tailwind-variants-v3 delta — hoist to #lib if a third copy appears).
const twMergeConfig = {
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "headline", "title", "body", "label", "code"] }],
    },
  },
};

/**
 * Slot classes for the avatar (ui-package-design §5). Sizes ride the DISPLAY-avatar tokens
 * (`--spacing-avatar-sm/md/lg` = 24/30/34px — D62 §4.2: an avatar is DISPLAY, not a touch target, so
 * it is decoupled from the control-height tokens and is pointer-INDEPENDENT, never narrowing). An
 * avatar that IS a button (the rail-foot account trigger) composes `Avatar` inside `Button` and
 * inherits the Button's own coarse-pointer ≥44px hit area — nothing for this display primitive to
 * special-case. Shape is round (`rounded-full`) or square (`rounded-control`).
 *
 * `hue` (D62): the deterministic per-entity fallback color — the fallback slot fills with one of the
 * tuned `chart-1..5` hues, paired with the dark `--primary-foreground` (verified AA ≥4.5:1 against
 * ALL FIVE hues: 7.07 / 7.24 / 6.17 / 8.31 / 6.62). The bucket is HASHED from the entity seed in
 * `avatar.tsx`, so a given character always lands the same color; a loaded image covers the fallback,
 * so the hue only paints when initials show.
 */
export const avatarVariants = tv(
  {
    slots: {
      root: "relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-muted align-middle select-none",
      image: "size-full object-cover",
      fallback:
        "flex size-full items-center justify-center text-label leading-label font-medium uppercase",
    },
    variants: {
      size: {
        sm: { root: "size-avatar-sm" },
        md: { root: "size-avatar-md" },
        lg: { root: "size-avatar-lg" },
      },
      shape: {
        round: { root: "rounded-full" },
        square: { root: "rounded-control" },
      },
      // The 5 chart hues as fallback surfaces, each paired with the dark primary-foreground text
      // (AA-verified against all five — see the doc-comment above). String keys so VariantProps stays
      // string-typed; `avatar.tsx` computes the bucket and always passes it.
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
    },
  },
  { twMergeConfig },
);
