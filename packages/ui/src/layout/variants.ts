// layout/ is the gate-allowlisted home that DEFINES the spacing-intent mapping; features consume the variants.
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
  base: `inline-flex h-control-sm min-w-control-sm select-none items-center justify-center gap-field rounded-control text-foreground text-label hover:bg-accent focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 ${FOCUS_RING}`,
});

export const toolbarSeparatorVariants = tv({
  base: "w-px self-stretch bg-border",
});
