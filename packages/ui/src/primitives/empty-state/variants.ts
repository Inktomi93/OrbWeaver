import { tv } from "tailwind-variants";

// The empty-state skin — a centered teaching stack on the section rhythm (ui-package-design §6.1).
// The DESIGN.md "Weave" moment: icon → title → description → action, copy owned by the caller.
export const emptyStateVariants = tv({
  slots: {
    root: "flex flex-col items-center gap-block py-section text-center",
    icon: "text-muted-foreground",
    title: "font-medium text-foreground text-title leading-title",
    description: "max-w-cq-sm text-body text-muted-foreground leading-body",
    action: "pt-row",
  },
});
