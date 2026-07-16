import { tv } from "#lib";

/** The labeled-frame skin shared by BarList + Histogram — a heading rhythm above the `<Chart>` canvas. */
export const labeledChartFrameVariants = tv({
  slots: {
    root: "flex w-full flex-col gap-field",
    heading: "text-label font-medium leading-label text-foreground",
  },
});
