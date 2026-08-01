import { FOCUS_RING, tv } from "#lib";

// Card is a generic SURFACE, not a domain card — features (character cards, config panels)
// compose it (ui-package-design §6.1).
//
// The base padding + radius here are the TIER-LESS FALLBACK, nothing more: inside a `<Surface>` the
// unlayered `styles/tiers.css` map resolves both from the surface's tier (density-pass-spec.md §4.2), so a
// feature never picks island padding or radius. `rounded-base` (grouped content), never `rounded-card` —
// D6 demoted `--radius-card` to ELEVATED/floating islands only, which is what `elevated` opts into.
export const cardVariants = tv({
  base: "rounded-base border border-border bg-card text-card-foreground p-block",
  variants: {
    // The explicit floating-island opt-in (density-pass-spec.md §2.1/§4.3): a modal/popover/composer-class
    // card that genuinely floats above the page. Its radius is re-declared unlayered in tiers.css so it
    // outranks the tier step inside a Surface; the shadow needs no such help (no tier rule touches it).
    elevated: {
      true: "rounded-card shadow-overlay",
      false: "",
    },
    interactive: {
      true: `cursor-pointer transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent active:bg-accent/80 focus-visible:outline-none ${FOCUS_RING}`,
      false: "",
    },
  },
  defaultVariants: { elevated: false, interactive: false },
});
