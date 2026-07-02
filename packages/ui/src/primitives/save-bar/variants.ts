import { tv } from "tailwind-variants";

/**
 * Slot classes for SaveBar (ui-package-design §6.1, work-order #22). Layout chrome ONLY: title +
 * kind label left, an actions slot right. `sticky` docks the bar to the footer or header edge of
 * its nearest scrolling ancestor — `z-raised` keeps it above ordinary content without competing
 * with overlays/modals (UI-Arch §4b z scale).
 */
export const saveBarVariants = tv({
  slots: {
    root: "sticky z-(--z-raised) flex items-center justify-between gap-row border-border bg-card px-block py-row",
    label: "flex min-w-0 items-baseline gap-field",
    title: "truncate font-medium text-body text-foreground",
    kind: "shrink-0 text-label text-muted-foreground",
    actions: "flex shrink-0 items-center gap-row",
  },
  variants: {
    sticky: {
      footer: { root: "bottom-0 border-t" },
      header: { root: "top-0 border-b" },
    },
  },
  defaultVariants: {
    sticky: "footer",
  },
});
