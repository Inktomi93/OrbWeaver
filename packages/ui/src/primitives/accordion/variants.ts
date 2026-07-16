import { FOCUS_RING, tv } from "#lib";

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
    trigger: `group flex flex-1 cursor-pointer items-center justify-between gap-block py-block text-title leading-title font-medium text-foreground outline-none data-disabled:pointer-events-none data-disabled:opacity-50 ${FOCUS_RING}`,
    chevron: "shrink-0 text-muted-foreground transition-transform duration-(--motion-base) ease-out-expo group-data-[panel-open]:rotate-180",
    panel:
      "h-(--accordion-panel-height) overflow-hidden text-body leading-body text-muted-foreground transition-all duration-(--motion-layout) ease-out-expo data-starting-style:h-0 data-ending-style:h-0",
  },
});
