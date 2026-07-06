import { tv } from "#lib";

/** `<Histogram>` wrapper skin — just the heading rhythm above the `<Chart>` canvas. */
export const histogramVariants = tv({
  slots: {
    root: "flex w-full flex-col gap-field",
    heading: "text-label font-medium leading-label text-foreground",
  },
});
