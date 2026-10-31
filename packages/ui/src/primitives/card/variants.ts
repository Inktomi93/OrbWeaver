import { FOCUS_RING, isTone, RECEDED, TONE_ARMS, tv } from "#lib";
import type { Tone } from "#tokens";
import { ART_DECORATION } from "../../lib/art-decoration.ts";

// Card is a generic SURFACE, not a domain card — features (character cards, config panels)
// compose it (ui-package-design §6.1).
//
// The base padding + radius here are the TIER-LESS FALLBACK, nothing more: inside a `<Surface>` the
// unlayered `styles/tiers.css` map resolves both from the surface's tier (UI-Density-Law.md §4.2), so a
// feature never picks island padding or radius. `rounded-base` (grouped content), never `rounded-card` —
// D6 demoted `--radius-card` to ELEVATED/floating islands only, which is what `elevated` opts into.

/**
 * The use-specific surfaces that step 4 of the css-system plan moves to named components
 * (`docs/work/1421-build-the-tone-role-tier-and-one-variant.md`): the theme preview parts and the floating chip's
 * popover fill. They stay on `tone`, stamp the neutral scope and paint their own fill over the variant's.
 */
const STEP_FOUR_SURFACES = {
  background: "bg-background",
  accent: "bg-accent text-accent-foreground",
  // The rail's own fill and edge, for a box that previews or sits in the sidebar.
  sidebar: "border-sidebar-border bg-sidebar text-sidebar-foreground",
  // The card fill with the rail's edge: a pane in a preview of the shell.
  sidebarEdge: "border-sidebar-border",
  // A card fill that lets a wallpaper or art read through it.
  translucent: "bg-card/80",
  // The popover fill and its ink, for a chip that floats over the transcript.
  popover: "bg-popover text-popover-foreground",
} as const;

const MEANING_EDGE = "border-tone-solid data-[tone=neutral]:border-tone-edge";

