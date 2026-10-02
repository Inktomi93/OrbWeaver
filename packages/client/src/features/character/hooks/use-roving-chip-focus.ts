// Roving focus gives the tag-chip cloud and Opening strip one tab stop, with arrows within the group (WAI-
// APG toolbar model, #491/#1132). Large vocabularies must not require one Tab per offscreen chip to reach
// the panel exit.
//
// Do not compose ToolbarButton through render: its full control skin would compete with the ratified pill
// skin by stylesheet order. Borrow only the keyboard model. No ref is returned because react-hooks/refs
// taints render-time reads of a hook result that carries one; event currentTarget is the container.
//
// The cloud wraps with content-derived line lengths, so both axes follow the same linear order rather than
// inventing a stable column.

import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useState } from "react";

/** What one roving group hands its container: which index owns the tab stop, and the two handlers that
 *  move it. */
export interface RovingChipFocus {
  /** WHICH chip owns the tab stop — already clamped to the rendered count. `0` on every other chip's
   *  `tabIndex` is what would put it back in the sequence, so the call site spends `-1` on the rest. */
  readonly activeIndex: number;
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  /** Keeps the tab stop on whatever the user actually reached — a POINTER click lands focus without any
   *  key event, and leaving the stop behind would send the next Tab back to a chip 300 entries away. */
  readonly onFocus: (event: ReactFocusEvent<HTMLDivElement>) => void;
}

/** Where each key moves the roving stop, given the current index and the group size. `null` = not ours. */
function nextIndex(key: string, current: number, count: number): number | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return Math.min(current + 1, count - 1);
    case "ArrowLeft":
    case "ArrowUp":
      return Math.max(current - 1, 0);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/**
 * One roving tab stop over the items inside the container the returned handlers are attached to.
 *
 * `count` is the number of items RENDERED right now — the tag panel mounts in chunks and its search box
 * re-filters, and the greeting strip grows and shrinks with the card's alternates, so the stop is clamped at
 * render rather than corrected in an effect (an effect would land one commit after the items it is clamping
 * against, which is a frame with a `tabIndex={0}` on nothing).
 *
 * `itemSelector` is a CSS selector for this group's items inside the container — not a hard-coded attribute,
 * because two groups on this surface take the same keyboard model over different markup: the tag
 * vocabulary's chips (`[data-tag-filter-state]`) and the editor's Opening pills
 * (`[data-slot="greeting-opening"]`). It is also what the CTs address the items by, so each group's one
 * spelling is a const at its own call site rather than a literal in two places.
 */
export function useRovingChipFocus(count: number, itemSelector: string): RovingChipFocus {
  const [requested, setRequested] = useState(0);
  const active = count === 0 ? 0 : Math.min(requested, count - 1);

  return {
    activeIndex: active,
    onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>): void => {
      const target = count === 0 ? null : nextIndex(event.key, active, count);
      if (target === null) {
        return;
      }
      // The arrows would otherwise scroll the panel's own viewport out from under the chip we just moved to.
      event.preventDefault();
      setRequested(target);
      event.currentTarget.querySelectorAll<HTMLElement>(itemSelector)[target]?.focus();
    },
    onFocus: (event: ReactFocusEvent<HTMLDivElement>): void => {
      const at = [...event.currentTarget.querySelectorAll<HTMLElement>(itemSelector)].indexOf(event.target);
      if (at >= 0) {
        setRequested(at);
      }
    },
  };
}
