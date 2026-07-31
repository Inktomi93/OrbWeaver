import { tv } from "#lib";

// The data-series line skin (panel-redesign preview.html `.prow`): swatch · label/detail · trailing value.
// Instrument density — a hairline separator between siblings (`[&+&]` sibling selector on the root, so a
// list of rows needs no wrapper class), tabular figures on the value so a column of counts lines up.
export const seriesRowVariants = tv({
  slots: {
    root: "flex w-full min-w-0 items-center gap-row text-label leading-label",
    // A small square keyed to the bar's segment — decoration, sized off the `field` spacing intent.
    swatch: "size-field shrink-0 rounded-control",
    content: "flex min-w-0 flex-1 flex-col",
    label: "truncate text-foreground",
    detail: "truncate text-micro leading-label text-muted-foreground",
    value: "shrink-0 tabular-nums text-muted-foreground",
  },
  variants: {
    density: {
      default: { root: "py-field" },
      // Instrument rows: tighter vertical rhythm for a long stack in a narrow panel.
      compact: { root: "py-0" },
    },
  },
  defaultVariants: { density: "default" },
});
