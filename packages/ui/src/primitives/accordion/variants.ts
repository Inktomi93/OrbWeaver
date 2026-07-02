import { tv } from "tailwind-variants";

// Teach tailwind-merge the type-scale tokens (recorded tailwind-variants-v3 delta — see dialog).
const twMergeConfig = {
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "headline", "title", "body", "label", "code"] }],
    },
  },
};

/**
 * Slot classes for the accordion (ui-package-design §5). Items are separated by `border-border`
 * dividers; the chevron rotates 180° when its trigger carries Base UI's `data-panel-open`
 * (`group-data-[panel-open]`). The panel animates height off `--accordion-panel-height` exactly as
 * the collapsible does (Base UI 1.6 panel animation contract).
 */
export const accordionVariants = tv(
  {
    slots: {
      root: "flex w-full flex-col",
      item: "border-b border-border",
      header: "flex",
      trigger:
        "group flex flex-1 cursor-pointer items-center justify-between gap-block py-block text-title leading-title font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-disabled:pointer-events-none data-disabled:opacity-50",
      chevron:
        "shrink-0 text-muted-foreground transition-transform duration-(--motion-base) ease-out-expo group-data-[panel-open]:rotate-180",
      panel:
        "h-(--accordion-panel-height) overflow-hidden text-body leading-body text-muted-foreground transition-all duration-(--motion-layout) ease-out-expo data-starting-style:h-0 data-ending-style:h-0",
    },
  },
  { twMergeConfig },
);
