import { tv } from "#lib";

// The copy control's frame: the button, its always-mounted status line, and the manual-copy field that
// replaces a failed write. The root fills the rest of a row, so the status and the field wrap under the
// button inside it; a neighbour in that row aligns on the baseline, or it floats as the control grows. An empty status is `sr-only`: it stays in the accessibility tree (a live region must
// exist before its text changes) but takes no flex gap while there is nothing to say.
export const copyButtonVariants = tv({
  slots: {
    root: "flex min-w-0 flex-1 flex-wrap items-center gap-field",
    status: "empty:sr-only data-failed:text-warning",
    field: "basis-full font-mono",
  },
});
