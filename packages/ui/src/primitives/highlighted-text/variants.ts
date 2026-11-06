import { tv } from "#lib";

// The highlighted-text seal — plain body copy with real `<mark>` runs (ui-primitive carve-out
// work-order item 11). The mark rides the dedicated `highlight` token pair (a highlighter-yellow,
// distinct from warning's caution amber) — a search-match/mark is a neutral emphasis, not an alarm.
export const highlightedTextVariants = tv({
  slots: {
    // Body-voice prose, the search/find-in-page reader.
    root: "text-body leading-body wrap-break-word whitespace-pre-wrap text-foreground",
    mark: "rounded-control bg-highlight px-field text-highlight-foreground",
  },
});
