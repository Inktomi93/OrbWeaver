// The chats pane's shared FILTER-FIELD chrome: the inline-end reserve both narrowing fields keep, and the
// inset ✕ that is every field's way out. Split out of `chat-list-surface.tsx` at #1350 when the month bound
// grew its own component (`chat-list-month-filter.tsx`) and the surface hit the 450-line component cap — the
// two consumers are the search field (still composed in the surface) and the month bound.
//
// ONE RESET CONTRACT FOR BOTH FILTERS (#490, shape moved inside the field at #525): the month control grew a
// ✕ the moment it held a value and the search field beside it never did — two sibling filters, two different
// ways out, in one 290px column. Same affordance, same gate (non-empty), same glyph, same voice. The glyph is
// inset at the field's own inline end rather than hanging in the column gutter, because a ✕ in the gutter
// read as a sibling control while the month field's native picker glyph sat INSIDE its box.

import { Button } from "@orb/ui/button";
import { Icon, X } from "@orb/ui/icons";
import type { ReactElement } from "react";

/** The inline-end room BOTH filter fields keep for their inset clear glyph. It is EXACTLY the glyph's own
 *  box (`icon-sm` is `size-control-sm`, the same pointer-conditional token as the field's height), so the
 *  value can never run under the control and the control can never spill past the field. Held CONSTANT
 *  rather than gated on the value, so typing the first character does not reflow the text under the cursor;
 *  on the month field the same padding also walks the UA's own `::-webkit-calendar-picker-indicator` inboard
 *  by that much (measured in chromium 2026-08-22), which is what keeps the two glyphs from stacking. */
export const CLEAR_INSET_RESERVE = "pe-control-sm";

/** The way OUT of a narrowing filter, inset at the field's own inline end (#525). `icon-sm` is the
 *  `control-sm` SQUARE, i.e. the field's own height at either pointer: the button fills the field's inner end
 *  rather than hanging in the column gutter, and it clears the coarse tap floor by construction instead of by
 *  a hit-area pseudo. The absolute box takes its vertical static position from the row's `align="center"`, so
 *  it needs no inset of its own. */
export function ClearFilterGlyph({ label, onClick }: { readonly label: string; readonly onClick: () => void }): ReactElement {
  return (
    <Button aria-label={label} className="absolute end-0" intent="ghost" onClick={onClick} size="icon-sm" title={label} type="button">
      <Icon icon={X} size="sm" />
    </Button>
  );
}
