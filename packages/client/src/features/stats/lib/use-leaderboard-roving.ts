// useLeaderboardRoving — the roving-tabindex keyboard contract for the analytics leaderboard, whose rows
// are clickable `ListRow` bodies (`<button data-slot="list-row-body">`) inside a `<VirtualList>` (side-eye
// rail-analytics 2026-08-19 P2g).
//
// THE DEFECT IT CLOSES. Every leaderboard row rendered `tabIndex=0`, so tabbing PAST the pane cost one stop
// per row — 54 consecutive stops through controls the user was not aiming at. The list is a role="list" of
// role="listitem" (VirtualList owns those roles; a row is NOT an `option`/`radio`), so the fix is the plain
// roving contract: exactly one row body is tabbable, Arrow/Home/End move focus, and the row's own click
// handler (the drill) is Enter/Space on the native button — this hook never activates anything.
//
// WHY A MUTATION OBSERVER over childList AND `tabindex` (not a no-dep layout effect, the useRovingRadioGroup
// shape). `VirtualList` writes the rendered window straight to the DOM (`directDomUpdates`) and re-renders
// each `ListRow` as it measures — and `ListRow` hard-codes `tabIndex={0}` on its body, so React re-stamps
// `0` on the rows this hook set to `-1`. The observer re-applies the roving stop whenever the window's
// buttons change OR a row's `tabindex` is clobbered; the writes disconnect/reconnect the observer so they
// never re-trigger themselves. `focusin` re-applies it so the tab stop follows the focused row.
//
// ROVING IS OVER THE RENDERED WINDOW: only the windowed rows are in the DOM (that IS the tab-stop fix), and
// Arrow at the window edge focuses the edge row, whose native focus-scroll advances `VirtualList` to render
// the next one. Home/End move within the rendered set.

import type { RefObject } from "react";
import { useEffect } from "react";

const ROW_SELECTOR = '[data-slot="list-row-body"]';
const NEXT_KEYS: ReadonlySet<string> = new Set(["ArrowDown", "ArrowRight"]);
const PREVIOUS_KEYS: ReadonlySet<string> = new Set(["ArrowUp", "ArrowLeft"]);

function rowsIn(container: HTMLElement): readonly HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(ROW_SELECTOR)];
}

/** The index the roving tab stop belongs to: the focused row, else the current selection, else the first. */
function tabbableIndex(rows: readonly HTMLElement[]): number {
  const focused = rows.findIndex((row) => row === document.activeElement);
  if (focused !== -1) {
    return focused;
  }
  const selected = rows.findIndex((row) => row.getAttribute("aria-current") === "true");
  return selected === -1 ? 0 : selected;
}

/** Clamp within the rendered set (a list does not wrap; End is the last rendered row). `null` = not ours. */
function targetIndex(key: string, from: number, count: number): number | null {
  if (NEXT_KEYS.has(key)) {
    return Math.min(from + 1, count - 1);
  }
  if (PREVIOUS_KEYS.has(key)) {
    return Math.max(from - 1, 0);
  }
  if (key === "Home") {
    return 0;
  }
  return key === "End" ? count - 1 : null;
}

/**
 * Applies the roving-tabindex contract to the leaderboard row bodies inside `containerRef`: exactly one
 * `[data-slot="list-row-body"]` is tabbable (the focused row, else the selection, else the first) and
 * Arrow/Home/End move focus. A container that renders no rows is a no-op, so it can mount unconditionally.
 */
export function useLeaderboardRoving(containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    const observe = (): void => observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["tabindex"] });
    const applyRoving = (): void => {
      const rows = rowsIn(container);
      const tabbable = tabbableIndex(rows);
      // Disconnect around the writes so THIS hook's own `tabindex` changes don't re-enter the observer.
      observer.disconnect();
      for (const [at, row] of rows.entries()) {
        const next = at === tabbable ? 0 : -1;
        if (row.tabIndex !== next) {
          row.tabIndex = next;
        }
      }
      observe();
    };
    // The observer fires on a windowed row being added/removed (`childList`) AND on `ListRow` re-stamping
    // its default `tabIndex={0}` over a `-1` this hook set (`attributes`) — both are the roving stop drifting.
    const observer = new MutationObserver(applyRoving);
    applyRoving();
    container.addEventListener("focusin", applyRoving);
    return (): void => {
      observer.disconnect();
      container.removeEventListener("focusin", applyRoving);
    };
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target.getAttribute("data-slot") !== "list-row-body") {
        return;
      }
      const rows = rowsIn(container);
      const from = rows.indexOf(target);
      if (from === -1) {
        return;
      }
      const to = targetIndex(event.key, from, rows.length);
      if (to === null) {
        return;
      }
      const next = rows[to];
      if (next === undefined) {
        return;
      }
      // Only OUR keys are swallowed — the arrows that navigate rows are no longer the page's scroll.
      event.preventDefault();
      next.tabIndex = 0;
      next.focus();
    };
    container.addEventListener("keydown", onKeyDown);
    return (): void => container.removeEventListener("keydown", onKeyDown);
  }, [containerRef]);
}
