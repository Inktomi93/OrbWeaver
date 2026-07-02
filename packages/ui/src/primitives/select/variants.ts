import { tv } from "tailwind-variants";

// The select skin — slots across the sealed anatomy (trigger in-flow; positioner/popup portaled).
// Popup rides bg-popover + z-(--z-overlay) (the stacking contract); items meet the touch floor.
// --available-height/--anchor-width are Base UI Positioner-provided vars, not raw values.
export const select = tv({
  slots: {
    trigger: [
      "flex h-control-sm w-full min-w-0 cursor-pointer select-none items-center justify-between gap-row rounded-control border border-border bg-input px-block text-body leading-body text-foreground",
      "transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent",
      "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
    ],
    icon: "flex shrink-0 text-muted-foreground",
    positioner: "z-(--z-overlay) outline-none",
    popup: [
      "z-(--z-overlay) max-h-(--available-height) min-w-(--anchor-width) overflow-y-auto rounded-card border border-border bg-popover p-field text-popover-foreground",
    ],
    // A grouped section — Base UI Select.Group; the label sits above its items.
    group: "flex flex-col",
    groupLabel:
      "px-block py-field text-label font-medium leading-label text-muted-foreground select-none",
    item: [
      "flex min-h-touch-target cursor-pointer select-none items-center justify-between gap-row rounded-control px-block py-field text-body leading-body text-foreground outline-none",
      "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
    ],
    itemIndicator: "flex shrink-0 text-primary",
    // Sticky hover-to-scroll affordances for long lists — Base UI ScrollUp/DownArrow. They only
    // mount when the popup overflows and are suppressed on touch input (Base UI behavior).
    scrollArrow:
      "sticky z-(--z-raised) flex h-section w-full cursor-default items-center justify-center bg-popover text-muted-foreground",
  },
});
