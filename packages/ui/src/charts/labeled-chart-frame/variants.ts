import { FIELD_LABEL, FIELD_STACK, tv } from "#lib";

/** The labeled-frame skin shared by BarList + Histogram — a heading rhythm above the `<Chart>` canvas. */
export const labeledChartFrameVariants = tv({
  slots: {
    root: `${FIELD_STACK} inline-full`,
    heading: FIELD_LABEL,
    /** The generated text equivalent: present for assistive tech, absent from the layout entirely.
     *  `table-fixed` is what makes that true: a table's specified width is only a MINIMUM, so `sr-only`'s 1px
     *  step is beaten by the min-content width of its nowrap labels and the enclosing scroller inherits the
     *  difference as a horizontal range nothing painted asked for (measured: 544px of text equivalent inside a
     *  418px CONTEXT pane). Fixed layout sizes the tracks from the box, so the box stays the 1px asked for. */
    dataTable: "sr-only table-fixed",
  },
});
