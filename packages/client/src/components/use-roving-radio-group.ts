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
// SELECTION IS MANUAL: Arrow/Home/End move FOCUS ONLY; Space/Enter commit, natively, because every radio is
// a real `<button>`. This is the APG's own second arm — "selection with a side effect" — and it replaces the
// selection-follows-focus arm this file shipped first.
//
// THE RULING SURVIVES; ITS INPUT CHANGED (side-eye 2026-08-22 P1-1, issue #481). The original text read:
// "Arrow/Home/End CLICK the target radio … That is correct for a one-of-N pick with NO EXPENSIVE COMMIT,
// which is what an 'active preset' is." The premise was measured false. The only list that owns a
// radiogroup here is the preset library, and its radio persists a GLOBAL setting: a live keyboard walk
// produced one `settings.updateUserSettingsSection` write PER ARROW PRESS — browsing the list rewrote which
// preset every future generation runs with, with no confirm, no undo and nothing announced, while Delete on
// the same row gets a full alertdialog. Selection-follows-focus is right for a cheap pick; the pick here was
// never cheap. Everything else about the contract is unchanged — one tabbable radio, Arrow/Home/End
// navigation, wrap-around, the no-checked fallback.
//
// WHY IMPERATIVE. The tabbable radio is derived from the DOM (which radio holds focus, else which carries
// `aria-checked`), both of which each row owns; a declarative version would have to hoist them into the
// container, giving the axis a second reader. The layout effect re-derives after every render of the group
// instead — a list re-renders when its checked row changes, so the roving index is always one frame behind
// nothing.
//
// THE TAB STOP FOLLOWS FOCUS, NOT THE CHECK, while the group holds focus — which is the half of the roving
// contract manual selection makes load-bearing. Once arrows stop activating, the focused radio and the
// checked radio are routinely different rows, and a re-render that re-derived the tab stop from
// `aria-checked` alone would set `tabIndex = -1` on the very radio the user is standing on: tabbing out and
// back would silently teleport them to the checked row and lose their place mid-walk.
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

/** The index the roving tab stop belongs to: the FOCUSED radio (a walk in progress owns the stop), else the
 *  checked one, else the first (never none). */
function tabbableIndex(radios: readonly HTMLElement[]): number {
  const focused = radios.findIndex((radio) => radio.matches(":focus"));
  if (focused !== -1) {
    return focused;
  }
  const checked = radios.findIndex((radio) => radio.getAttribute("aria-checked") === "true");
  return checked === -1 ? 0 : checked;
}

/** Write the roving tab stop: exactly one radio is reachable by Tab, every other is -1. */
function applyTabStop(radios: readonly HTMLElement[], tabbable: HTMLElement | undefined): void {
  for (const radio of radios) {
    radio.tabIndex = radio === tabbable ? 0 : -1;
  }
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
 * tabindex (the focused radio, else the checked one, = 0; every other = -1) and Arrow/Home/End navigation
 * that moves FOCUS ONLY — the commit is Space/Enter on the radio (see the header). Pass the ref of the
 * element carrying `role="radiogroup"`; a container that renders no radios is a no-op, so a list can mount
 * this unconditionally.
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
    applyTabStop(radios, radios[tabbableIndex(radios)]);
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
      // The tab stop moves WITH the focus, written HERE rather than left to the effect above: a focus move
      // is not a React render (nothing about it is state), so the effect does not run and the stop would sit
      // on the checked row while the user stands somewhere else — measured, `tabIndex` stayed -1 on the
      // focused radio. The effect's own derivation prefers the focused radio for the same reason, so a
      // later render agrees with this instead of undoing it.
      applyTabStop(radios, next);
      // FOCUS ONLY — no `click()`. The commit is the user's own Space/Enter on the radio they chose, which
      // the native `<button>` handles; this hook never activates anything, which is why it can stay ignorant
      // of what a radio means.
      next.focus();
    };
    container.addEventListener("keydown", onKeyDown);
    return (): void => container.removeEventListener("keydown", onKeyDown);
  }, [containerRef]);
}
