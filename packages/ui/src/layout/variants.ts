// layout/ is the gate-allowlisted home that DEFINES the spacing-intent mapping; features consume the variants.
import { DISABLED_STATE_NATIVE, FOCUS_RING, tv } from "#lib";

const GAP = {
  // The small-end step (density-pass-spec.md §2.2/D2): ATOM gaps inside an island — label↔bar,
  // glyph↔text, value↔caption. Below `field`; not a surface/block rhythm, so it has no PADDING twin.
  tight: "gap-tight",
  field: "gap-field",
  row: "gap-row",
  block: "gap-block",
  section: "gap-section",
  gutter: "gap-gutter",
} as const;

const PADDING = {
  field: "p-field",
  row: "p-row",
  block: "p-block",
  section: "p-section",
  gutter: "p-gutter",
} as const;

const ALIGN = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
  baseline: "items-baseline",
} as const;

const JUSTIFY = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
} as const;

export const stackVariants = tv({
  base: "flex flex-col",
  variants: { gap: GAP, align: ALIGN, justify: JUSTIFY, padding: PADDING },
});

export const rowVariants = tv({
  base: "flex flex-row items-center",
  variants: { gap: GAP, align: ALIGN, justify: JUSTIFY, padding: PADDING },
});

// No external `py` — a Section pads its own content but leaves between-section spacing to the
// container's `gap` (padding-as-margin double-counts against gap). Space sections via Stack/Grid gap.
export const sectionVariants = tv({
  slots: {
    root: "flex flex-col gap-block",
    heading: "font-medium text-foreground text-title leading-title",
    // inline-flex so the hint trigger sits on the heading's baseline instead of dropping to its own line
    // (mirrors the Field label/hint row, field/variants.ts).
    headingRow: "inline-flex items-center gap-field",
    // The KICKER band (density-pass-spec.md §2.3/§4.3): a caps micro label + a hairline rule running to the
    // edge. This is the CD1 replacement for a box — a read-only grouping gets a name and a rule, never a
    // border+radius+bg. The type itself is the `kicker` VOICE on a real <Heading> (one spelling, in
    // text/variants.ts); only the band's layout lives here.
    kickerRow: "flex items-center gap-field",
    hintTrigger: "text-muted-foreground hover:text-foreground",
  },
  variants: {
    // A hairline under the section heading — reads as a header edge over its rows, not a floating label.
    divider: {
      true: { heading: "border-border border-b pb-field" },
    },
  },
});

/** Responsive auto-fit columns: children tile as many columns as fit at the min width, then reflow down to one. */
export const gridVariants = tv({
  base: "grid",
  variants: {
    gap: GAP,
    cols: {
      auto: "grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))]",
      wide: "grid-cols-[repeat(auto-fit,minmax(min(22rem,100%),1fr))]",
      // Dense compact tiles (the OSRS stat-cell / attribute grid, Context-Panel-Program §3.2): a narrow
      // min so the CONTEXT panel tiles stat cells 2-up at the 17rem floor, 3-up when it has room.
      tile: "grid-cols-[repeat(auto-fit,minmax(min(5rem,100%),1fr))]",
      // Item-cell density (panel-redesign §5 — the pack grid). The 3.5rem SQUARE this used to be tiled 5-up
      // but carried only a 20px glyph inside a 59px card: mostly empty box, with the item's location
      // truncated to "belt p…" and the ×N a lost corner digit (owner dogfood, 2026-07-31). An 8.5rem min
      // tiles 2-up at the 320px mobile column and 3-up in the 480px docked CONTEXT panel, at a card SHORTER
      // than the old square — the wasted space goes and the datum (name · ×N · where it's kept) fits.
      cell: "grid-cols-[repeat(auto-fit,minmax(min(8.5rem,100%),1fr))]",
      // A DELIBERATE TWO-COLUMN ROW whose second column is NOT optional (the preset drill-ins' DELIVERY and
      // PLACEMENT rows — role beside depth, zone beside order). Every other arm here is auto-FIT, which
      // COLLAPSES a track holding no item: a conditionally-rendered second field (O-9's depth/order, absent
      // on the Relative arm) therefore doubles the surviving control's width the instant it disappears, and
      // the row re-flows under a field the user never touched. Two explicit halves hold the same geometry in
      // BOTH arms. The container query — not a viewport breakpoint — stacks them back to one column in a
      // narrow pane, so the row answers to the pane it lives in; an ancestor `<Container>` is required
      // (an element cannot query itself).
      pair: "grid-cols-1 @md:grid-cols-2",
    },
  },
  defaultVariants: { cols: "auto" },
});

/** `size` must stay on the `--container-cq-*` token scale, never raw widths. */
export const containerVariants = tv({
  base: "@container",
  variants: {
    size: { sm: "max-w-cq-sm", md: "max-w-cq-md", lg: "max-w-cq-lg" },
  },
});

export const toolbarVariants = tv({
  base: "flex h-control-md flex-row items-center gap-row px-block",
});

// Meets the touch floor via h-control-sm, pointer-conditional (44px coarse/unknown, 32px fine).
export const toolbarButtonVariants = tv({
  base: `inline-flex h-control-sm min-w-control-sm select-none items-center justify-center gap-field rounded-control text-foreground text-label hover:bg-accent focus-visible:outline-none ${DISABLED_STATE_NATIVE} ${FOCUS_RING}`,
});

export const toolbarSeparatorVariants = tv({
  base: "w-px self-stretch bg-border",
});
