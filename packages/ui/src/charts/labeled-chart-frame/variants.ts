import { FIELD_LABEL, FIELD_STACK, tv } from "#lib";

/** The labeled-frame skin shared by BarList + Histogram — a heading rhythm above the `<Chart>` canvas. */
export const labeledChartFrameVariants = tv({
  slots: {
    root: `${FIELD_STACK} inline-full`,
    heading: FIELD_LABEL,
    /** The generated text equivalent: present for assistive tech, absent from the layout entirely. */
    dataTable: "sr-only",
  },
});
