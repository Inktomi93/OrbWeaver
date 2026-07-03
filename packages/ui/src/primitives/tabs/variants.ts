import { tv } from "tailwind-variants";

// The tabs skin — segmented list on bg-muted; the active marker is the sliding Indicator (bg-background)
// rather than a per-tab background, so it animates between tabs. Tabs ride h-control-sm (the ≥44px
// touch floor, §4b axis 3) and sit above the indicator via z-(--z-raised).
// `orientation="vertical"` (Base UI mirrors `data-orientation` onto every part) is the one CSS
// branch: root/list flip from a row-then-column stack to a side-by-side row, and the list itself
// stacks its tabs in a column instead of a row. The --active-tab-* vars the indicator reads are
// recomputed by Base UI for the vertical axis, so `indicator` needs no orientation branch.
export const tabsVariants = tv({
  slots: {
    root: "flex w-full flex-col gap-block data-[orientation=vertical]:flex-row",
    list: [
      "relative inline-flex w-fit items-center gap-field rounded-control bg-muted p-field",
      "data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch",
    ],
    tab: [
      "relative z-(--z-raised) inline-flex h-control-sm cursor-pointer select-none items-center justify-center gap-field whitespace-nowrap rounded-control px-block text-label font-medium leading-label text-muted-foreground",
      "transition-colors duration-(--motion-fast) ease-out-expo hover:text-foreground",
      "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "data-active:text-foreground",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
      "data-[orientation=vertical]:justify-start",
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
