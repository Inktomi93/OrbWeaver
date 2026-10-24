import { tv } from "#lib";

// The empty-state skin — a centered teaching stack on the section rhythm (ui-package-design §6.1).
// The mock design's "Weave" moment: (decoration | icon) → title → description → action, copy owned by the
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
    root: "@container w-full flex flex-col items-center gap-block py-section text-center @max-cq-24:gap-row @max-cq-24:py-block",
    decoration: "",
    icon: "text-muted-foreground",
    title: "font-medium text-foreground text-title leading-title @max-cq-24:text-body @max-cq-24:leading-body",
    // NO `max-w-*` IN THE BASE — the measure is the `measure` variant's alone. A base width plus a variant
    // width is the tailwind-merge custom-token trap (`twMerge("max-w-cq-24","max-w-cq-32")` cannot see
    // through the registered custom scale reliably, so the pair would resolve by stylesheet order); one
    // home, one class, no merge to lose.
    description: "text-body text-muted-foreground leading-body @max-cq-24:text-label @max-cq-24:leading-label",
    action: "pt-row @max-cq-24:pt-field",
  },
  variants: {
    titleStep: {
      default: {},
      focal: { title: "font-semibold" },
    },
    // THE READING MEASURE (side-eye 2026-08-22 P3-1). `default` (24rem ≈ 42.5ch) is the right measure for a
    // teaching line in a LIST pane or a ribbon — short, centered, two or three lines. It is the WRONG one for
    // a section's focal CONTENT welcome, where the same copy runs to four ragged centered lines at half the
    // §2 65–75ch band; `wide` (32rem ≈ 60ch) is that surface's arm. Opt-in per site, because the correct
    // measure is a property of the pane the state lands in, not of the pattern.
    measure: {
      default: { description: "max-w-cq-24" },
      wide: { description: "max-w-cq-32" },
    },
  },
  defaultVariants: { titleStep: "default", measure: "default" },
});
