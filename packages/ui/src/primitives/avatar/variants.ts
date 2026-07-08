import { tv } from "#lib";

/**
 * Slot classes for the avatar (ui-package-design §5). Sizes ride the DISPLAY-avatar tokens
 * (`--spacing-avatar-sm/md/lg` = 24/30/34px — D62 §4.2: an avatar is DISPLAY, not a touch target, so
 * it is decoupled from the control-height tokens and is pointer-INDEPENDENT, never narrowing). An
 * avatar that IS a button (the rail-foot account trigger) composes `Avatar` inside `Button` and
 * inherits the Button's own coarse-pointer ≥44px hit area — nothing for this display primitive to
 * special-case. Shape is round (`rounded-full`), square (`rounded-control`, tight radius) or
 * `rounded` (`rounded-card`, a softer rounded-rect — §B.3 avatar versatility).
 *
 * `aspect` (§B.3/§B.4): `square` (default, 1:1 — `size-avatar-*` already IS square) or `portrait`
 * (the 2:3 `--aspect-portrait` token) — the presence lever the Phase-4 VN/Ripple immersive mode
 * needs (a tall sticky portrait instead of a small round chip). Widens the box beyond the `size-*`
 * square via `w-auto h-full` + the aspect-ratio utility so height still rides the size token.
 *
 * `ring` (§B.3): `none` (default) or `accent` — a ring painted from `--color-primary` (the D62 global
 * accent, always defined — never entangled with the per-character `<ThemeScope>` the row's speaker
 * name/bubble already use, so this stays a standalone user-appearance pref, not a 3rd ThemeScope
 * consumer). Reuse-ready for a future active-speaker highlight (swap the referenced var then).
 *
 * `hue` (D62): the deterministic per-entity fallback color — the fallback slot fills with one of the
 * tuned `chart-1..5` hues, paired with the dark `--primary-foreground` (verified AA ≥4.5:1 against
 * ALL FIVE hues: 7.07 / 7.24 / 6.17 / 8.31 / 6.62). The bucket is HASHED from the entity seed in
 * `avatar.tsx`, so a given character always lands the same color; a loaded image covers the fallback,
 * so the hue only paints when initials show.
 */
export const avatarVariants = tv({
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
      hero: { root: "size-avatar-hero" },
    },
    shape: {
      round: { root: "rounded-full" },
      square: { root: "rounded-control" },
      rounded: { root: "rounded-card" },
    },
    aspect: {
      square: {},
      portrait: { root: "aspect-portrait h-full w-auto" },
    },
    ring: {
      none: {},
      accent: { root: "ring-2 ring-(--color-primary) ring-offset-2 ring-offset-background" },
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
    aspect: "square",
    ring: "none",
  },
});
