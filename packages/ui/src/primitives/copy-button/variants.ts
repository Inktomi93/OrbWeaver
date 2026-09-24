import { tv } from "#lib";

// The copy control's frame. The row wraps, so a failed copy's field (`basis-full`) takes a whole line of
// its own in place of the subject, and the press and status follow on the next line. An empty status is
// `sr-only`: it stays in the accessibility tree (a live region must exist before its text changes) but
// takes no flex gap while there is nothing to say.
export const copyButtonVariants = tv({
  slots: {
    root: "flex flex-wrap items-center gap-field",
    subject: "contents",
    status: "empty:sr-only data-[outcome=insecure]:text-warning data-[outcome=refused]:text-warning",
    hint: "sr-only",
    // The chip's type (`Kbd size="command"`), so the field reads as the same text it replaced.
    field: "basis-full max-w-(--reading-measure-prose) font-mono text-code leading-label",
  },
});
