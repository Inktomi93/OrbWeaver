import { FOCUS_RING, tv } from "#lib";

// Card is a generic SURFACE, not a domain card — features (character cards, config panels)
// compose it (ui-package-design §6.1).
//
// The base padding + radius here are the TIER-LESS FALLBACK, nothing more: inside a `<Surface>` the
// unlayered `styles/tiers.css` map resolves both from the surface's tier (UI-Density-Law.md §4.2), so a
// feature never picks island padding or radius. `rounded-base` (grouped content), never `rounded-card` —
// D6 demoted `--radius-card` to ELEVATED/floating islands only, which is what `elevated` opts into.
export const cardVariants = tv({
  base: "rounded-base border border-border bg-card text-card-foreground p-block in-data-[elevation=glow]:shadow-overlay",
  variants: {
    tone: {
      neutral: "",
      background: "bg-background",
      bubble: "border-0 bg-ai-bubble text-ai-bubble-foreground",
      muted: "bg-muted",
      warning: "border-warning bg-warning/10 text-warning",
      info: "border-info bg-info/10 text-info",
      highlight: "border-highlight",
    },
    outline: { solid: "", dashed: "border-dashed" },
    glow: {
      none: "",
      accent:
        // eslint-disable-next-line orb/no-arbitrary-tw-values -- Pseudo glow inherits the computed host radius across surface tiers; ends when the glow recipe no longer inherits its host.
        "relative isolate before:pointer-events-none before:absolute before:-inset-px before:-z-(--z-raised) before:rounded-[inherit] before:shadow-glow before:content-['']",
      focal:
        // eslint-disable-next-line orb/no-arbitrary-tw-values -- Pseudo glow inherits elevated and nested host radii; ends when the glow recipe no longer inherits its host.
        "relative isolate before:pointer-events-none before:absolute before:-inset-px before:-z-(--z-raised) before:rounded-[inherit] before:opacity-60 before:shadow-glow before:transition-opacity before:duration-(--motion-base) before:ease-out-expo before:content-[''] hover:before:opacity-100 data-returned:before:opacity-100",
    },
    // The explicit floating-island opt-in (UI-Density-Law.md §2.1/§4.3): a modal/popover/composer-class
    // card that genuinely floats above the page. Its radius is re-declared unlayered in tiers.css so it
    // outranks the tier step inside a Surface; the shadow needs no such help (no tier rule touches it).
    elevated: {
      true: "rounded-card shadow-overlay",
      false: "",
    },
    // THE NESTED-ISLAND arm (CD2 as ruled by side-eye, 2026-08-03). An interactive island rendered INSIDE
    // another box — a choices block inside a chat bubble — must stay distinguishable (a user has to see
    // that those are pressable, which is the case CD2's "maximum" clause exists to permit), but the full
    // Card treatment inside a box that already has border+radius+fill is TWO complete boxes, and the one
    // shipped instance carried a second BORDER COLOR on top of the host's. This arm is the ruled
    // single-axis separation: drop the border entirely, step the radius one below the host's, and let the
    // FILL alone carry the distinction (the caller supplies it — an intent hue is a feature's call, never a
    // generic surface's). The radius is re-declared unlayered in tiers.css for the same reason `elevated`
    // is: a `rounded-*` utility on the card loses to the tier rule inside a Surface.
    nested: {
      true: "rounded-inset border-0",
      false: "",
    },
    interactive: {
      true: `cursor-pointer transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent active:bg-accent/80 focus-visible:outline-none ${FOCUS_RING}`,
      false: "",
    },
  },
  defaultVariants: { elevated: false, interactive: false, nested: false, tone: "neutral", outline: "solid", glow: "none" },
});
