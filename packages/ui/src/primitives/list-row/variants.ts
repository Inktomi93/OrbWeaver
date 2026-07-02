import { tv } from "tailwind-variants";

// The list-row skin — the slot-based entity row every list surface composes (library, presets,
// rules, plugins, databank docs, rosters — ui-package-design §12 Wave-3-C). `body` is the ONE
// clickable/selected/disabled surface (a `group` parent so title/subtitle can flip color off
// `data-selected`); `actions` is a plain sibling slot that never inherits those states — trailing
// actions stay visually inline without borrowing the row's a11y (the load-bearing "not nested
// interactive content" constraint lives in list-row.tsx, not here).
export const listRowVariants = tv({
  slots: {
    root: "flex w-full min-w-0 items-center gap-row",
    body: [
      "group flex min-w-0 flex-1 items-center gap-row rounded-control outline-none",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      "data-selected:bg-accent data-disabled:pointer-events-none data-disabled:opacity-50",
    ],
    leading: "flex shrink-0 items-center justify-center text-muted-foreground",
    content: "flex min-w-0 flex-1 flex-col",
    title:
      "truncate text-body font-medium leading-body text-foreground group-data-[selected]:text-accent-foreground",
    subtitle:
      "truncate text-label leading-label text-muted-foreground group-data-[selected]:text-accent-foreground",
    actions: "flex shrink-0 items-center gap-field",
  },
  variants: {
    density: {
      default: { body: "min-h-control-md px-row py-field" },
      compact: { body: "min-h-control-sm px-field py-field" },
    },
    clickable: {
      true: {
        body: "cursor-pointer hover:bg-accent active:bg-accent/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      },
      false: {},
    },
  },
  defaultVariants: { density: "default", clickable: false },
});
