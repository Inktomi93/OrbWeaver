import {
  CAPTION,
  COLOR_MOTION,
  CONTROL_BLOCK,
  CONTROL_MIN_BLOCK,
  DISABLED_STATE,
  FIELD_CONTROL,
  FIELD_CONTROL_BOX,
  FIELD_LABEL,
  FLOOR,
  FOCUS_RING,
  ITEM_ROW,
  OVERLAY_ARROW,
  OVERLAY_MOTION,
  POPUP_SURFACE,
  SCRIM,
  TOUCH_TARGET_PSEUDO_STRETCH,
  tv,
} from "#lib";

// The chrome of a trigger that holds a wrapping value: the field box with its inline padding and the gap to the chevron held by the picker tokens,
// so enlarged text on a phone grows the value and not the chrome. The step is a floor (the `LABEL_BOX` shape) and the block inset is the air the
// step leaves around one line (the `select-air` tokens): a one-line value lands exactly on the step, and a wrapped value keeps that air against the
// border instead of touching it.
const WRAPPING_TRIGGER = [FIELD_CONTROL, "gap-(--spacing-picker-gap) px-(--spacing-picker-inset) block-fit"];

// Trigger in-flow; positioner/popup portaled. --available-height/--anchor-width are Base UI Positioner-provided vars.
export const selectVariants = tv({
  slots: {
    label: `${FIELD_LABEL} data-disabled:opacity-disabled`,
    trigger: [
      "flex cursor-pointer items-center justify-between gap-row select-none",
      `${COLOR_MOTION} hover:bg-accent`,
      "outline-none",
      FOCUS_RING,
      DISABLED_STATE,
    ],
    // The selected value is what the reader chose the control for, so it is never cut: a value past the trigger's room wraps between its
    // words and the trigger grows from its step. `min-inline-0` lets the flex child shrink to the trigger's width, so only a word wider
    // than the room breaks inside itself.
    value: "text-start wrap-break-word whitespace-normal min-inline-0",
    icon: "flex shrink-0 text-muted-foreground",
    positioner: "z-(--z-popover) outline-none",
    // Never narrower than the anchor, and grows to fit the longest LABEL. Descriptions do not size it (see
    // `itemDescription`). The growth's two max-width ceilings (Base UI's collision width + the reading measure)
    // intersect in select.tsx's POPUP_STYLE because two competing max-width utilities would merge to one.
    popup: [POPUP_SURFACE, "min-inline-(--anchor-width)", OVERLAY_MOTION.anchoredPopup],
    group: "flex flex-col",
    groupLabel: "px-block py-field text-label leading-label font-medium text-muted-foreground select-none",
    // A disabled option dims its LABEL only (`itemLabel`): the description is the one place that says why it
    // is disabled, so the row itself keeps full opacity.
    item: [ITEM_ROW, "group/select-item justify-between gap-row data-disabled:opacity-100"],
    // An option that carries a `description` stacks label-over-gloss; the column keeps the check
    // indicator centred against the pair instead of against a single line.
    // `flex-1` gives the body the row's full width: a description that does not size the popup must still be
    // laid out across it, or it wraps at its label's width.
    itemBody: "flex flex-1 flex-col min-inline-0",
    itemLabel: "group-data-disabled/select-item:opacity-disabled",
    // The SAME spelling `option-strip` uses for its description slot — one look for "the secondary line
    // of an option row", whichever listbox renders it. Deliberately NOT truncated: a mode's gloss is the
    // reason to pick it, so it wraps at the popup's width instead. `contain-inline-size` keeps it out of the
    // popup's intrinsic width: the labels and the trigger size the popup, and the description fills what they
    // give it, so a one-line gloss cannot stretch the popup over the transcript.
    itemDescription: `${CAPTION} contain-inline-size`,
    itemIndicator: "flex shrink-0 text-primary",
    arrow: OVERLAY_ARROW,
    separator: "-mx-field my-field bg-border block-px",
    backdrop: SCRIM("popover"),
    scrollArrow: "sticky z-(--z-raised) flex cursor-default items-center justify-center bg-popover text-muted-foreground block-section inline-full",
  },
  variants: {
    // THE CONTROL SCALE (D336): the step's height, so a field sits level with the buttons and toggles of its row. The
    // type stays the field's own pointer-conditional step at every size, because iOS zooms on a smaller focused field.
    size: {
      chip: { trigger: CONTROL_BLOCK.chip },
      sm: { trigger: CONTROL_BLOCK.sm },
      md: { trigger: CONTROL_BLOCK.md },
      lg: { trigger: CONTROL_BLOCK.lg },
    },
    // THE TRIGGER'S LAYOUT, declared after `size` (the Input `layout` twin — same axis name; Input has no `hug`). `field` is the form
    // control: the full FIELD_CONTROL chrome at the control step, growing from it when its value wraps. `hug` is that chrome at its
    // value's width.
    // `inline` is the IDENTITY-LINE trigger — a name/datum that happens to open a menu, so it wears the text itself
    // (content width, text-height, no box) and the popup is the affordance.
    //
    // The arms live here rather than at the call site because the chrome they swap is custom-token
    // (`h-(--size-control-sm)`, `px-block`): twMerge cannot classify those, so an override neither wins nor loses
    // deterministically — the shipped site wrote `!h-auto !w-auto !px-field` to force the cascade. Same law
    // as Button `size`/TabsTab `layout`.
    layout: {
      field: { trigger: WRAPPING_TRIGGER },
      // The field chrome at the width of its value, for a sort or filter beside a search box that a full-width trigger would crush.
      hug: { trigger: [WRAPPING_TRIGGER, "inline-auto"] },
      // Text-height at every pointer; the touch floor is the layout-neutral hit area `InlineAction` carries.
      inline: {
        trigger: [
          FIELD_CONTROL_BOX,
          "relative border-transparent bg-transparent px-field py-0 text-label leading-label block-auto inline-auto min-block-0",
          TOUCH_TARGET_PSEUDO_STRETCH,
        ],
      },
    },
    // A trigger whose value is the name of the thing the line is about (an rpg subject): the name's semibold weight.
    strong: { true: { trigger: "font-semibold" } },
  },
  // A form-control trigger's height is the size step's floor, so only a value on more than one line grows it, and its block inset is the air that
  // step leaves around a line.
  compoundVariants: [
    { layout: ["field", "hug"], size: "chip", class: { trigger: [CONTROL_MIN_BLOCK.chip, "py-(--spacing-select-air-chip)"] } },
    { layout: ["field", "hug"], size: "sm", class: { trigger: [CONTROL_MIN_BLOCK.sm, "py-(--spacing-select-air-sm)"] } },
    { layout: ["field", "hug"], size: "md", class: { trigger: [CONTROL_MIN_BLOCK.md, "py-(--spacing-select-air-md)"] } },
    { layout: ["field", "hug"], size: "lg", class: { trigger: [CONTROL_MIN_BLOCK.lg, "py-(--spacing-select-air-lg)"] } },
  ],
  defaultVariants: { size: "sm", layout: "field" },
});

export const selectBoxVariants = tv({
  variants: {
    floor: FLOOR,
  },
});
