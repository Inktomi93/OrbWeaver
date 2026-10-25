// The chats pane's shared FILTER-FIELD chrome: the inline-end reserve both narrowing fields keep, and the
// inset ✕ that is every field's way out. Its two consumers are the search field (composed in
// `chat-list-surface.tsx`) and the month bound (`chat-list-month-filter.tsx`).
//
// ONE RESET CONTRACT FOR BOTH FILTERS: two sibling filters get one way out — same affordance, same gate
// (non-empty), same glyph, same voice. The glyph is inset at the field's own inline end rather than hanging in
// the column gutter, because a ✕ in the gutter reads as a sibling control while the month field's native
// picker glyph sits INSIDE its box.

import { Button } from "@orb/ui/button";
import { Icon, X } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { Tip } from "#components";

/** The inline-end room BOTH filter fields keep for their inset clear glyph. It is EXACTLY the glyph's own
 *  box (`icon-sm` is `size-(--size-control-sm)`, the same pointer-conditional token as the field's height), so the
 *  value can never run under the control and the control can never spill past the field. Held CONSTANT
 *  rather than gated on the value, so typing the first character does not reflow the text under the cursor;
 *  on the month field the same padding also walks the UA's own `::-webkit-calendar-picker-indicator` inboard
 *  by that much (in chromium), which is what keeps the two glyphs from stacking. */
export const CLEAR_INSET_RESERVE = "pe-control-sm";

/** The way OUT of a narrowing filter, inset at the field's own inline end. `icon-sm` is the
 *  `control-sm` SQUARE, i.e. the field's own height at either pointer: the button fills the field's inner end
 *  rather than hanging in the column gutter, and it clears the coarse tap floor by construction instead of by
 *  a hit-area pseudo. The absolute box takes its vertical static position from the row's `align="center"`, so
 *  it needs no inset of its own. */
export function ClearFilterGlyph({ label, onClick }: { readonly label: string; readonly onClick: () => void }): ReactElement {
  return (
    <Tip text={label}>
      <Button aria-label={label} className="absolute inset-e-0" intent="ghost" onClick={onClick} size="icon-sm" type="button">
        <Icon icon={X} size="sm" />
      </Button>
    </Tip>
  );
}
