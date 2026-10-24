import { DISABLED_STATE, FIELD_CONTROL, FIELD_CONTROL_BOX, FOCUS_RING, ITEM_ROW, OVERLAY_ARROW, OVERLAY_MOTION, POPUP_SURFACE, SCRIM, tv } from "#lib";

// Trigger in-flow; positioner/popup portaled. --available-height/--anchor-width are Base UI Positioner-provided vars.
export const selectVariants = tv({
  slots: {
    label: "text-label leading-label font-medium text-foreground data-disabled:opacity-50",
    trigger: [
      "flex cursor-pointer items-center justify-between gap-row select-none",
      "transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent",
      "outline-none",
      FOCUS_RING,
      DISABLED_STATE,
    ],
    // The selected-value text stays ONE line (the app-wide single-line trigger convention) — `min-w-0` lets the
    // flex child shrink so `truncate` can ellipsize a long option label instead of wrapping to two lines.
    value: "truncate text-start min-inline-0",
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
    itemLabel: "group-data-disabled/select-item:opacity-50",
    // The SAME spelling `option-strip` uses for its description slot — one look for "the secondary line
    // of an option row", whichever listbox renders it. Deliberately NOT truncated: a mode's gloss is the
    // reason to pick it, so it wraps at the popup's width instead. `contain-inline-size` keeps it out of the
    // popup's intrinsic width: the labels and the trigger size the popup, and the description fills what they
    // give it, so a one-line gloss cannot stretch the popup over the transcript.
    itemDescription: "text-label leading-label text-muted-foreground contain-inline-size",
    itemIndicator: "flex shrink-0 text-primary",
    arrow: OVERLAY_ARROW,
    separator: "-mx-field my-field bg-border block-px",
    backdrop: SCRIM("popover"),
    scrollArrow: "sticky z-(--z-raised) flex cursor-default items-center justify-center bg-popover text-muted-foreground block-section inline-full",
  },
  variants: {
    // THE TRIGGER'S SCALE (the Input `layout` twin — same axis name, same two arms). `field` is the form
    // control: the full FIELD_CONTROL chrome at the sealed control height. `inline` is the IDENTITY-LINE
    // trigger — a name/datum that happens to open a menu, so it wears the text itself (content width,
    // text-height, no box) and the popup is the affordance.
    //
    // Both arms live here rather than at the call site because the chrome they swap is custom-token
    // (`h-(--size-control-sm)`, `px-block`): twMerge cannot classify those, so an override neither wins nor loses
    // deterministically — the shipped site wrote `!h-auto !w-auto !px-field` to force the cascade. Same law
    // as Button `size`/TabsTab `layout`.
    layout: {
      field: { trigger: [FIELD_CONTROL, "block-(--size-control-sm)"] },
      inline: { trigger: [FIELD_CONTROL_BOX, "border-transparent bg-transparent px-field py-0 text-label leading-label block-auto inline-auto min-block-0"] },
    },
  },
  defaultVariants: { layout: "field" },
});
