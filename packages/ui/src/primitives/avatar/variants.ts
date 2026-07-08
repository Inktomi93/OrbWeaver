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
 * needs (a tall sticky portrait instead of a small round chip). `size-avatar-*` already set BOTH
 * width+height (the square case); `w-auto` overrides ONLY the width half (tailwind-merge's conflict
 * groups distinguish `size-*`'s width/height halves independently), so HEIGHT still rides the size
 * token and the `aspect-portrait` ratio computes a narrower WIDTH from it — a sane small portrait chip
 * (e.g. `size-avatar-md` 30px tall × 20px wide), not a collapsed 0-height box. Phase-4b gap-fix: the
 * prior `h-full w-auto` depended on a PARENT height a bare icon-left avatar (a flex sibling in
 * `message-row.tsx`, no ambient row height) never defines, collapsing it to ~0px — `h-full` resolved
 * against an undefined parent height instead of the size token. A caller that DOES want the old
 * parent-relative-height behavior (Ripple's `position:sticky` portrait, `message-row-parts.tsx`)
 * still gets it: it passes its OWN `h-auto w-(--immersive-ripple-portrait-width)` via `className`,
 * which wins over both halves here (className merges last).
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
      // `w-auto` overrides ONLY the width half of `size-avatar-*`'s `size-*` utility (tailwind-merge
      // resolves `size-*`'s width/height conflict groups independently) — height still rides the size
      // token, and `aspect-portrait` computes the narrower width from it. See the doc-comment above
      // for the Phase-4b gap-fix this replaced (`h-full w-auto`, which depended on an undefined
      // PARENT height for a bare icon-left avatar and collapsed to ~0px).
      portrait: { root: "aspect-portrait w-auto" },
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
