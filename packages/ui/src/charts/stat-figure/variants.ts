import { tv } from "#lib";

/** `<StatFigure>` skin — a label over a big number. */
export const statFigureVariants = tv({
  slots: {
    root: "flex flex-col gap-field",
    label: "text-label leading-label text-muted-foreground",
    valueRow: "flex items-baseline gap-row",
    value: "text-display leading-display font-medium text-foreground tabular-nums",
  },
});
