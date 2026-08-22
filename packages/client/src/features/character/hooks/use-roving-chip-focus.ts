// The tag-vocabulary panel's KEYBOARD MODEL — one tab stop for the whole chip cloud, arrows within it
// (WAI-APG's toolbar pattern).
//
// WHY IT EXISTS (#491, side-eye 2026-08-22 rail-characters P1-1, measured on the owner's 551-tag library):
// every chip was sequentially tabbable, so opening the vocabulary put **563 tab stops** between a keyboard
// user and the first character row — with 529 of those chips scrolled outside the panel's 192px viewport at
// any moment. The panel's own exit ("Show fewer") sits above the scroller, but reaching it from inside the
// cloud cost 551 presses. One stop in, one stop out.
//
// WHY NOT `@orb/ui`'s `<Toolbar>` (which already wraps Base UI's roving tabindex): its `ToolbarButton`
// carries `toolbarButtonVariants` — a full control skin (`h-control-sm`, `rounded-control`, `text-label`,
// its own focus ring) — and these chips are `Button intent="outline" shape="pill" size="chip"` with a
// ratified pill box, a selection ring and a strike arm. Composing them through Base UI's `render` prop
// concatenates two complete skins onto one element and the winner is decided by stylesheet order, not by
// either variant. The keyboard model is the only part we need, so the model is what this borrows.
//
// NO REF, DELIBERATELY. The first spelling handed the caller a `RefObject` alongside the render-time tab
// index, and `react-hooks/refs` is right to red it: a hook result whose object carries a ref taints EVERY
// read of that object during render ("Cannot access refs during render"), including a plain number. The
// container is always the event's own `currentTarget`, so the handlers find their chips without one — which
// is both the lint-clean shape and the simpler one.
//
// The cloud WRAPS, so both axes walk the same linear order: there is no stable column to move "down" to
// when the line lengths are content-derived, and APG's toolbar pattern says a wrapping toolbar may treat
// its items as one sequence.

import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useState } from "react";

/** The chips inside the roving container — matched by the chip's own state attribute, which is the same
 *  hook the CTs address them by. */
const CHIP_SELECTOR = "[data-tag-filter-state]";

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
 * One roving tab stop over the chips inside the container the returned handlers are attached to.
 *
 * `count` is the number of chips RENDERED right now — the panel mounts in chunks and its search box
 * re-filters, so the stop is clamped at render rather than corrected in an effect (an effect would land one
 * commit after the chips it is clamping against, which is a frame with a `tabIndex={0}` on nothing).
 */
export function useRovingChipFocus(count: number): RovingChipFocus {
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
      event.currentTarget.querySelectorAll<HTMLElement>(CHIP_SELECTOR)[target]?.focus();
    },
    onFocus: (event: ReactFocusEvent<HTMLDivElement>): void => {
      const at = [...event.currentTarget.querySelectorAll<HTMLElement>(CHIP_SELECTOR)].indexOf(event.target);
      if (at >= 0) {
        setRequested(at);
      }
    },
  };
}