export const cardVariants = tv({
  base: "rounded-base border p-block text-card-foreground",
  variants: {
    // A bounded column surface passes its allocated height to shrinkable content.
    layout: { stack: "flex flex-col" },
    // THE BOX SHAPE: a bordered, rounded, filled Row or Stack is a Card. `island` is grouped
    // content inside a surface. `row` is one operable or listed row drawn as its own box (a pack item, a mini
    // preview row): the control radius, because you operate it. The radius is re-declared in tiers.css, where the
    // tier rule outranks it.
    shape: {
      island: "",
      row: "rounded-control",
      // An island that floats in a room's reading column (the composer, the band of controls above it): the card
      // radius and the field inset, with no shadow, because the room's art behind it is the lift.
      float: "rounded-card p-field",
      // A sub-control mark drawn as a box: a pane in a small preview of the shell.
      inset: "rounded-inset",
      // A floating chip (jump to latest): the pill radius.
      pill: "rounded-full",
    },
    // THE FILL STYLE (D336), painted only with the roles of the stamped tone, so every tone works with every style.
    // A soft or outline box in a colour tone is a status box: its border carries the meaning, so it paints `solid` and
    // holds the 3:1 non-text floor. The neutral tone carries no meaning and its solid is the page ink, so a neutral
    // box keeps the quiet edge.
    variant: {
      // The card fill with the tone's edge: the default island.
      surface: "border-tone-edge bg-card",
      // The tone's tint under its meaning edge, and its on-tint ink for content that sets no ink of its own: a status
      // box, a quoted block that reads as an artifact, a nested box that must lift off a card fill.
      soft: `${MEANING_EDGE} bg-tone-tint text-tone-text-on-tint`,
      // The meaning edge alone: a box that groups or marks without lifting off its ground.
      outline: `${MEANING_EDGE} bg-transparent`,
    },
    // Declared after `variant`, so a step-four surface's own fill wins the merge.
    tone: { ...TONE_ARMS, ...STEP_FOUR_SURFACES },
    // A set state marked on the card's leading edge (an override that differs from the default).
    rail: { none: "", primary: "border-s-2 border-s-primary" },
    artDecoration: ART_DECORATION,
    // The floating chip's and the preview islands' lift, until step four gives each its component. A static card takes
    // no shadow, an interactive one follows the user's elevation and an elevated one always lifts.
    shadow: { overlay: "shadow-overlay" },
    // The composer island's field-host states, until step four gives it `RoomIsland`: a card that holds a text field
    // takes its hover and focus lift on the opaque muted step and a focus edge in the ring colour held back in alpha,
    // and a card that takes dropped files announces the armed state (`data-drag-over`) louder than focus.
    holdsField: {
      true: "focus-within:border-ring/60 focus-within:bg-muted hover:border-input hover:bg-muted",
      false: "",
    },
    dropTarget: {
      true: "data-drag-over:border-primary data-drag-over:bg-muted data-drag-over:ring-2 data-drag-over:ring-ring",
      false: "",
    },
    // A floating chip that comes and goes with its state: shown, it rises into place; hidden, it sinks a row step,
    // fades out and takes no pointer, so it is never a phantom target.
    presence: {
      always: "",
      shown: "pointer-events-auto translate-y-0 opacity-100 transition-[opacity,translate] duration-(--motion-base) ease-out-expo",
      hidden: "pointer-events-none translate-y-row opacity-0 transition-[opacity,translate] duration-(--motion-base) ease-out-expo",
    },
    // The whole box at the receded step, fill and ink together: a box that stays readable but stands behind its siblings.
    receded: { true: RECEDED, false: "" },
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
        before:pointer-events-none before:absolute before:-inset-px before:-z-(--z-raised) before:rounded-[inherit] before:opacity-60 before:shadow-glow
        before:transition-opacity before:duration-(--motion-base) before:ease-out-expo before:content-['']
        hover:before:opacity-100
        data-returned:before:opacity-100
      `,
    },
    // The explicit floating-island opt-in (UI-Density-Law.md §2.1/§4.3): a modal/popover/composer-class
    // card that genuinely floats above the page. Its radius is re-declared unlayered in tiers.css so it
    // outranks the tier step inside a Surface; the shadow needs no such help (no tier rule touches it).
    elevated: {
      true: "rounded-card shadow-overlay",
      false: "",
    },
    // THE NESTED-ISLAND arm (CD2). An interactive island rendered INSIDE another box — a choices block inside a chat
    // bubble — must stay distinguishable, but the full Card treatment inside a box that already has
    // border+radius+fill is TWO complete boxes. This arm is the ruled single-axis separation: drop the border
    // entirely, step the radius one below the host's, and let the FILL alone carry the distinction (the caller
    // supplies it). The radius is re-declared unlayered in tiers.css for the same reason `elevated` is: a
    // `rounded-*` utility on the card loses to the tier rule inside a Surface.
    nested: {
      true: "rounded-inset border-0",
      false: "",
    },
    // The one padding arm: the island delegates its inset to its own content (a collapse row's trigger, so the
    // whole closed row is one tap target). `tier` is the resolved tier step; a feature never picks a value.
    // The `p-0` utility loses to the tier rule inside a Surface, so `data-padding` re-declares it in tiers.css.
    padding: {
      tier: "",
      none: "p-0",
    },
    // An operable card follows the user's elevation and takes the tone's pressed tint on hover and press.
    interactive: {
      true: `
        cursor-pointer transition-colors duration-(--motion-fast) ease-out-expo
        hover:bg-tone-tint-active hover:text-tone-text-on-tint
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
    holdsField: false,
    dropTarget: false,
    glow: "none",
    rail: "none",
    presence: "always",
    receded: false,
    focusable: false,
  },
});

/** The D336 scope a card stamps: its tone, or the neutral scope for a step-four surface that paints its own fill. */
export function cardTone(tone: keyof typeof cardVariants.variants.tone | undefined): Tone {
  return tone !== undefined && isTone(tone) ? tone : "neutral";
}
