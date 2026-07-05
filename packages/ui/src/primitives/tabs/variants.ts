import { tv } from "tailwind-variants";

// The tabs skin (D62 UIP-307) — an UNDERLINE strip, not a segmented pill: the list is a plain row
// with a hairline `--color-border` track along its bottom edge; the active marker is a 2px `--primary`
// bar that slides along that edge. Tabs ride h-control-sm (the ≥44px touch floor, §4b axis 3) and sit
// above the indicator via z-(--z-raised). `orientation="vertical"` (Base UI mirrors `data-orientation`
// onto every part) is the one CSS branch: root/list flip from a stack to a side-by-side row, and the
// list stacks its tabs in a column. The --active-tab-* vars the indicator reads are recomputed by
// Base UI for the vertical axis; the underline reads `left`/`width` (recomputed there too), so it
// needs no orientation branch. `border`/`h-0.5` are Tailwind's untokenized hairline scale (the
// `border border-border` precedent) — a 1px track + a 2px bar aren't worth a token each.
export const tabsVariants = tv({
  slots: {
    root: "flex w-full flex-col gap-block data-[orientation=vertical]:flex-row",
    list: [
      "relative inline-flex w-fit items-center gap-block border-b border-border",
      "data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch",
    ],
    tab: [
      "relative z-(--z-raised) inline-flex h-control-sm cursor-pointer select-none items-center justify-center gap-field whitespace-nowrap px-block text-label font-medium leading-label text-muted-foreground",
      "transition-colors duration-(--motion-fast) ease-out-expo hover:text-foreground",
      "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "data-active:text-foreground",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
      "data-[orientation=vertical]:justify-start",
    ],
    // The sliding underline — a 2px `--primary` bar pinned to the list's bottom edge, positioned from
    // Base UI's runtime --active-tab-left/width vars. transition-all animates the slide as selection
    // moves. rounded-full keeps the short bar's ends soft.
    indicator: [
      "absolute bottom-0 left-(--active-tab-left) z-(--z-raised) h-0.5 w-(--active-tab-width) rounded-full bg-primary",
      "transition-all duration-(--motion-base) ease-out-expo",
    ],
    panel: "w-full text-body leading-body text-foreground",
  },
});
