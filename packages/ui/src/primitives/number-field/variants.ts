import type { ControlSize } from "#lib";
import {
  COLOR_MOTION,
  CONTROL_BLOCK,
  CONTROL_INLINE,
  CONTROL_SIZES,
  DISABLED_STATE,
  DISABLED_STATE_NATIVE,
  FIELD_STACK,
  FOCUS_RING_INSET,
  TOUCH_TARGET_PSEUDO,
  tv,
} from "#lib";

// The group is the field's box at the step's height; the steppers are the step's width and fill its height, and rings go
// inset because a stepper sits flush against the group's edge. Inside the group's 1px edge a child is 2px short of the
// step, which at the `sm` step under a finger is under the tap floor. So the input and both steppers span the edge
// themselves with a negative block margin, and the hover fill of a stepper paints over the edge it covers. The group does
// not clip its children for that reason: the steppers and the stepper-less input round their own outer corners.

// Below the cq-12 step the stepped field's three parts do not fit one line (a phone column at 300% text is under 8rem), so
// the steppers take a line of their own under the input: a two-track grid with the input spanning both, each part a full
// step tall and no longer pulled over the group's edge. Each class is a whole literal so Tailwind's scanner sees it.
const STACKED_ROW = {
  chip: "@max-cq-12:block-(--size-touch-target)",
  sm: "@max-cq-12:block-(--size-control-sm)",
  md: "@max-cq-12:block-(--size-control-md)",
  lg: "@max-cq-12:block-(--size-control-lg)",
} as const satisfies Record<ControlSize, string>;
const STACKED_STEPPER = "@max-cq-12:my-0 @max-cq-12:inline-auto @max-cq-12:border-bs";

export const numberFieldVariants = tv({
  slots: {
    root: `${FIELD_STACK} ${DISABLED_STATE}`,
    scrubArea: "flex cursor-ew-resize items-center gap-row text-label leading-label font-medium text-muted-foreground select-none inline-fit",
    scrubCursor: "flex text-foreground",
    group: ["flex items-stretch rounded-control border border-input-border bg-field-fill inline-full", "data-invalid:border-destructive"],
    decrement: [
      `
        group relative -my-(--border-width-control) flex shrink-0 cursor-pointer items-center justify-center rounded-s-control border-e border-input-border
        text-foreground select-none
        ${TOUCH_TARGET_PSEUDO}
      `,
      `
        ${COLOR_MOTION}
        hover:bg-tone-tint hover:text-tone-text-on-tint
        active:bg-tone-tint-active active:text-tone-text-on-tint
      `,
      `outline-none ${FOCUS_RING_INSET}`,
      `${DISABLED_STATE_NATIVE} ${DISABLED_STATE}`,
      "data-readonly:cursor-default",
    ],
    input: [
      "-my-(--border-width-control) bg-transparent text-foreground tabular-nums inline-full min-inline-(--size-control-md)",
      "placeholder:text-muted-foreground",
      `outline-none ${FOCUS_RING_INSET}`,
      DISABLED_STATE,
      "data-invalid:text-destructive",
    ],
    increment: [
      `
        group relative -my-(--border-width-control) flex shrink-0 cursor-pointer items-center justify-center rounded-e-control border-s border-input-border
        text-foreground select-none
        ${TOUCH_TARGET_PSEUDO}
      `,
      `
        ${COLOR_MOTION}
        hover:bg-tone-tint hover:text-tone-text-on-tint
        active:bg-tone-tint-active active:text-tone-text-on-tint
      `,
      `outline-none ${FOCUS_RING_INSET}`,
      `${DISABLED_STATE_NATIVE} ${DISABLED_STATE}`,
      "data-readonly:cursor-default",
    ],
    // The bounds sentence is SR-only: it replaces the aria-valuemin/max a textbox can't carry, and the
    // visible range affordance is the field's own `<Field description>` copy, not a second line here.
    boundsDescription: "sr-only",
    stepIcon: "group-data-readonly:hidden",
    stepReadOnlyIcon: "hidden group-data-readonly:block",
  },
  variants: {
    // THE CONTROL SCALE (D336): the group's height and each stepper's width, so the field sits level with the buttons,
    // toggles and fields of its row. The input stretches to the group, so nothing else here may set a height.
    size: {
      chip: { group: CONTROL_BLOCK.chip, decrement: CONTROL_INLINE.chip, increment: CONTROL_INLINE.chip },
      sm: { group: CONTROL_BLOCK.sm, decrement: CONTROL_INLINE.sm, increment: CONTROL_INLINE.sm },
      md: { group: CONTROL_BLOCK.md, decrement: CONTROL_INLINE.md, increment: CONTROL_INLINE.md },
      lg: { group: CONTROL_BLOCK.lg, decrement: CONTROL_INLINE.lg, increment: CONTROL_INLINE.lg },
    },
    // THE FIELD'S LAYOUT (the Input and Select `layout` twin). `field` is the full-width form field: a stepper-flanked
    // input with centered field type. `inline` is the knob-row twin: a stepper-less mono cell in `--width-number-inline`,
    // right-aligned so a column of knob values reads down one number edge, at the `code` type step because a slider's
    // number twin is a datum, not prose.
    layout: {
      field: {
        root: "inline-full",
        group: "@max-cq-12:grid @max-cq-12:grid-cols-2 @max-cq-12:block-auto",
        decrement: `${STACKED_STEPPER} @max-cq-12:rounded-ss-none`,
        input: "text-center text-field leading-field @max-cq-12:order-first @max-cq-12:col-span-2 @max-cq-12:my-0 @max-cq-12:rounded-t-control",
        increment: `${STACKED_STEPPER} @max-cq-12:rounded-se-none`,
      },
      inline: { root: "inline-(--width-number-inline)", input: "rounded-control px-field text-end font-mono text-code-field leading-code-field" },
      // The stepper-less click-to-edit twin of a promoted stat tile's value: centered, at the title step the rest datum wears.
      tile: { root: "inline-full", group: "block-auto min-block-0", input: "my-0 rounded-control px-field text-center text-title leading-title" },
    },
  },
  compoundVariants: CONTROL_SIZES.map((size) => ({
    size,
    layout: "field" as const,
    decrement: STACKED_ROW[size],
    input: STACKED_ROW[size],
    increment: STACKED_ROW[size],
  })),
  defaultVariants: { size: "sm", layout: "field" },
});
