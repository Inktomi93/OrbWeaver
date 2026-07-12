import { FOCUS_RING, OVERLAY_MOTION, tv } from "#lib";

// The select skin — slots across the sealed anatomy (trigger in-flow; positioner/popup portaled).
// Popup rides bg-popover + z-(--z-popover) (the stacking contract); items meet the touch floor.
// --available-height/--anchor-width are Base UI Positioner-provided vars, not raw values.
export const selectVariants = tv({
  slots: {
    // Base UI Select.Label — an accessible label auto-associated with the trigger (standalone use;
    // a <Field> wrapping the Select gets the same wiring via FieldRootContext instead).
    label: "text-label font-medium leading-label text-foreground data-disabled:opacity-50",
    trigger: [
      "flex h-control-sm w-full min-w-0 cursor-pointer select-none items-center justify-between gap-row rounded-control border border-border bg-input px-block text-body leading-body text-foreground",
      "transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent",
      "outline-none",
      FOCUS_RING,
      "data-disabled:pointer-events-none data-disabled:opacity-50",
    ],
    icon: "flex shrink-0 text-muted-foreground",
    positioner: "z-(--z-popover) outline-none",
    popup: [
      "z-(--z-popover) max-h-(--available-height) min-w-(--anchor-width) overflow-y-auto rounded-card border border-border bg-popover p-field text-popover-foreground",
      // Enter/exit fade+scale from the anchor — matches popover/menu/tooltip (the shared overlay
      // animation contract). `--transform-origin` is Base UI Positioner-provided (scale grows from
      // the trigger edge, not center).
      OVERLAY_MOTION.anchoredPopup,
    ],
    group: "flex flex-col",
    groupLabel:
      "px-block py-field text-label font-medium leading-label text-muted-foreground select-none",
    item: [
      "flex min-h-touch-target cursor-pointer select-none items-center justify-between gap-row rounded-control px-block py-field text-body leading-body text-foreground outline-none",
      "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
    ],
    itemIndicator: "flex shrink-0 text-primary",
    // Base UI positions the arrow against the anchor and sets data-side; skinned as a `bg-popover`
    // diamond that continues the popup edge (mirrors PopoverArrow/MenuArrow).
    arrow: "size-row rotate-45 border border-border bg-popover",
    // Between-group divider — Base UI Select.Separator (role="separator"); bleeds to the popup edge.
    separator: "-mx-field my-field h-px bg-border",
    // Opt-in dimming layer for the modal-by-default select (theme-aware scrim, never black/50).
    // Fades on enter/exit like every sibling scrim (menu/popover/dialog/alert-dialog) — this one
    // used to hard-cut (the C6 rollup-audit drift).
    backdrop: `fixed inset-0 z-(--z-popover) bg-scrim ${OVERLAY_MOTION.backdropFade("fast")}`,
    // Sticky hover-to-scroll affordances for long lists — Base UI ScrollUp/DownArrow. They only
    // mount when the popup overflows and are suppressed on touch input (Base UI behavior).
    scrollArrow:
      "sticky z-(--z-raised) flex h-section w-full cursor-default items-center justify-center bg-popover text-muted-foreground",
  },
});
