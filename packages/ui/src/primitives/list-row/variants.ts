import { DISABLED_STATE, FOCUS_RING, tv } from "#lib";

// `body` is the ONE clickable/selected/disabled surface (a `group` parent so title/subtitle can flip
// color off `data-selected`); `actions` is a plain sibling slot that never inherits those states.
export const listRowVariants = tv({
  slots: {
    // `@container/list-row` lets a consumer's `actions` collapse responsively to the row's own width
    // (fold into a kebab via `@max-*/list-row` when tight).
    root: "@container/list-row flex w-full min-w-0 items-center gap-row",
    // Drops `min-w-0` so it respects `content`'s min-width floor below — the title column can never
    // be starved to 0 by a wide `actions` slot.
    body: [
      "group flex flex-1 items-center gap-row rounded-control outline-none",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      `data-selected:bg-accent ${DISABLED_STATE}`,
    ],
    leading: "flex shrink-0 items-center justify-center text-muted-foreground",
    // `min-w-24` is the title-column floor: name/subtitle never collapse below a readable width, so
    // `actions` yields (shrinks + clips) instead.
    content: "flex min-w-24 flex-1 flex-col",
    title: "block truncate text-left text-body font-medium leading-body text-foreground group-data-[selected]:text-accent-foreground",
    subtitle: "block truncate text-left text-label leading-label text-muted-foreground group-data-[selected]:text-accent-foreground",
    // Hover/focus-within display-swap of the subtitle in the SAME line, so a wide metadata span never
    // contends with the trailing `actions` buttons for width.
    subtitleReveal:
      "hidden truncate text-left font-mono text-label leading-label text-muted-foreground group-focus-within:block group-hover:block group-data-[selected]:text-accent-foreground",
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
