import { CAPTION, FIELD_STACK, tv } from "#lib";

/** `<StatFigure>` skin — a label over a big number. */
export const statFigureVariants = tv({
  slots: {
    root: FIELD_STACK,
    label: CAPTION,
    valueRow: "flex items-baseline gap-row",
    value: "text-display leading-display font-medium text-foreground tabular-nums",
  },
});
