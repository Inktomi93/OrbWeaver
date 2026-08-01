import { ACCENT_HOVER, CONTROL_SIZE, DISABLED_STATE, DISABLED_STATE_NATIVE, FOCUS_RING, tv } from "#lib";

// Sizes ride the control-height tokens (CONTROL_SIZE, shared with Toggle) so the ≥44px touch floor
// holds by construction; button adds an `icon`, a `media` and a `wrap` size on top. The size axis is the
// SOLE owner of the box: no other variant (and no call-site class) may set a height, because the
// control-height tokens are opaque to tailwind-merge and a second height would resolve by stylesheet
// order, not by intent.
export const buttonVariants = tv({
  base: [
    "inline-flex select-none items-center justify-center gap-field whitespace-nowrap rounded-control font-sans font-medium",
    // Tailwind v4 `scale-*` sets the standalone `scale` CSS property, not the transform matrix, so the
    // transition must name `scale` — `transition-[...transform]` would not animate it.
    "transition-[color,background-color,box-shadow,scale] duration-(--motion-fast) ease-out-expo active:scale-95",
    "outline-none",
    FOCUS_RING,
    DISABLED_STATE_NATIVE,
    DISABLED_STATE,
    "aria-busy:cursor-progress",
  ],
  variants: {
    intent: {
      primary: "bg-primary text-primary-foreground shadow-cta hover:bg-primary/90 hover:shadow-cta-glow active:bg-primary/80",
      secondary: `border border-border bg-transparent text-foreground ${ACCENT_HOVER} active:bg-accent/80`,
      ghost: `text-muted-foreground ${ACCENT_HOVER} active:bg-accent/80`,
      destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80",
    },
    size: {
      ...CONTROL_SIZE,
      icon: "size-control-md p-0",
      // CONTENT-SIZED: the child IS the control (a portrait/media trigger). Every other size pins a
      // control height, so a display-token child larger than it (`size-avatar-hero`, 64px) paints OUTSIDE
      // its own button and the real hit target stays the 34px control box — the stickler 2026-08-01 F2
      // defect. A `className` cannot fix that from a feature: `size-*` on custom tokens is opaque to
      // tailwind-merge, so the variant's `size-control-md` survives the override and wins on cascade
      // order. The child owns the touch floor here (an avatar-hero portrait clears it by 20px).
      media: "size-auto p-0",
      // MULTILINE: the `sm` step's WRAPPING twin — a choice/option affordance carrying a model-authored
      // sentence, so the label wraps (`whitespace-normal` over the base's nowrap) and the height FOLLOWS
      // the wrapped text, floored at the `sm` control height (D62: ≥ the pointer's tap floor at both
      // pointer classes — `--spacing-control-sm` is 44px coarse / 32px fine, ≥ `--spacing-touch-target`).
      // A call-site `h-auto` CANNOT express this: a custom-token height (`h-control-sm`) is opaque to
      // tailwind-merge, so both heights survive the merge and stylesheet order picks the winner — the
      // `media` (F2) and TabsTab `layout="stacked"` precedent. Pinned by COMPUTED height in
      // tests/ui/primitives/button/button.ct.tsx.
      wrap: "h-auto min-h-control-sm whitespace-normal px-block py-field text-label leading-label",
      // INLINE: the DISPLAY-AT-REST arm — a datum/line of prose that is also the click target (a tracker
      // value, a beat line, a card row, a roster name). It wears NO control box: text-height, start-aligned,
      // regular weight, so it reads as the text it stands in for and the click-to-edit swap is pixel-stable.
      // It was 13 call sites of `!h-auto min-h-0 !py-0 font-normal` — an `!important` escape from the sealed
      // control height, which is also how they escaped the `ui-size-via-variant` gate (it reads `h-auto`,
      // not `!h-auto`). MEASURED, not assumed (twMerge 3.6): custom-token spacing/height utilities are
      // unclassifiable — `twMerge("h-control-sm","h-auto")` keeps BOTH, so those call sites resolved by
      // stylesheet order, i.e. luck (the `media`/`wrap`/TabsTab-`stacked` precedent).
      // The arm therefore sets NO padding at all: preflight already zeroes it, and a `py-0` here would be
      // the same unresolvable pair against a call site's `py-row` (`twMerge("py-0","py-row")` keeps both).
      // Padding is the call site's — px-field/py-row/none — and needs no `!` because nothing fights it.
      // TOUCH FLOOR BY CONSTRUCTION: a text-height button is ~18px tall, so the arm carries its own hit-area
      // pseudo (the TOUCH_TARGET_PSEUDO idea, ::after and stretched to the button's own width) sized on
      // `--spacing-touch-target` — the POINTER-CONDITIONAL token: ≥44px on coarse/unknown pointers, 28px on
      // fine. Layout-neutral (absolutely positioned), so the datum's box is unchanged. Pinned by COMPUTED
      // box in tests/ui/primitives/button/button.ct.tsx.
      inline: [
        "relative h-auto min-h-0 justify-start font-normal text-label leading-label",
        "after:absolute after:top-1/2 after:left-1/2 after:h-touch-target after:w-full after:min-w-touch-target",
        "after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']",
      ],
    },
  },
  defaultVariants: { intent: "primary", size: "md" },
});
