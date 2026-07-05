import { tv } from "tailwind-variants";

// The empty-state skin — a centered teaching stack on the section rhythm (ui-package-design §6.1).
// The DESIGN.md "Weave" moment: (decoration | icon) → title → description → action, copy owned by the
// caller. `decoration` (D62) is the brand-glyph slot — UNSTYLED (no forced text color) so a WeaveGlyph
// keeps its own Ember tint, vs `icon` which is muted chrome; it WINS over `icon` when both are passed.
export const emptyStateVariants = tv({
  slots: {
    root: "flex flex-col items-center gap-block py-section text-center",
    decoration: "",
    icon: "text-muted-foreground",
    title: "font-medium text-foreground text-title leading-title",
    description: "max-w-cq-sm text-body text-muted-foreground leading-body",
    action: "pt-row",
  },
});
