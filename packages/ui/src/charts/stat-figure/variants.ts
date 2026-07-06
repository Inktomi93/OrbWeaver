import { tv } from "#lib";

/**
 * `<StatFigure>` skin — big number + optional delta + optional sparkline. The delta color is an
 * INTENT-token swap (success/destructive/muted), never a raw color calc; it's paired with a
 * non-color glyph (chevron up/down/a flat dash) so direction never rides color alone.
 */
export const statFigureVariants = tv({
  slots: {
    root: "flex flex-col gap-field",
    label: "text-label leading-label text-muted-foreground",
    valueRow: "flex items-baseline gap-row",
    value: "font-medium text-display leading-display text-foreground tabular-nums",
    delta: "flex items-center gap-field text-label leading-label",
    sparkline: "mt-field",
  },
  variants: {
    direction: {
      up: { delta: "text-success" },
      down: { delta: "text-destructive" },
      flat: { delta: "text-muted-foreground" },
    },
  },
});
