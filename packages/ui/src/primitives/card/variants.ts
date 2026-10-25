import { FOCUS_RING, MESSAGE_BUBBLE_BOX, MESSAGE_BUBBLE_FILL, RECEDED, SPOILER, tv } from "#lib";

// Card is a generic SURFACE, not a domain card — features (character cards, config panels)
// compose it (ui-package-design §6.1).
//
// The base padding + radius here are the TIER-LESS FALLBACK, nothing more: inside a `<Surface>` the
// unlayered `styles/tiers.css` map resolves both from the surface's tier (UI-Density-Law.md §4.2), so a
// feature never picks island padding or radius. `rounded-base` (grouped content), never `rounded-card` —
// D6 demoted `--radius-card` to ELEVATED/floating islands only, which is what `elevated` opts into.
export const cardVariants = tv({
  base: "rounded-base border border-border bg-card p-block text-card-foreground",
  variants: {
    // THE BOX SHAPE: a bordered, rounded, filled Row or Stack is a Card. `island` is grouped
    // content inside a surface. `row` is one operable or listed row drawn as its own box (a pack item, a mini
    // preview row): the control radius, because you operate it. `well` is a recess inside a box: no border, a muted
    // fill, the control radius, so it reads as part of its host and not a second box (CD2). Declared before `tone`
    // so a tone's fill wins over the well's. The radius is re-declared in tiers.css, where the tier rule outranks it.
    shape: {
      island: "",
      row: "rounded-control",
      well: "rounded-control border-0 bg-muted",
      // An island that floats in a room's reading column (the composer, the band of controls above it): the card
      // radius and the field inset, with no shadow, because the room's art behind it is the lift.
      float: "rounded-card p-field",
      // A sub-control mark drawn as a box: a pane in a small preview of the shell.
      inset: "rounded-inset",
      // A plate under a line that crosses art (a transcript boundary's label): the fill alone, with no edge.
      plate: "border-0",
      // A floating chip (jump to latest): the pill radius.
      pill: "rounded-full",
      // A message bubble outside the transcript (a theme preview): the transcript's own bubble box. Pair it with a bubble tone.
      bubble: MESSAGE_BUBBLE_BOX,
    },
    tone: {
      neutral: "",
      // Border only: a box that groups without lifting off its ground.
      clear: "bg-transparent",
      background: "bg-background",
      accent: "bg-accent text-accent-foreground",
      // The rail's own fill and edge, for a box that previews or sits in the sidebar.
      sidebar: "border-sidebar-border bg-sidebar text-sidebar-foreground",
      // A card fill that lets a wallpaper or art read through it, and its page-ground twin.
      translucent: "bg-card/80",
      backdrop: "bg-background/80",
      // The edge a text field draws, for a box that groups field-like controls; no fill of its own.
      input: "border-input bg-transparent",
      bubble: MESSAGE_BUBBLE_FILL.assistant,
      userBubble: MESSAGE_BUBBLE_FILL.user,
      systemBubble: MESSAGE_BUBBLE_FILL.system,
      muted: "bg-muted",
      warning: "border-warning bg-warning/10 text-warning",
      info: "border-info bg-info/10 text-info",
      highlight: "border-highlight",
      // The status tints without the status ink: a verdict banner or a choices island whose own text and controls
      // keep their inks. The edge is held back so the tint carries the meaning.
      successTint: "border-success/40 bg-success/10",
      warningTint: "border-warning/40 bg-warning/10",
      destructiveTint: "border-destructive/40 bg-destructive/10",
      infoTint: "border-info/40 bg-info/10",
      // A card's one claim on attention spent as its edge, never a fill: the room's composer stays the one primary.
      primaryEdge: "border-primary/40",
      // A drop zone's outline in the primary ink, with no fill, so it reads as a place and not a second card.
      primaryOutline: "border-primary bg-transparent",
      // The muted fill held back: a block that quotes wire text inside a panel, so it reads as an artifact.
      mutedWash: "bg-muted/40",
      // The raised step, for a nested card that must lift off a card fill.
      raised: "bg-surface-raised",
      // The card fill with the rail's edge: a pane in a preview of the shell.
      sidebarEdge: "border-sidebar-border",
      // The popover fill and its ink, for a chip that floats over the transcript.
      popover: "bg-popover text-popover-foreground",
    },
    // A set state marked on the card's leading edge (an override that differs from the default).
    rail: { none: "", primary: "border-s-2 border-s-primary" },
    // The shadow. `follow` takes the user's elevation (the glow arm lifts every card); `none` refuses it, for a
    // diagram that draws one elevation whatever the user chose; `overlay` always lifts, for the diagram's islands.
    shadow: { follow: "in-data-[elevation=glow]:shadow-overlay", none: "", overlay: "shadow-overlay" },
    // A card that holds a text field takes its interaction: a hover and focus lift on the opaque muted step, and a
    // focus edge in the ring colour held back in alpha.
    holdsField: {
      true: "focus-within:border-ring/60 focus-within:bg-muted hover:border-input hover:bg-muted",
      false: "",
    },
    // A floating chip that comes and goes with its state: shown, it rises into place; hidden, it sinks a row step,
    // fades out and takes no pointer, so it is never a phantom target.
    presence: {
      always: "",
      shown: "pointer-events-auto translate-y-0 opacity-100 transition-[opacity,translate] duration-(--motion-base) ease-out-expo",
      hidden: "pointer-events-none translate-y-row opacity-0 transition-[opacity,translate] duration-(--motion-base) ease-out-expo",
    },
    spoiler: { true: SPOILER, false: "" },
    // The whole box at the receded step, fill and ink together: a box that stays readable but stands behind its siblings.
    receded: { true: RECEDED, false: "" },
    // A region that takes programmatic focus (a `tabIndex={-1}` editor a list hands focus to) draws the focus ring.
    focusable: { true: `outline-none ${FOCUS_RING}`, false: "" },
    // A card that takes dropped files announces the armed state (`data-drag-over`) louder than focus.
    dropTarget: {
      true: "data-drag-over:border-primary data-drag-over:bg-muted data-drag-over:ring-2 data-drag-over:ring-ring",
      false: "",
    },
    outline: { solid: "", dashed: "border-dashed" },
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
    // The one padding arm: the island delegates its inset to its own content (a collapse row's trigger, so the
    // whole closed row is one tap target). `tier` is the resolved tier step; a feature never picks a value.
    // The `p-0` utility loses to the tier rule inside a Surface, so `data-padding` re-declares it in tiers.css.
    padding: {
      tier: "",
      none: "p-0",
    },
    interactive: {
      true: `cursor-pointer transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent focus-visible:outline-none active:bg-accent/80 ${FOCUS_RING}`,
      false: "",
    },
  },
  defaultVariants: {
    shape: "island",
    elevated: false,
    interactive: false,
    nested: false,
    padding: "tier",
    tone: "neutral",
    outline: "solid",
    glow: "none",
    rail: "none",
    shadow: "follow",
    holdsField: false,
    dropTarget: false,
    presence: "always",
    spoiler: false,
    receded: false,
    focusable: false,
  },
});
