import { DISABLED_STATE, FOCUS_RING, tv } from "#lib";

// The tabs skin (D62 UIP-307) — an UNDERLINE strip, not a segmented pill: the list is a plain row
// with a hairline `--color-border` track along its bottom edge; the active marker is a 2px `--primary`
// bar that slides along that edge. Tabs sit above the indicator via z-(--z-raised).
// `orientation="vertical"` (Base UI mirrors `data-orientation`
// onto every part) is the one CSS branch: root/list flip from a stack to a side-by-side row, and the
// list stacks its tabs in a column. Tabs ride h-control-sm (the ≥44px touch floor, §4b axis 3) in the
// default `inline` layout; the `stacked` arm trades the fixed height for content height + a min-height
// floor (see the variant's own note). The --active-tab-* vars the indicator reads are recomputed by
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
      "relative z-(--z-raised) inline-flex cursor-pointer select-none items-center justify-center gap-field whitespace-nowrap text-label font-medium leading-label text-muted-foreground",
      "transition-colors duration-(--motion-fast) ease-out-expo hover:text-foreground",
      "outline-none",
      FOCUS_RING,
      "data-active:text-foreground",
      DISABLED_STATE,
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
  variants: {
    // THE TAB CELL'S ARRANGEMENT — and, with it, its height rule. `inline` is the strip tab: one row, the
    // fixed `h-control-sm` chrome height. `stacked` is the HUD/rail cell: glyph OVER caption, so the height
    // must FOLLOW the content (`h-auto`) with `min-h-control-sm` keeping the ≥44px coarse tap floor.
    //
    // This is a VARIANT and not a call-site `className` for a measured reason (the 2026-08-01 side-eye P0):
    // `h-auto` appended by a caller does NOT beat `h-control-sm` — a custom-token height is opaque to
    // tailwind-merge, both classes survive, and STYLESHEET ORDER decides (h-auto loses). The rail's captions
    // rendered as a 5px sliver. A sealed size can only be overridden HERE, the button `size="media"`
    // precedent (F2). Pinned by COMPUTED height in tests/ui/primitives/tabs/tabs.ct.tsx.
    layout: {
      inline: { tab: "h-control-sm px-block" },
      stacked: { tab: "h-auto min-h-control-sm flex-col gap-0 px-field py-field" },
    },
  },
  defaultVariants: { layout: "inline" },
});
