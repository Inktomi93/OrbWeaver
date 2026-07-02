import { tv } from "tailwind-variants";

// The tabs skin — segmented list on bg-muted; the active marker is the sliding Indicator (bg-background)
// rather than a per-tab background, so it animates between tabs. Tabs ride h-control-sm (the ≥44px
// touch floor, §4b axis 3) and sit above the indicator via z-(--z-raised).
export const tabsVariants = tv({
  slots: {
    root: "flex w-full flex-col gap-block",
    list: "relative inline-flex w-fit items-center gap-field rounded-control bg-muted p-field",
    tab: [
      "relative z-(--z-raised) inline-flex h-control-sm cursor-pointer select-none items-center justify-center gap-field whitespace-nowrap rounded-control px-block text-label font-medium leading-label text-muted-foreground",
      "transition-colors duration-(--motion-fast) ease-out-expo hover:text-foreground",
      "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "data-active:text-foreground",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
    ],
    // The sliding active marker — positioned from Base UI's runtime --active-tab-* vars, behind the
    // tab text (z-(--z-base)). transition-all animates the slide as selection moves.
    indicator: [
      "absolute top-(--active-tab-top) left-(--active-tab-left) z-(--z-base) h-(--active-tab-height) w-(--active-tab-width) rounded-control bg-background",
      "transition-all duration-(--motion-base) ease-out-expo",
    ],
    panel: "w-full text-body leading-body text-foreground",
  },
});
