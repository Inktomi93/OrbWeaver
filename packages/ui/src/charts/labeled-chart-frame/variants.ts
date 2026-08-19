import { tv } from "#lib";

/** The labeled-frame skin shared by BarList + Histogram — a heading rhythm above the `<Chart>` canvas. */
export const labeledChartFrameVariants = tv({
  slots: {
    root: "flex w-full flex-col gap-field",
    heading: "text-label font-medium leading-label text-foreground",
    /** The generated text equivalent: present for assistive tech, absent from the layout entirely. */
    dataTable: "sr-only",
  },
});
