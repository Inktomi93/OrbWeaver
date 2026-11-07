import { FIELD_ROW, PICTURE_SIZE, tv } from "#lib";

/** The scatter's DOM KEY — the readable half of a canvas plot: one row per category, swatch · name · count.
 *  Wrapping, because a key is chrome and must never take height from the plot it explains. */
export const scatterBoxVariants = tv({
  variants: {
    size: { fill: PICTURE_SIZE.fill },
  },
});

export const scatterLegendVariants = tv({
  slots: {
    root: "flex flex-wrap gap-x-block gap-y-tight",
    item: `${FIELD_ROW} min-inline-0`,
    swatch: "shrink-0 rounded-full block-(--size-dot) inline-(--size-dot)",
    name: "truncate text-label leading-label text-foreground",
    count: "shrink-0 font-mono text-micro leading-micro text-muted-foreground",
  },
});
