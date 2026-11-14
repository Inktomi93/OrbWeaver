// How a control's label breaks when a word is wider than its box. Button, Toggle and Select spell the rule here, so a control that
// wraps names an arm instead of restating the classes. The two arms differ on purpose: a label has no break point of its own, a value does.
import { CAP } from "./width.ts";

export const CONTROL_WRAP = {
  /**
   * A label with no space to break at (a model-authored sentence, one long word): it breaks anywhere, so the box stays inside its parent
   * and grows with its lines. Button and Toggle `wrap`.
   */
  anywhere: `wrap-anywhere whitespace-normal ${CAP.fit}`,
  /**
   * The `anywhere` break for each cell of an equal-cell `ToggleGroup`, written on the group: a cell's width is its share of the strip, so its
   * min-content must be lowered for a one-word label to break inside it. The prefix is a Tailwind variant, so it cannot be built from
   * `anywhere`; the two change together.
   */
  cell: "*:data-[slot=toggle]:wrap-anywhere *:data-[slot=toggle]:whitespace-normal *:data-[slot=toggle]:min-inline-0",
  /**
   * The value the reader chose the control for: it wraps between its words and hyphenates a word wider than the room at one of its own
   * hyphenation points, and `min-inline-0` lets the flex child shrink to its trigger. Select's value.
   */
  word: "wrap-break-word hyphens-auto whitespace-normal min-inline-0",
} as const;
