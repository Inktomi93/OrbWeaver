import { CAP, COLOR_MOTION, FOCUS_RING, HEIGHT, TONE_ARMS, TONE_TINT, TONE_TINT_HOVER, tv, WIDTH } from "#lib";
import { ART_DECORATION } from "#src/lib/art-decoration.ts";

// Card is a generic SURFACE, not a domain card — features (character cards, config panels)
// compose it (ui-package-design §6.1).
//
// The base padding + radius here are the TIER-LESS FALLBACK, nothing more: inside a `<Surface>` the
// ui-layer `styles/tiers.css` map resolves both from the surface's tier (UI-Density-Law.md §4.2), so a
// feature never picks island padding or radius. `rounded-base` (grouped content), never `rounded-card` —
// D6 demoted `--radius-card` to ELEVATED/floating islands only, which is what `elevated` opts into.

const MEANING_EDGE = "border-tone-solid data-[tone=neutral]:border-tone-edge";

export const cardVariants = tv({
  base: "rounded-base border p-block text-card-foreground",
  variants: {
    width: WIDTH,
    cap: CAP,
    height: { fill: HEIGHT.fill },
    // A card that holds one mark in its middle.
    centres: { true: "flex flex-col items-center justify-center" },
    // THE BOX SHAPE: a bordered, rounded, filled Row or Stack is a Card. `island` is grouped
    // content inside a surface. `row` is one operable or listed row drawn as its own box (a pack item, a mini
    // preview row): the control radius, because you operate it. The radius is re-declared in tiers.css, where the
    // tier rule outranks it.
    shape: {
      island: "",
      row: "rounded-control",
    },
    // THE FILL STYLE (D336), painted only with the roles of the stamped tone, so every tone works with every style.
    // A soft or outline box in a colour tone is a status box: its border carries the meaning, so it paints `solid` and
    // holds the 3:1 non-text floor. The neutral tone carries no meaning and its solid is the page ink, so a neutral
    // box keeps the quiet edge.
    variant: {
      // The card fill with the tone's edge: the default island.
      surface: "border-tone-edge bg-card tone-host-card",
      // The tone's tint under its meaning edge, and its on-tint ink for content that sets no ink of its own: a status
      // box, a quoted block that reads as an artifact, a nested box that must lift off a card fill.
      soft: `${MEANING_EDGE} ${TONE_TINT}`,
      // The meaning edge alone: a box that groups or marks without lifting off its ground.
      outline: `${MEANING_EDGE} bg-transparent`,
    },
    tone: TONE_ARMS,
    // A set state marked on the card's leading edge (an override that differs from the default).
    rail: { none: "", primary: "border-s-rule border-s-primary" },
    artDecoration: ART_DECORATION,
    // A region that takes programmatic focus (a `tabIndex={-1}` editor a list hands focus to) draws the focus ring.
    focusable: { true: `outline-none ${FOCUS_RING}`, false: "" },
    dashed: { true: "border-dashed", false: "" },
    glow: {
      none: "",
      accent: `
        relative isolate
        before:pointer-events-none before:absolute before:-inset-px before:-z-(--z-raised) before:rounded-[inherit] before:shadow-glow before:content-['']
      `,
      focal: `
        relative isolate
        before:pointer-events-none before:absolute before:-inset-px before:-z-(--z-raised) before:rounded-[inherit] before:opacity-faint before:shadow-glow
        before:transition-opacity before:duration-(--motion-base) before:ease-out-expo before:content-['']
        hover:before:opacity-100
        data-returned:before:opacity-100
      `,
    },
    // The explicit floating-island opt-in (UI-Density-Law.md §2.1/§4.3): a modal/popover/composer-class
    // card that genuinely floats above the page. Its radius is re-declared in the ui layer in tiers.css so it
    // outranks the tier step inside a Surface; the shadow needs no such help (no tier rule touches it).
    elevated: {
      true: "rounded-card shadow-overlay",
      false: "",
    },
    // THE NESTED-ISLAND arm (CD2). An interactive island rendered INSIDE another box — a choices block inside a chat
    // bubble — must stay distinguishable, but the full Card treatment inside a box that already has
    // border+radius+fill is TWO complete boxes. This arm is the ruled single-axis separation: drop the border
    // entirely, step the radius one below the host's, and let the FILL alone carry the distinction (the caller
    // supplies it). The radius is re-declared in the ui layer in tiers.css for the same reason `elevated` is: a
    // `rounded-*` utility on the card loses to the tier rule inside a Surface.
    nested: {
      true: "rounded-inset border-0",
      false: "",
    },
    // The one padding arm: the island delegates its inset to its own content (a collapse row's trigger, so the
    // whole closed row is one tap target). `tier` is the resolved tier step.
    // A padding utility loses to the tier rule inside a Surface, so `data-padding` re-declares `none` in tiers.css.
    padding: {
      tier: "",
      none: "p-0",
    },
    // An operable card follows the user's elevation and takes the tone's pressed tint on hover and press.
    interactive: {
      true: `
        cursor-pointer ${COLOR_MOTION}
        ${TONE_TINT_HOVER}
        focus-visible:outline-none
        active:bg-tone-tint-active active:text-tone-text-on-tint
        in-data-[elevation=glow]:shadow-overlay
        ${FOCUS_RING}
      `,
      false: "",
    },
  },
  defaultVariants: {
    shape: "island",
    variant: "surface",
    tone: "neutral",
    elevated: false,
    interactive: false,
    nested: false,
    padding: "tier",
    dashed: false,
    glow: "none",
    rail: "none",
    focusable: false,
  },
});
