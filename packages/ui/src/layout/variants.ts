// @orb/ui/layout variants — the intent-token mapping layer (UI-Arch §4; ui-package-design §6.1).
// layout/ is the gate-allowlisted home that DEFINES the spacing-intent mapping: gap/padding variant
// unions here are the ONLY place the intent scale is written; features consume the variants.
import { tv } from "tailwind-variants";

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

/** `<Stack>` skin — vertical flex on the intent-token spacing scale (UI-Arch §4). */
export const stackVariants = tv({
  base: "flex flex-col",
  variants: { gap: GAP, align: ALIGN, justify: JUSTIFY, padding: PADDING },
});

/** `<Row>` skin — horizontal flex, items centered by default (UI-Arch §4). */
export const rowVariants = tv({
  base: "flex flex-row items-center",
  variants: { gap: GAP, align: ALIGN, justify: JUSTIFY, padding: PADDING },
});

/** `<Section>` skin — block-spacing wrapper (py-section) with a heading slot (ui-package-design §6.1). */
export const sectionVariants = tv({
  slots: {
    root: "flex flex-col gap-block py-section",
    heading: "font-medium text-foreground text-title leading-title",
  },
});

/**
 * `<Container>` skin — the containment provider. The Tailwind v4 `@container` utility applies
 * `container-type: inline-size` (UI-Arch §4: layout/ OWNS container-type). `size` constrains the
 * container to the named container-breakpoint token scale (`--container-cq-*` — never raw widths;
 * gate no-raw-container-widths).
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
 * `<ToolbarButton>` skin — a minimal roving-tabindex item. Meets the ≥44px touch floor via
 * h-control-sm (gate touch-target-floor, UI-Arch §4b axis 3); the full button skin belongs to
 * primitives/button — compose it via the Base UI `render` prop.
 */
export const toolbarButtonVariants = tv({
  base: "inline-flex h-control-sm min-w-control-sm select-none items-center justify-center gap-field rounded-control text-foreground text-label hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
});

/** `<ToolbarSeparator>` skin — a vertical rule between toolbar groups. */
export const toolbarSeparatorVariants = tv({
  base: "w-px self-stretch bg-border",
});
