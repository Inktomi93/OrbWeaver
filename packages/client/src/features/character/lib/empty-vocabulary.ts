// ONE WORD FOR "nothing here", across the whole character editor (#502, side-eye 2026-08-22 rail-characters
// P3-1). The surface shipped three, all visible within one screen of each other: "No tags" (the hero's tags
// row), "None" (the CONTEXT overview card's rows) and "Add…" (four ADVANCED facet rows — an ACTION word in a
// VALUE slot, which reads as a truncated label until you measure it). That is Nielsen #4 with receipts, and
// the cure is a vocabulary rather than three call sites agreeing by accident.
//
// It is a STATE word, not an invitation: every one of these slots sits beside its own affordance (the facet
// row IS a button, the tags row has "Add tag"), so the value's job is to say what is there — nothing — and
// the control's job is to offer the verb. It is also what a screen reader already heard for a facet row
// (`facetFillSummary`'s empty arm), so the visible and spoken answers are now the same string.
//
// NOT for a temporal fact: "when did we last speak" with no answer is "Never", which is a different claim
// than "this slot is empty" and stays its own word (the overview card's activity row).

/** The house word for a value slot with nothing in it. */
export const EMPTY_VALUE = "Empty";
