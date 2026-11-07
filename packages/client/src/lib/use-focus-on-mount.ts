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
  readonly parentElement: MinimalElement | null;
}
interface FocusTarget {
  readonly focus: () => void;
  readonly closest?: MinimalElement["closest"];
}
interface MinimalEvent {
  readonly key?: string;
  readonly target: object | null;
}
interface MinimalDocument {
  readonly activeElement: MinimalElement | null;
  readonly body: MinimalElement;
  readonly querySelector: (selector: string) => FocusTarget | null;
  readonly addEventListener: (type: string, listener: (event: MinimalEvent) => void, options: { readonly capture: boolean }) => void;
}
const OVERLAY_FOCUS_SCOPE = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';
// A checkbox or a button is an `input` too: nothing is typed there, so arrival moves on from it.
const TEXT_ENTRY =
  ':is(textarea, [contenteditable="true"], input:not([type="button"], [type="checkbox"], [type="color"], [type="file"], [type="image"], [type="radio"], [type="range"], [type="reset"], [type="submit"]))';
// The LIST band's controls in tab order: the back chevron, then the pane's primary action. The band is a
// sibling region of the surface, so the surface finds it through the slots `ListPaneHeader` stamps.
// An action that moved into the menu is inert, so the first VISIBLE control is the next action, or the menu trigger.
const LIST_BAND_FIRST_CONTROL =
  '[data-panel-side="list"] :is([data-slot="list-pane-back"], [data-slot="list-pane-action"] :is(button, a[href], input, select, textarea)):not(:disabled):not([inert] *):not([data-overflowed] *)';
const browserDocument = (globalThis as { document?: MinimalDocument }).document;

// The field the reader's last press came from: Enter in it, or a click on a hit that left focus in it. Arrival cannot see the
// press, and only this tells a field that started the arrival from one the reader went on typing in. Typing clears it, and a
// click on the field itself activates nothing.
let pressedFrom: MinimalElement | null = null;
browserDocument?.addEventListener(
  "keydown",
  ({ key }) => {
    if (key === "Enter") {
      pressedFrom = browserDocument.activeElement;
    }
  },
  { capture: true },
);
browserDocument?.addEventListener(
  "click",
  ({ target }) => {
    const active = browserDocument.activeElement;
    pressedFrom = active === target ? null : active;
  },
  { capture: true },
);
browserDocument?.addEventListener(
  "input",
  () => {
    pressedFrom = null;
  },
  { capture: true },
);

/** Focus a freshly-mounted surface — keyboard/SR focus management for when the user NAVIGATES to it.
 *
 *  Skips the INITIAL page load. On first render nothing is focused yet (`activeElement` is `<body>`/null),
 *  and stealing focus into the content region THERE moves the browser's start-of-tab-order PAST the rail
 *  nav — a keyboard user's first Tab would skip the entire primary navigation (WCAG 2.4.3 Focus Order /
 *  2.1.1 Keyboard). On a real navigation or modal-open the user has activated a control (or `SectionContent`
 *  focused the content anchor on the section change first), so `activeElement` is a real element ⇒ we DO
 *  move focus into the new surface. The `<body>`/null check is the exact initial-load ⇄ navigation
 *  discriminator, with no timing flag.
 *
 *  A surface can arrive long after the press that opened it, behind a read or a deferred render. By then the user may be
 *  typing elsewhere, and a blur can cancel what they typed, or working in an open menu. So a text field outside the target
 *  and an overlay the target is not in keep focus; a row, a button or a field that only started the arrival does not. */
/** @param repeatOnReveal - `false` keeps a retained entity from replaying cold focus when Activity restores its effects.
 * @param enabled - `false` stands the surface DOWN — another surface owns focus for this mount by an
 *  explicit INTENT decision (the character screen's LIST projection: a selection made from the list picker
 *  focuses the pane the user just transformed, so the CONTENT editor mounting beside it must not take it
 *  back). Defaults to `true`, so every other caller is unchanged. */
export function useFocusOnMount(ref: RefObject<FocusTarget | null>, enabled = true, repeatOnReveal = true, preserveFocus?: () => boolean): void {
  useArrivalFocus(ref, { enabled, repeatOnReveal, preserveFocus, bandFirst: false });
}

/** {@link useFocusOnMount} for a LIST surface under a band: arrival lands on the band's first control, so a
 *  forward Tab runs New, search, rows instead of starting past the band. A band with no control (the phone
 *  sheds its action) keeps the surface root as the target. */
export function useFocusListArrival(ref: RefObject<FocusTarget | null>, enabled = true): void {
  useArrivalFocus(ref, { enabled, repeatOnReveal: true, preserveFocus: undefined, bandFirst: true });
}

interface ArrivalOptions {
  readonly enabled: boolean;
  readonly repeatOnReveal: boolean;
  readonly preserveFocus: (() => boolean) | undefined;
  /** Land on the LIST band's first control when it has one, else on `ref`. */
  readonly bandFirst: boolean;
}

function isInside(target: object | null, node: MinimalElement | null): boolean {
  return node !== null && (node === target || isInside(target, node.parentElement));
}

function keepsFocus(active: MinimalElement, target: FocusTarget | null): boolean {
  if (active !== pressedFrom && active.matches(TEXT_ENTRY) && !isInside(target, active)) {
    return true;
  }
  // A background surface cannot take arrival focus from a surviving overlay.
  return active.closest(OVERLAY_FOCUS_SCOPE) !== null && (target?.closest?.(OVERLAY_FOCUS_SCOPE) ?? null) === null;
}

function useArrivalFocus(ref: RefObject<FocusTarget | null>, { enabled, repeatOnReveal, preserveFocus, bandFirst }: ArrivalOptions): void {
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
    if (keepsFocus(active, ref.current)) {
      return;
    }
    const band = bandFirst ? (browserDocument?.querySelector(LIST_BAND_FIRST_CONTROL) ?? null) : null;
    (band ?? ref.current)?.focus();
  }, [ref, enabled, repeatOnReveal, preserveFocus, bandFirst]);
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
