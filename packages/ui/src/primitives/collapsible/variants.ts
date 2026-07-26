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
});
