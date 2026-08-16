// THE TRANSCRIPT TAB-STOP BUDGET (#107). A message log whose every row contributes its own action
// cluster to the document tab order costs a keyboard reader O(thread length) Tab presses to reach the
// control below it — measured live on a three-message room: ~7 stops per message (Edit / Fork / More /
// View raw / Expand card / Collapse card / the card iframe / the turn disclosure), and 32 Tabs on a real
// thread never reached the composer's textbox.
//
// THE FIX IS THE APG COMPOSITE SHAPE, not a skip link: a skip link only helps a reader who activates it,
// so a bare Tab walk is still O(n). Exactly ONE row carries `tabindex="0"`; every OTHER row's interactive
// descendants are pushed out of the tab order here, and restored the moment focus enters that row. A
// reader therefore pays: one stop to the active row, at most that ONE row's own controls, then out — a
// constant, whatever the thread length.
//
// WHY NOT `inert`: it also kills pointer events, and a non-active row must stay fully clickable.
// WHY NOT a React prop threaded to every control: the row's subtree is open-ended (feature contributions,
// rpg disclosures, sandboxed card iframes, the edit textarea) — a prop contract there is a wish, and the
// FIRST unthreaded control silently restores the O(n) walk. A DOM sweep is total by construction.
//
// THE STASH IS WHAT MAKES IT REVERSIBLE: an element's ORIGINAL tabindex (including "no attribute at all")
// is parked on `data-orb-tab-stop` before suppression and put back verbatim on restore, so a control that
// deliberately carries `tabIndex={-1}` (option-strip rows) or a positive index is not silently rewritten.

import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

/** How the log's rows participate in the document tab order. */
export type MessageListRowNavigation = "none" | "roving";

/** The row wrapper the primitive stamps; the sweep's unit of work. */
export const MESSAGE_LIST_ROW_SLOT = "message-list-row";

const ROW_SELECTOR = `[data-slot="${MESSAGE_LIST_ROW_SLOT}"]`;

/** Everything the browser would put in the sequential focus order. `[tabindex]` catches the
 *  scripted-focusable widgets (Base UI popup triggers, the sandbox-frame host) a tag list misses. */
const FOCUSABLE_SELECTOR = "a[href],area[href],audio[controls],button,details,iframe,input,object,select,textarea,video[controls],[contenteditable],[tabindex]";

/** Where an element's pre-suppression tabindex is parked. Empty string ⇒ it had no attribute. */
const STASH_ATTRIBUTE = "data-orb-tab-stop";

function suppress(element: HTMLElement): void {
  if (!element.hasAttribute(STASH_ATTRIBUTE)) {
    element.setAttribute(STASH_ATTRIBUTE, element.getAttribute("tabindex") ?? "");
  }
  if (element.getAttribute("tabindex") !== "-1") {
    element.setAttribute("tabindex", "-1");
  }
}

function restore(element: HTMLElement): void {
  const stashed = element.getAttribute(STASH_ATTRIBUTE);
  if (stashed === null) {
    return;
  }
  element.removeAttribute(STASH_ATTRIBUTE);
  if (stashed === "") {
    element.removeAttribute("tabindex");
    return;
  }
  element.setAttribute("tabindex", stashed);
}

/** Pushes one row's interactive descendants out of (`tabbable: false`) or back into (`true`) the document
 *  tab order. Idempotent, which is what lets the sweep re-run on every mutation without measuring. */
function setRowTabStops(row: HTMLElement, tabbable: boolean): void {
  for (const element of row.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) {
    if (tabbable) {
      restore(element);
    } else {
      suppress(element);
    }
  }
}

/**
 * Sweeps every rendered row in `viewport`. A row is "entered" — and keeps its controls tabbable — exactly
 * while focus is INSIDE it, which is the auto-entry rule: a mouse click on a suppressed control still
 * focuses it (suppression only removes it from the SEQUENTIAL order), the resulting `focusin` re-sweeps,
 * and from that moment Tab walks the row normally. That is what keeps the edit-in-place textarea and its
 * Cancel/Save pair reachable for a reader who arrived by mouse.
 */
function sweepRowTabStops(viewport: HTMLElement): void {
  const active = viewport.ownerDocument.activeElement;
  for (const row of viewport.querySelectorAll<HTMLElement>(ROW_SELECTOR)) {
    setRowTabStops(row, active !== null && row.contains(active));
  }
}

/** The row element a node sits inside, or null when the node is not in a row. */
function closestRow(node: EventTarget | null): HTMLElement | null {
  return node instanceof Element ? node.closest<HTMLElement>(ROW_SELECTOR) : null;
}

/** The key of the item at `index`, or null when there is none. Module scope, not a `useCallback` —
 *  the React Compiler owns memoization on this tree (`no-manual-memo` gate). */
function keyAt<T>(items: readonly T[], getItemKey: (item: T, index: number) => string | number, index: number): string | number | null {
  const item = items.at(index);
  return item === undefined ? null : getItemKey(item, index);
}

