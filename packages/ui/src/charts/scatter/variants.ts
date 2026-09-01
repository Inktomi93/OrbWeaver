import { tv } from "#lib";

/** The scatter's DOM KEY — the readable half of a canvas plot: one row per category, swatch · name · count.
 *  Wrapping, because a key is chrome and must never take height from the plot it explains. */
export const scatterLegendVariants = tv({
  slots: {
    root: "flex flex-wrap gap-x-block gap-y-tight",
    item: "flex min-w-0 items-center gap-field",
    swatch: "size-2 shrink-0 rounded-full",
    name: "min-w-0 truncate text-label leading-label text-foreground",
    count: "shrink-0 font-mono text-micro leading-micro text-muted-foreground",
  },
});
