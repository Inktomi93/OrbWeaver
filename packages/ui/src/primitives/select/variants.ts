import { FOCUS_RING, OVERLAY_MOTION, tv } from "#lib";

// Trigger in-flow; positioner/popup portaled. --available-height/--anchor-width are Base UI Positioner-provided vars.
export const selectVariants = tv({
  slots: {
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
    arrow: "size-row rotate-45 border border-border bg-popover",
    separator: "-mx-field my-field h-px bg-border",
    backdrop: `fixed inset-0 z-(--z-popover) bg-scrim ${OVERLAY_MOTION.backdropFade("fast")}`,
    scrollArrow:
      "sticky z-(--z-raised) flex h-section w-full cursor-default items-center justify-center bg-popover text-muted-foreground",
  },
});
