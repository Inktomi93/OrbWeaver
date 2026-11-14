import { CARD_CORNERS, PASS_THROUGH, PLACED, tv, WIDTH } from "#lib";
import type { Tone } from "#tokens";

// THE PLACEHOLDER'S ONE RECIPE, for the avatar's fallback and for the art panes that stand in for a missing picture
// (`monogramVariants`). The box is a size container, so the initials follow the box they stand in (`text.art-initial`,
// a share of its shorter axis) from a chip to a card portrait. The initials are a pseudo-element painted from `data-initials`,
// never a text node: axe's label-in-name rule reads visible text without honouring aria-hidden. The `depth` pigment under
// them moves away from the ink and dissolves toward the edge, so the box's own fill is what meets its border.
const MONOGRAM = `
  @container-size flex items-center justify-center orb-avatar-depth font-sans font-semibold text-primary-foreground uppercase
  before:content-[attr(data-initials)] before:text-art-initial before:leading-none
`;

// Avatar sizes ride display tokens, decoupled from control-height/touch-target tokens — an avatar that
// IS a button composes inside `Button` and inherits its own hit area.
export const avatarVariants = tv({
  slots: {
    root: `
      relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-muted align-middle select-none
      in-data-has-bg-image:border-hairline in-data-has-bg-image:border-solid in-data-has-bg-image:border-tone-edge
    `,
    // Retained native images need a box for lazy loading, but must neither paint nor share the fallback's flex space.
    image: "object-cover block-full inline-full data-error:invisible data-error:absolute data-loading:invisible data-loading:absolute",
    // The fallback's FILL is not a variant (#103): it derives from the active theme's own `--color-primary`
    // per seed, which is a relative-color expression rather than a class — `avatar.tsx` sets it as the one
    // inline `backgroundColor` (see `hue.ts` for why a token/utility cannot carry it). The INK stays the
    // theme's own `primary-foreground`, so the pairing the palette already AA-sweeps is the one in use.
    fallback: `${PLACED.fill} ${MONOGRAM}`,
  },
  variants: {
    size: {
      sm: { root: "block-(--size-avatar-sm) inline-(--size-avatar-sm)" },
      md: { root: "block-(--size-avatar-md) inline-(--size-avatar-md)" },
      lg: { root: "block-(--size-avatar-lg) inline-(--size-avatar-lg)" },
      hero: { root: "block-(--size-avatar-hero) inline-(--size-avatar-hero)" },
      // THE CELL IS THE SIZE (added 2026-08-16, program 102 — the home face shelf). Every step above is a
      // display TOKEN: the avatar decides its own box. This one hands the decision to the layout — the
      // portrait fills a fixed grid track and stays square. It is a real variant rather than a call-site
      // `w-full`: pre-#146 `size-avatar-*` was a custom-token utility tailwind-merge could not classify, so a
      // call-site width resolved against it by stylesheet order; post-#146 it resolves last-wins, so the call
      // site silently defeats the sized box instead. Both are "the size is not the call site's to state"
      // (`ui-size-via-variant` exists for exactly this, and reds the call site). Only correct inside a track that HAS a width of its own —
      // in an auto-sized flow it collapses, which is the honest failure of "the cell is the size".
      fill: { root: "aspect-square block-auto inline-full" },
      // `fill`'s PORTRAIT twin (added 2026-08-30, #864 — the Characters landing face shelf). Same ruling
      // ("the cell is the size", so the same only-inside-a-track-that-has-a-width limit), different aspect:
      // the approved artboards draw a character's art at 3/4, which is the shape a character CARD is, and
      // the `aspect` axis cannot express it here — `aspect="portrait"` is `aspect-portrait w-auto`, and its
      // `w-auto` is precisely what defeats `fill`'s `w-full` when the two are combined (tailwind-merge
      // resolves the width last-wins). One arm that states both halves is the only spelling that survives.
      fillPortrait: { root: "aspect-portrait block-auto inline-full" },
    },
    shape: {
      round: { root: "rounded-full" },
      square: { root: "rounded-control" },
      // The PORTRAIT step (UI-Density-Law.md §2.1 assigns `--radius-base` to portraits); `card` is the
      // floating-island step and an avatar never floats.
      rounded: { root: "rounded-base" },
    },
    aspect: {
      square: {},
      // `w-auto` overrides only the width half of `size-avatar-*` — height still rides the size token,
      // and `aspect-portrait` computes the narrower width from it.
      portrait: { root: "aspect-portrait inline-auto" },
    },
    // A portrait that stays at the top of its card while the card scrolls past.
    placed: { pinned: { root: PLACED.pinned } },
    // A portrait welded to a card's side takes the card's corners on its outer edge (`CARD_CORNERS`).
    cardCorners: { start: { root: CARD_CORNERS.start }, end: { root: CARD_CORNERS.end } },
    // A portrait sized by the column it fills, its height following its aspect.
    passThrough: { true: { root: PASS_THROUGH.true } },
    width: { ripplePortrait: { root: `block-auto ${WIDTH.ripplePortrait}` } },
    // A portrait that dissolves into the card at the edge that meets the text: `end` fades its inline-end edge, `start` its start edge.
    fade: { start: { root: "orb-portrait-fade-start" }, end: { root: "orb-portrait-fade-end" } },
    ring: {
      none: {},
      accent: {
        root: "shadow-glow ring-(length:--border-width-rule) ring-ring ring-offset-(length:--focus-ring-offset) ring-offset-background",
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

/** The initials of an art pane with no picture, over the pane's own fill. `pane` fills the box; `bandHead` is the solid head of a feathered band. */
export const monogramVariants = tv({
  base: MONOGRAM,
  variants: {
    seat: { pane: PLACED.fill, bandHead: `${PLACED.topBand} block-3/5` },
  },
});

/** The D336 tone of the portrait edge drawn over a wallpaper. */
export const AVATAR_EDGE_TONE = "primary" satisfies Tone;
