import { DISABLED_STATE, FOCUS_RING, tv } from "#lib";

// `body` is the ONE clickable/selected/disabled surface (a `group` parent so title/subtitle can flip
// color off `data-selected`); `actions` is a plain sibling slot that never inherits those states.
export const listRowVariants = tv({
  slots: {
    // `@container/list-row` lets a consumer's `actions` collapse responsively to the row's own width
    // (fold into a kebab via `@max-*/list-row` when tight).
    root: "@container/list-row flex w-full min-w-0 items-center gap-row",
    // Keeps `min-w-0` so it can shrink and let `title`'s `truncate` engage — starvation is prevented by
    // `content`'s own `min-w-24` floor below (a floor RAISES a min-content contribution, so if it lived
    // here on `body` it would pin `body` to the title's full width and force a horizontal scrollbar in a
    // narrow panel; north-star N2). Selected reads as a 2px left ember bar + a 10% `--color-primary` tint
    // (rides the accent, so custom themes retint it), not a flat `--color-accent` fill (north-star §4 N2).
    body: [
      "group flex min-w-0 flex-1 items-center gap-row rounded-control border-l-2 border-l-transparent outline-none",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      `data-selected:border-l-primary data-selected:bg-primary/10 ${DISABLED_STATE}`,
    ],
    leading: "flex shrink-0 items-center justify-center text-muted-foreground",
    // `min-w-24` is the title-column floor: name/subtitle never collapse below a readable width, so
    // `actions` yields (shrinks + clips) instead.
    content: "flex min-w-24 flex-1 flex-col",
    title: "block truncate text-left text-body font-medium leading-body text-foreground",
    subtitle: "block truncate text-left text-label leading-label text-muted-foreground",
    // Hover/focus-within display-swap of the subtitle in the SAME line, so a wide metadata span never
    // contends with the trailing `actions` buttons for width.
    subtitleReveal: "hidden truncate text-left font-mono text-label leading-label text-muted-foreground group-focus-within:block group-hover:block",
    // `shrink-0`: controls keep their intrinsic width and are never squeezed below the tap-target floor.
    actions: "flex shrink-0 items-center justify-end gap-field",
  },
  variants: {
    density: {
      default: { body: "min-h-control-md px-row py-field" },
      compact: { body: "min-h-control-sm px-field py-field" },
    },
    clickable: {
      true: {
        body: `cursor-pointer hover:bg-accent active:bg-accent/80 ${FOCUS_RING}`,
      },
      false: {},
    },
  },
  defaultVariants: { density: "default", clickable: false },
});
