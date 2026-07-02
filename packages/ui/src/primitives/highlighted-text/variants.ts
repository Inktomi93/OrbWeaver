import { tv } from "tailwind-variants";

// The highlighted-text seal — plain body copy with real `<mark>` runs (ui-primitive carve-out
// work-order item 11). The mark rides the warning token pair: there is no dedicated "highlight"
// token in the set (see theme.css), and warning's amber reads as the nearest "flagged passage"
// intent without inventing a new token for one primitive.
export const highlightedTextVariants = tv({
  slots: {
    root: "whitespace-pre-wrap break-words text-body leading-body text-foreground",
    mark: "rounded-control bg-warning px-field text-warning-foreground",
  },
});
