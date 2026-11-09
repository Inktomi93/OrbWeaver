// Class sets that several primitives wear on their own parts, spelled once so a retune reaches every part.
// A part adds its own classes beside a constant, in a template, and never repeats the set.

/** A stack at the field gap: a label, its control and its description, or a list of one-line items. */
export const FIELD_STACK = "flex flex-col gap-field";

/** A line of marks centred on the field gap. */
export const FIELD_ROW = "flex gap-field items-center";

/** A line of marks centred on the row gap, one step wider than {@link FIELD_ROW}. */
export const ROW_STRIP = "flex gap-row items-center";

/** {@link FIELD_ROW} that sits inline with the text around it. */
export const INLINE_FIELD_ROW = "gap-field inline-flex items-center";

/** The label step in the page ink, medium weight: a control's visible name. */
export const FIELD_LABEL = "text-label leading-label font-medium text-foreground";

/** The label step in the receded ink: a caption, a count, a hint. */
export const CAPTION = "text-label leading-label text-muted-foreground";

/** A box that scrolls on both axes and anchors its absolute children. */
export const SCROLLER = "overflow-auto overscroll-contain relative";

/** {@link SCROLLER} on the block axis only: a list or a pane that scrolls inside a bounded parent. */
export const SCROLLER_Y = "overflow-y-auto overscroll-contain relative";

/** {@link SCROLLER} for a list that may fill the whole port of the region around it: a wheel at the list's end continues in that region, so what lies past the list stays reachable. */
export const SCROLLER_CHAINED = "overflow-auto overscroll-auto relative";

/** {@link SCROLLER_CHAINED} on the block axis only. */
export const SCROLLER_Y_CHAINED = "overflow-y-auto overscroll-auto relative";

/** A box that takes the whole block extent of a flex or block parent and may shrink below its content. */
export const FILL_PARENT = "block-full flex-1 min-block-0";

/** The title step: the heading of a popup, a drawer or a promoted row. */
export const TITLE_STEP = "text-title leading-title font-semibold";
