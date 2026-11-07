import type { RefObject } from "react";
import { useEffect, useRef } from "react";

// `document` is reached via a `globalThis` cast with an inline structural type — NOT the bare `document`
// global. This hook is re-exported through the `#lib` barrel and is import-reachable from the DOM-LESS
// root aggregator program (`tsconfig.json`, a node lib with no lib.dom), where the `document` NAME isn't
// declared (TS2584). Keeping the file DOM-TYPE-free lets it survive that program; the browser supplies the
// real `document` at runtime (the hook only ever runs inside a mounted React tree, i.e. the browser).
interface MinimalElement {
  readonly closest: (selector: string) => object | null;
  readonly matches: (selector: string) => boolean;
}
interface FocusTarget {
  readonly focus: () => void;
  readonly closest?: MinimalElement["closest"];
}
interface MinimalDocument {
  readonly activeElement: MinimalElement | null;
  readonly body: MinimalElement;
  readonly querySelector: (selector: string) => FocusTarget | null;
}
const DIALOG_FOCUS_SCOPE = '[role="dialog"], [role="alertdialog"]';
const TEXT_ENTRY_OUTSIDE_ROOM = ':is(input, textarea, [contenteditable="true"]):not([data-slot="chat-room-surface"] *)';
// The LIST band's controls in tab order: the back chevron, then the pane's primary action. The band is a
// sibling region of the surface, so the surface finds it through the slots `ListPaneHeader` stamps.
// An action that moved into the menu is inert, so the first VISIBLE control is the next action, or the menu trigger.
const LIST_BAND_FIRST_CONTROL =
  '[data-panel-side="list"] :is([data-slot="list-pane-back"], [data-slot="list-pane-action"] :is(button, a[href], input, select, textarea)):not(:disabled):not([inert] *):not([data-overflowed] *)';
const browserDocument = (globalThis as { document?: MinimalDocument }).document;

/** Focus a freshly-mounted surface — keyboard/SR focus management for when the user NAVIGATES to it.
 *
 *  Skips the INITIAL page load. On first render nothing is focused yet (`activeElement` is `<body>`/null),
 *  and stealing focus into the content region THERE moves the browser's start-of-tab-order PAST the rail
 *  nav — a keyboard user's first Tab would skip the entire primary navigation (WCAG 2.4.3 Focus Order /
 *  2.1.1 Keyboard). On a real navigation or modal-open the user has activated a control (or `SectionContent`
 *  focused the content anchor on the section change first), so `activeElement` is a real element ⇒ we DO
 *  move focus into the new surface. The `<body>`/null check is the exact initial-load ⇄ navigation
 *  discriminator, with no timing flag. */
/** @param repeatOnReveal - `false` keeps a retained entity from replaying cold focus when Activity restores its effects.
 * @param enabled - `false` stands the surface DOWN — another surface owns focus for this mount by an
 *  explicit INTENT decision (the character screen's LIST projection: a selection made from the list picker
 *  focuses the pane the user just transformed, so the CONTENT editor mounting beside it must not take it
 *  back). Defaults to `true`, so every other caller is unchanged. */
export function useFocusOnMount(ref: RefObject<FocusTarget | null>, enabled = true, repeatOnReveal = true, preserveFocus?: () => boolean): void {
  useArrivalFocus(ref, { enabled, repeatOnReveal, preserveFocus, bandFirst: false, yieldsToTyping: false });
}

/** {@link useFocusOnMount} for the room, whose body mounts in a deferred render after its frame: by then the user may
 *  be typing in the topbar or a side pane, and taking that field's focus would cancel what they typed. A text field
 *  inside the room does not count. */
export function useFocusRoomArrival(ref: RefObject<FocusTarget | null>, enabled = true): void {
  useArrivalFocus(ref, { enabled, repeatOnReveal: true, preserveFocus: undefined, bandFirst: false, yieldsToTyping: true });
}

/** {@link useFocusOnMount} for a LIST surface under a band: arrival lands on the band's first control, so a
 *  forward Tab runs New, search, rows instead of starting past the band. A band with no control (the phone
 *  sheds its action) keeps the surface root as the target. */
export function useFocusListArrival(ref: RefObject<FocusTarget | null>, enabled = true): void {
  useArrivalFocus(ref, { enabled, repeatOnReveal: true, preserveFocus: undefined, bandFirst: true, yieldsToTyping: false });
}

interface ArrivalOptions {
  readonly enabled: boolean;
  readonly repeatOnReveal: boolean;
  readonly preserveFocus: (() => boolean) | undefined;
  /** Land on the LIST band's first control when it has one, else on `ref`. */
  readonly bandFirst: boolean;
  /** Stand down while a text field outside the room holds focus. */
  readonly yieldsToTyping: boolean;
}

function keepsFocus(active: MinimalElement, target: FocusTarget | null, yieldsToTyping: boolean): boolean {
  if (yieldsToTyping && active.matches(TEXT_ENTRY_OUTSIDE_ROOM)) {
    return true;
  }
  // A background surface cannot take arrival focus from a surviving global dialog.
  return active.closest(DIALOG_FOCUS_SCOPE) !== null && (target?.closest?.(DIALOG_FOCUS_SCOPE) ?? null) === null;
}

function useArrivalFocus(ref: RefObject<FocusTarget | null>, { enabled, repeatOnReveal, preserveFocus, bandFirst, yieldsToTyping }: ArrivalOptions): void {
  const handled = useRef(false);
  useEffect(() => {
    if (!enabled || preserveFocus?.() === true || (!repeatOnReveal && handled.current)) {
      return;
    }
    handled.current = true;
    const active = browserDocument?.activeElement;
    if (active === null || active === undefined || active === browserDocument?.body) {
      return;
    }
    if (keepsFocus(active, ref.current, yieldsToTyping)) {
      return;
    }
    const band = bandFirst ? (browserDocument?.querySelector(LIST_BAND_FIRST_CONTROL) ?? null) : null;
    (band ?? ref.current)?.focus();
  }, [ref, enabled, repeatOnReveal, preserveFocus, bandFirst, yieldsToTyping]);
}

/** Focus a freshly-mounted surface UNCONDITIONALLY — for an IN-PLACE swap, where the control the user just
 *  activated is REMOVED by the same render that mounts this surface.
 *
 *  Why the sibling exists: `useFocusOnMount`'s `<body>` check is an initial-load discriminator, and it
 *  cannot tell "the page just loaded" from "the button I was standing on was destroyed" — both leave
 *  `activeElement` at `<body>`. The preset section/template drill-ins are exactly the second case (the
 *  chevron that opened the editor unmounts with the list), so the guarded hook silently declined and focus
 *  stayed on `<body>` in BOTH directions (side-eye F-04). The caller opts in per site because the guard is
 *  what protects the rail's tab order on a cold load; a surface using THIS hook must only mount as the
 *  direct result of a user activation. */
export function useFocusOnSwap(ref: RefObject<FocusTarget | null>, enabled = true): void {
  useEffect(() => {
    if (enabled) {
      ref.current?.focus();
    }
  }, [ref, enabled]);
}
