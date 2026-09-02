import { DISABLED_STATE, FOCUS_RING, tv } from "#lib";

/**
 * Slot classes for the accordion (ui-package-design §5). Items are separated by `border-border`
 * dividers; the chevron rotates 180° when its trigger carries Base UI's `data-panel-open`
 * (`group-data-[panel-open]`). The panel animates height off `--accordion-panel-height` exactly as
 * the collapsible does (Base UI 1.6 panel animation contract).
 */
export const accordionVariants = tv({
  slots: {
    root: "flex w-full flex-col",
    item: "border-b border-border",
    header: "flex",
    trigger: `group flex flex-1 cursor-pointer items-center justify-between gap-block py-block text-title leading-title font-medium text-foreground outline-none ${DISABLED_STATE} ${FOCUS_RING}`,
    chevron: "shrink-0 text-muted-foreground transition-transform duration-(--motion-base) ease-out-expo group-data-[panel-open]:rotate-180",
    // `transition-all` was catching inherited non-compositor properties too (`scrollbarColor` —
    // the app's `[anim]` flagger convicted this panel OVER BUDGET on every fold). The panel only
    // ever animates `height` (the ratified #953/#1069 lifecycle allowance, guide §4.2 item 3) —
    // naming it keeps the sanctioned motion and drops everything `all` swept in by accident.
    panel:
      "h-(--accordion-panel-height) overflow-hidden text-body leading-body text-muted-foreground transition-[height] duration-(--motion-layout) ease-out-expo data-starting-style:h-0 data-ending-style:h-0",
  },
});
