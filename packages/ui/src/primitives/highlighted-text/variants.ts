import { tv } from "#lib";

// The highlighted-text seal — plain body copy with real `<mark>` runs (ui-primitive carve-out
// work-order item 11). The mark rides the dedicated `highlight` token pair (a highlighter-yellow,
// distinct from warning's caution amber) — a search-match/mark is a neutral emphasis, not an alarm.
export const highlightedTextVariants = tv({
  slots: {
    root: "wrap-break-word whitespace-pre-wrap",
    mark: "rounded-control bg-highlight px-field text-highlight-foreground",
  },
  // `skin` is the ROOT's type voice only — the mark keeps the `highlight` token pair in both arms, because
  // what a mark MEANS ("this run is the hit") does not change with the surrounding voice.
  //
  // `default` is body-voice prose, the search/find-in-page reader.
  variants: {
    skin: {
      default: { root: "text-body leading-body text-foreground" },
    },
  },
  defaultVariants: { skin: "default" },
});