/** The index a navigation key moves to, or null when the key is not one. Clamped by the caller. */
function rovingTargetIndex(key: string, current: number, count: number): number | null {
  switch (key) {
    case "ArrowDown":
      return current + 1;
    case "ArrowUp":
      return current - 1;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export interface RowRovingOptions<T> {
  /** False ⇒ every effect below is a no-op and the returned index is -1: the list is byte-identical. */
  readonly enabled: boolean;
  readonly items: readonly T[];
  readonly getItemKey: (item: T, index: number) => string | number;
  readonly viewportRef: RefObject<HTMLOListElement | null>;
  /** Bring a row into view before focus lands on it (the virtualizer's own scrollToIndex). */
  readonly scrollToIndex: (index: number) => void;
}

/**
 * Owns the whole roving concern and returns the index of the ONE tabbable row (-1 when disabled).
 *
 * The tab stop is tracked by ITEM KEY, never index: this list prepends ("load older history"), which
 * shifts every index but no key, so an index-tracked stop would silently jump to a different message.
 * `null` = nobody has moved it ⇒ the tail, which is where a bottom-anchored transcript's reader is.
 *
 * Listeners are attached NATIVELY rather than as JSX props: `focusin`/`focusout` are what this actually
 * wants (React's onFocus/onBlur are those events wearing a different name), the behaviour is imperative
 * anyway, and it keeps a non-interactive `<ol>` free of handler props that read as a role claim.
 */
export function useRowRoving<T>({ enabled, items, getItemKey, viewportRef, scrollToIndex }: RowRovingOptions<T>): number {
  const [activeKey, setActiveKey] = useState<string | number | null>(null);
  // The focus() call waits for the row to MOUNT — an arrow press can target a virtualized-out row, so the
  // scroll happens first and a per-commit effect retries until the node exists (media-grid's precedent).
  // Index, not key: this is a within-a-few-frames handoff, not durable state.
  const pendingFocusIndexRef = useRef<number | null>(null);

  const count = items.length;
  const activeIndex = ((): number => {
    if (!enabled || count === 0) {
      return -1;
    }
    if (activeKey !== null) {
      const found = items.findIndex((item, index) => getItemKey(item, index) === activeKey);
      if (found >= 0) {
        return found;
      }
    }
    return count - 1;
  })();

  // THE SWEEP IS MUTATION-DRIVEN, not commit-driven — because the things that can restore a control to the
  // tab order are not all React commits of THIS component: a virtualized row mounts on scroll, a streaming
  // ghost re-renders only itself, a card fence closes and mints buttons plus an iframe, and a child
  // component re-renders writing its own `tabIndex` prop back over ours. `attributeFilter: ["tabindex"]`
  // catches that last class; the loop it looks like it would create cannot happen, because the sweep only
  // WRITES when the value differs — a settled tree produces no mutations, so the cascade converges in one
  // extra pass. (An unkeyed per-commit effect was the alternative and covers strictly less.)
  useEffect((): (() => void) | undefined => {
    const viewport = viewportRef.current;
    if (!enabled || viewport === null) {
      return;
    }
    sweepRowTabStops(viewport);
    if (typeof MutationObserver === "undefined") {
      return;
    }
    const observer = new MutationObserver((): void => sweepRowTabStops(viewport));
    observer.observe(viewport, { attributeFilter: ["tabindex"], attributes: true, childList: true, subtree: true });
    return (): void => observer.disconnect();
  }, [enabled, viewportRef]);

  // Deliberately unkeyed: it retries the pending focus each commit and no-ops once satisfied.
  useEffect((): void => {
    const pending = pendingFocusIndexRef.current;
    const viewport = viewportRef.current;
    if (pending === null || viewport === null) {
      return;
    }
    const row = viewport.querySelector<HTMLElement>(`${ROW_SELECTOR}[data-index="${pending}"]`);
    if (row !== null) {
      row.focus();
      pendingFocusIndexRef.current = null;
    }
  });

  useEffect((): (() => void) | undefined => {
    const viewport = viewportRef.current;
    if (!enabled || viewport === null) {
      return;
    }
    const moveTo = (target: number): void => {
      const clamped = Math.min(Math.max(target, 0), count - 1);
      const key = keyAt(items, getItemKey, clamped);
      if (key === null) {
        return;
      }
      setActiveKey(key);
      pendingFocusIndexRef.current = clamped;
      scrollToIndex(clamped);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      const row = closestRow(event.target);
      if (row === null) {
        return;
      }
      // ESCAPE IS THE EXIT GESTURE: from anywhere inside a row's controls it hands focus back to the row,
      // which is also the keystroke that re-suppresses that row (the sweep reads document.activeElement).
      if (event.key === "Escape" && event.target !== row) {
        event.preventDefault();
        row.focus();
        return;
      }
      // Arrow/Home/End move rows only from the ROW itself — inside a control they belong to that control
      // (a textarea's caret, a menu's own navigation).
      if (event.target !== row) {
        return;
      }
      const next = rovingTargetIndex(event.key, activeIndex, count);
      if (next === null) {
        return;
      }
      event.preventDefault();
      moveTo(next);
    };
    // Auto-entry: focus landing anywhere in a row (a click on a suppressed control, an autofocused edit
    // textarea, a programmatic focus) makes that row the active one and re-sweeps, so the reader can Tab
    // through the controls they just reached.
    const onFocusIn = (event: FocusEvent): void => {
      const row = closestRow(event.target);
      if (row !== null) {
        const index = Number(row.dataset["index"]);
        const key = Number.isInteger(index) ? keyAt(items, getItemKey, index) : null;
        if (key !== null) {
          setActiveKey(key);
        }
      }
      sweepRowTabStops(viewport);
    };
    // Deferred: at focusout time `document.activeElement` is still the OLD node (or <body> mid-hop), so a
    // synchronous sweep would suppress the control focus is about to land on.
    const onFocusOut = (): void => queueMicrotask((): void => sweepRowTabStops(viewport));

    viewport.addEventListener("keydown", onKeyDown);
    viewport.addEventListener("focusin", onFocusIn);
    viewport.addEventListener("focusout", onFocusOut);
    return (): void => {
      viewport.removeEventListener("keydown", onKeyDown);
      viewport.removeEventListener("focusin", onFocusIn);
      viewport.removeEventListener("focusout", onFocusOut);
    };
  }, [enabled, viewportRef, count, activeIndex, items, getItemKey, scrollToIndex]);

  return activeIndex;
}
