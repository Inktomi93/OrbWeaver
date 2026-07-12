// @orb/ui/layout variants — the intent-token mapping layer (UI-Arch §4; ui-package-design §6.1).
// layout/ is the gate-allowlisted home that DEFINES the spacing-intent mapping: gap/padding variant
// unions here are the ONLY place the intent scale is written; features consume the variants.
import { FOCUS_RING, tv } from "#lib";

const GAP = {
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

/** `<Stack>` skin (UI-Arch §4). */
export const stackVariants = tv({
  base: "flex flex-col",
  variants: { gap: GAP, align: ALIGN, justify: JUSTIFY, padding: PADDING },
});

/** `<Row>` skin (UI-Arch §4). */
export const rowVariants = tv({
  base: "flex flex-row items-center",
  variants: { gap: GAP, align: ALIGN, justify: JUSTIFY, padding: PADDING },
});

/** `<Section>` skin (ui-package-design §6.1). NO external `py` — a Section pads its OWN content
 *  (heading + `gap-block` between fields) but leaves BETWEEN-section spacing to the container's `gap`
 *  (the flex/grid model — padding-as-margin double-counts against `gap`, which floated sections apart
 *  with a weird gap in the settings grid). Space sections via `<Stack gap>` / `<Grid gap>`, not here. */
export const sectionVariants = tv({
  slots: {
    root: "flex flex-col gap-block",
    heading: "font-medium text-foreground text-title leading-title",
  },
  variants: {
    // A hairline under the section heading (UIP-404 settings panes): the heading reads as a header edge
    // over its rows, not a floating label. Opt-in — default sections are unchanged.
    divider: {
      true: { heading: "border-border border-b pb-field" },
    },
  },
});

/**
 * `<Grid>` skin — responsive AUTO-FIT columns: children tile into as many columns as fit at the min
 * column width, then reflow as space shrinks (down to one). No fixed column count, so adding/removing/
 * reordering items just reflows — the "content fills and sorts" layout for settings-style panes. The
 * arbitrary track template lives HERE (layout/ is the gate-allowlisted home for structural values, the
 * same exemption `no-raw-spacing` grants); `min(…,100%)` stops a wide min from overflowing a narrow pane.
 */
export const gridVariants = tv({
  base: "grid",
  variants: {
    gap: GAP,
    cols: {
      auto: "grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))]",
      wide: "grid-cols-[repeat(auto-fit,minmax(min(22rem,100%),1fr))]",
    },
  },
  defaultVariants: { cols: "auto" },
});

/**
 * `<Container>` skin. `size` must stay on the `--container-cq-*` token scale, never raw widths
 * (gate no-raw-container-widths).
 */
export const containerVariants = tv({
  base: "@container",
  variants: {
    size: { sm: "max-w-cq-sm", md: "max-w-cq-md", lg: "max-w-cq-lg" },
  },
});

/** `<Toolbar>` skin — Base UI Toolbar root dressed as a Row (ui-package-design §10.6). */
export const toolbarVariants = tv({
  base: "flex h-control-md flex-row items-center gap-row px-block",
});

/**
 * `<ToolbarButton>` skin — meets the touch floor via h-control-sm, POINTER-CONDITIONAL per D62 P1
 * (44px at coarse/unknown pointers, 32px at fine — the `control-sm` token's own `@media(pointer:fine)`
 * override, gate touch-target-floor, UI-Arch §4b axis 3); the full button skin belongs to
 * primitives/button, composed via the Base UI `render` prop.
 */
export const toolbarButtonVariants = tv({
  base: `inline-flex h-control-sm min-w-control-sm select-none items-center justify-center gap-field rounded-control text-foreground text-label hover:bg-accent focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 ${FOCUS_RING}`,
});

export const toolbarSeparatorVariants = tv({
  base: "w-px self-stretch bg-border",
});
