import { tv } from "#lib";

// The empty-state skin — a centered teaching stack on the section rhythm (ui-package-design §6.1).
// The DESIGN.md "Weave" moment: (decoration | icon) → title → description → action, copy owned by the
// caller. `decoration` (D62) is the brand-glyph slot — UNSTYLED (no forced text color) so a WeaveGlyph
// keeps its own Ember tint, vs `icon` which is muted chrome; it WINS over `icon` when both are passed.
// WHERE it renders sets the voice, and the surface answers that itself (§4b axis 1 — a container query,
// never a `compact`/`density` prop the caller has to know to pass): the root IS the container, so the same
// component teaches at CONTENT scale on a wide surface and drops one type step in a ~307px LIST pane, where
// a 16px title + 15px body reads as shouting at a column half its width (side-eye P2f). `sm` = 24rem is the
// step between the two — every shell LIST pane sits below it, every CONTENT surface above.
export const emptyStateVariants = tv({
  slots: {
    root: "@container flex flex-col items-center gap-block py-section text-center @max-sm:gap-row @max-sm:py-block",
    decoration: "",
    icon: "text-muted-foreground",
    title: "font-medium text-foreground text-title leading-title @max-sm:text-body @max-sm:leading-body",
    description: "max-w-cq-sm text-body text-muted-foreground leading-body @max-sm:text-label @max-sm:leading-label",
    action: "pt-row @max-sm:pt-field",
  },
});
