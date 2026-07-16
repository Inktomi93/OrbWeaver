import { FOCUS_RING_WITHIN, OVERLAY_MOTION, tv } from "#lib";

// The autocomplete skin — the InputGroup carries the text-input token box (border/bg/height) so the
// native Clear button can sit flush inside it; the input fills the box transparently. The popup rides
// bg-popover + z-(--z-popover) (the stacking contract), items meet the touch floor and highlight on
// bg-accent. --available-height/--anchor-width are Base UI Positioner-provided vars, not raw values.
export const autocompleteVariants = tv({
  slots: {
    inputGroup: [
      "relative flex h-control-sm w-full min-w-0 items-center rounded-control border border-border bg-input",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      FOCUS_RING_WITHIN,
      "has-data-disabled:pointer-events-none has-data-disabled:opacity-50",
    ],
    input: ["h-full w-full min-w-0 flex-1 bg-transparent px-block text-body leading-body text-foreground", "placeholder:text-muted-foreground", "outline-none"],
    clear: [
      "mr-field flex size-control-sm shrink-0 items-center justify-center rounded-control text-muted-foreground outline-none",
      "hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
    ],
    positioner: "z-(--z-popover) outline-none",
    popup: [
      "z-(--z-popover) max-h-(--available-height) w-(--anchor-width) overflow-y-auto rounded-card border border-border bg-popover p-field text-popover-foreground",
      // Enter/exit fade+scale from the anchor — matches popover/menu/tooltip/select (the shared
      // overlay animation contract). `--transform-origin` is Base UI Positioner-provided.
      OVERLAY_MOTION.anchoredPopup,
    ],
    // Base UI positions the arrow against the anchor and sets data-side; skinned as a `bg-popover`
    // diamond that continues the popup edge (mirrors PopoverArrow/MenuArrow/SelectArrow).
    arrow: "size-row rotate-45 border border-border bg-popover",
    list: "flex flex-col gap-field",
    group: "flex flex-col gap-field",
    groupLabel: "px-block py-field text-label leading-label font-semibold text-muted-foreground",
    item: [
      "flex min-h-touch-target cursor-pointer select-none items-center rounded-control px-block py-field text-body leading-body text-foreground outline-none",
      "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
    ],
    empty: "px-block py-field text-body leading-body text-muted-foreground",
    // The SR live region is visually collapsed (screen-reader only) — it announces the result count
    // politely; it must stay mounted (Base UI: never `hidden`/`display:none` the Status element).
    status: "sr-only",
  },
});
