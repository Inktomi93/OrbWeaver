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
    // `w-full` is a STRUCTURAL FENCE, not decoration (follow-up gap-audit 2026-08-08 gap 2): the root is a
    // `@container` (contain: inline-size — its inline size ignores its own contents), so a flex parent with
    // `align-items: center` gives it `align-self: center` and it collapses toward 0, dropping the description
    // to one word per line (the automation-settings 63px ribbon). Filling the slot defeats that in EVERY
    // consumer at once — no re-parent can silently narrow it. Measured by empty-state.ct.tsx.
    root: "@container w-full flex flex-col items-center gap-block py-section text-center @max-sm:gap-row @max-sm:py-block",
    decoration: "",
    icon: "text-muted-foreground",
    title: "font-medium text-foreground text-title leading-title @max-sm:text-body @max-sm:leading-body",
    description: "max-w-cq-sm text-body text-muted-foreground leading-body @max-sm:text-label @max-sm:leading-label",
    action: "pt-row @max-sm:pt-field",
  },
});
