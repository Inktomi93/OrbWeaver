// useRovingRadioGroup — the WAI-ARIA radiogroup keyboard contract, for a list whose rows each carry a
// `role="radio"` state toggle (`RowToggleAction semantics="radio"`, D12). Side-eye F-5, 2026-08-03.
//
// THE DEFECT IT CLOSES. Declaring `role="radiogroup"` + `role="radio"` is a PROMISE about keyboard
// behaviour, and the preset list kept neither half: every radio carried `tabIndex=0`, so crossing a
// 20-preset list took ~40 Tab stops through controls a user was not aiming at, and the Arrow keys the role
// advertises did nothing at all. The pattern is exactly two rules — one tabbable radio, Arrows move the
// selection — and both are DOM-shaped rather than row-shaped, which is why they live on the group's
// container instead of being threaded through every row composite that might carry a toggle.
//
// SELECTION FOLLOWS FOCUS, per the pattern: Arrow/Home/End CLICK the target radio (activating it through
// whatever mutation the row already wired — this hook never knows what a radio means) and then focus it.
// That is correct for a one-of-N pick with no expensive commit, which is what an "active preset" is.
//
// WHY IMPERATIVE. The tabbable radio is derived from `aria-checked`, which each row owns; a declarative
// version would have to hoist "which row is checked" into the container, giving the axis a second reader.
// The layout effect re-derives after every render of the group instead — a list re-renders when its checked
// row changes, so the roving index is always one frame behind nothing.
//
// NO-CHECKED FALLBACK is load-bearing: filtering a list can hide the checked row, and a group where NOTHING
// is tabbable is a hole a keyboard user cannot enter. The FIRST radio takes the tab stop then, which is what
// the pattern prescribes for a group with no selection.

import type { RefObject } from "react";
import { useLayoutEffect } from "react";

/** Move to the next/previous radio, wrapping — the pattern's own wrap-around. */
const NEXT_KEYS: ReadonlySet<string> = new Set(["ArrowDown", "ArrowRight"]);
const PREVIOUS_KEYS: ReadonlySet<string> = new Set(["ArrowUp", "ArrowLeft"]);

function radiosIn(container: HTMLElement): readonly HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[role="radio"]')];
}

/** The index the roving tab stop belongs to: the checked radio, else the first (never none). */
function tabbableIndex(radios: readonly HTMLElement[]): number {
  const checked = radios.findIndex((radio) => radio.getAttribute("aria-checked") === "true");
  return checked === -1 ? 0 : checked;
}

/** Where a key moves focus from `from`, or `null` when the key is not ours (the browser keeps it). */
function targetIndex(key: string, from: number, count: number): number | null {
  if (NEXT_KEYS.has(key)) {
    return (from + 1) % count;
  }
  if (PREVIOUS_KEYS.has(key)) {
    return (from - 1 + count) % count;
  }
  if (key === "Home") {
    return 0;
  }
  return key === "End" ? count - 1 : null;
}

/**
 * Applies the radiogroup keyboard contract to `containerRef`'s `[role=radio]` descendants: a roving
 * tabindex (checked radio = 0, every other = -1) and Arrow/Home/End navigation with selection following
 * focus. Pass the ref of the element carrying `role="radiogroup"`; a container that renders no radios is a
 * no-op, so a list can mount this unconditionally.
 */
export function useRovingRadioGroup(containerRef: RefObject<HTMLElement | null>): void {
  // No dependency array on purpose: the tab stop derives from `aria-checked`, which changes with the
  // children's own renders, and the group re-renders whenever they do. Re-deriving is three attribute
  // writes — cheaper than observing the subtree for mutations.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    const radios = radiosIn(container);
    const tabbable = tabbableIndex(radios);
    for (const [at, radio] of radios.entries()) {
      radio.tabIndex = at === tabbable ? 0 : -1;
    }
  });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      // Only the radios themselves navigate: the row BODY buttons live inside this same container and Tab
      // is their affordance, so an Arrow key pressed on a row body must stay the browser's (scroll).
      if (!(target instanceof HTMLElement) || target.getAttribute("role") !== "radio") {
        return;
      }
      const radios = radiosIn(container);
      const from = radios.indexOf(target);
      if (from === -1 || radios.length === 0) {
        return;
      }
      const to = targetIndex(event.key, from, radios.length);
      if (to === null) {
        return;
      }
      const next = radios[to];
      if (next === undefined) {
        return;
      }
      event.preventDefault();
      // SELECTION FOLLOWS FOCUS: click first (the row's own activate handler runs and `aria-checked` flips),
      // then focus, so the roving effect above re-derives onto the radio the user is now standing on.
      next.click();
      next.focus();
    };
    container.addEventListener("keydown", onKeyDown);
    return (): void => container.removeEventListener("keydown", onKeyDown);
  }, [containerRef]);
}
