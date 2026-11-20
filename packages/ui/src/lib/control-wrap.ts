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
   * The cell of an equal-cell `ToggleGroup`, written on the group. A cell is its share of the strip (`grow`, no basis) but never less than its
   * label on one line, or the strip's whole width when the label alone is wider: `min-inline-fit` is that floor, so a cell that cannot hold its
   * label takes a further row of the wrapping strip and no word is cut. `wrap-anywhere` lowers the cell's min-content so the floor above is
   * the only one, and it cuts a word only in a cell that already fills the strip. The prefix is a Tailwind variant, so it cannot be built from
   * `anywhere`; the two change together.
   */
  cell: "*:data-[slot=toggle]:grow *:data-[slot=toggle]:basis-0 *:data-[slot=toggle]:min-inline-fit *:data-[slot=toggle]:text-center *:data-[slot=toggle]:wrap-anywhere *:data-[slot=toggle]:whitespace-normal",
  /**
   * The value the reader chose the control for: it wraps between its words and hyphenates a word wider than the room at one of its own
   * hyphenation points, and `min-inline-0` lets the flex child shrink to its trigger. Select's value.
   */
  word: "wrap-break-word hyphens-auto whitespace-normal min-inline-0",
} as const;
