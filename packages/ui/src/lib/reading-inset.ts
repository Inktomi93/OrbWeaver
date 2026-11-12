// A reading box's inset on its column, and the reach that carries a band across that inset and pays it back, so a band pinned
// in the box ends on the box's edges. Both facts live here because they must agree: `inset` is the box's props, `reach` is the
// `-m*` and `p*` classes of the same steps, whole literals so Tailwind's scanner sees them.
//
// `plate` is inset a section from its gutter, its end edge a block on a phone. `page` is inset the gutter, with no block-end
// inset so the next page runs on, and a tight step on a phone.
export const READING_INSET = {
  plate: {
    inset: { paddingInline: "section", paddingBlock: "row", paddingBlockStart: undefined, paddingInlineNarrow: undefined, paddingInlineEndNarrow: "block" },
    reach: "-mx-inset-section px-inset-section @max-cq-28:-me-block @max-cq-28:pe-block",
  },
  page: {
    inset: { paddingInline: "gutter", paddingBlock: undefined, paddingBlockStart: "row", paddingInlineNarrow: "tight", paddingInlineEndNarrow: undefined },
    reach: "-mx-gutter px-gutter @max-cq-28:-mx-tight @max-cq-28:px-tight",
  },
} as const;
