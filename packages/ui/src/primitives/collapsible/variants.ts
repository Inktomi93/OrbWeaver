import { DISABLED_STATE, FOCUS_RING, tv } from "#lib";

/**
 * Slot classes for the collapsible (ui-package-design §5). The panel animates its own height off
 * Base UI's `--collapsible-panel-height` CSS var: it opens from `data-starting-style:h-0` and
 * exits to `data-ending-style:h-0`, so `h-(--collapsible-panel-height)` + a `--motion-layout`
 * transition gives a measured, jank-free reveal (Base UI 1.6 panel animation contract).
 */
export const collapsibleVariants = tv({
  slots: {
    // `group` so the baked chevron can rotate off Base UI's `data-panel-open` on the trigger (the accordion
    // precedent). A consumer that renders its OWN chevron/icon in the trigger opts out via `chevron={false}`.
    root: "flex flex-col",
    trigger: `group inline-flex cursor-pointer items-center gap-field text-label leading-label font-medium text-foreground outline-none ${DISABLED_STATE} ${FOCUS_RING}`,
    chevron: "shrink-0 text-muted-foreground transition-transform duration-(--motion-base) ease-out-expo group-data-[panel-open]:rotate-180",
    panel:
      "h-(--collapsible-panel-height) overflow-hidden text-body leading-body text-muted-foreground transition-all duration-(--motion-layout) ease-out-expo data-starting-style:h-0 data-ending-style:h-0",
  },
  variants: {
    // THE TRIGGER'S BOX (side-eye 2026-08-22 P2-4). `inline` is the shipped shape and stays the default: a
    // disclosure that sits in running content is text-height, and a control box there would shear it away
    // from the copy it belongs to. `control` is for a disclosure that is a ROW of its own — the thing you
    // press to reach a whole section — and pins the pointer-conditional `--spacing-control-sm` floor (44px
    // coarse / 32px fine), the same token every other tap-floor control rides. Measured before: the params
    // deck's `Advanced` was a 544×16 box with no hit expansion (`::after` resolves `content: none` here, so
    // the touch pseudo is not in play), below WCAG 2.5.8's 24×24 on ANY pointer. It is a VARIANT and not a
    // call-site `min-h-*` because tailwind-merge cannot classify custom-token utilities, so an override
    // would win or lose by stylesheet order (gate `ui-size-via-variant`).
    size: {
      inline: {},
      control: { trigger: "min-h-control-sm" },
    },
    // `instant` snaps the panel to its target height with no perceptible fold. 0.01ms, not 0s, so the
    // fold is a real (imperceptible) transition rather than a jump-cut. It does NOT mirror the
    // reduced-motion floor any more, and the reason once written here — "a >0 duration keeps a
    // `transitionend` firing so Base UI still unmounts the closed panel" — was never the mechanism:
    // Base UI waits on `getAnimations()`/`animation.finished`, and an element with zero animations
    // resolves immediately (`@base-ui/react/internals/useAnimationsFinished`). The floor now removes
    // transitions outright (`globals.css`, #257). The reasoning disclosure's
    // AUTO-collapse uses it so the answer prose paints at its final position in one commit rather than being
    // flung up the trace's height; a manual toggle keeps the smooth fold.
    instant: {
      true: { panel: "duration-[0.01ms]" },
    },
  },
  defaultVariants: {
    instant: false,
    size: "inline",
  },
});
