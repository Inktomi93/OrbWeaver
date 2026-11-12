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
interface ConnectedNode {
  readonly isConnected: boolean;
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
/** How long after a press a surface may still arrive from `<body>` on that press's account: the render the press causes, a view
 *  transition's deferred update included, settles well inside it. A mount past it is not that press's navigation. */
export const PRESS_RENDER_WINDOW_MS = 500;

interface Press {
  readonly target: ConnectedNode;
  readonly at: number;
}
// The control the reader's last press landed on and when, to tell a surface arriving because that control was removed (a navigation)
// from one mounting on a cold load (no press) or long after a press that went nowhere. One arrival consumes it.
let lastPress: Press | null = null;
function isConnectedNode(target: object | null): target is ConnectedNode {
  return target !== null && "isConnected" in target;
}
function notePress(target: object | null): void {
  lastPress = isConnectedNode(target) ? { target, at: performance.now() } : null;
}
function pressRemovedItsControl(): boolean {
  return lastPress !== null && !lastPress.target.isConnected && performance.now() - lastPress.at <= PRESS_RENDER_WINDOW_MS;
}

/** Called by a pending read's fallback when it mounts. A fallback that mounts in the render a press caused keeps that press's arrival open
 *  until it unmounts, however long the read takes. The surface it waits on mounts in the commit that deletes the fallback, and React runs a
 *  deleted fallback's cleanup (this release, which starts the press's window over) before the new content's mount effects, so the surface arrives
 *  inside the new window. Nothing else mounting while the read is pending is that press's navigation, so no surface is licensed before the
 *  release. Any other fallback holds nothing. Returns the release. */
export function holdArrivalWhilePending(): () => void {
  if (!pressRemovedItsControl() || lastPress === null) {
    return (): void => undefined;
  }
  const { target } = lastPress;
  return (): void => {
    if (lastPress?.target === target) {
      lastPress = { target, at: performance.now() };
    }
  };
}
browserDocument?.addEventListener(
  "keydown",
  ({ key, target }) => {
    if (key === "Enter") {
      pressedFrom = browserDocument.activeElement;
      notePress(target);
    }
  },
  { capture: true },
);
browserDocument?.addEventListener(
  "click",
  ({ target }) => {
    const active = browserDocument.activeElement;
    pressedFrom = active === target ? null : active;
    notePress(target);
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
 *  move focus into the new surface. The `<body>`/null check is the initial-load ⇄ navigation discriminator,
 *  with one exception: a press whose own control the same render removed (a You-sheet row that opens a section
 *  closes with it) also leaves focus on `<body>`, and that is a navigation, so the surface arrives there too.
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

/** Whether arrival may move focus off `active`: from a real element unless it keeps focus, and from `<body>` only when the last
 *  press landed on a control that is gone now, within {@link PRESS_RENDER_WINDOW_MS} (a cold load has no such press). */
function mayTakeFocus(active: MinimalElement | null | undefined, target: FocusTarget | null): boolean {
  if (active === null || active === undefined || active === browserDocument?.body) {
    return pressRemovedItsControl();
  }
  return !keepsFocus(active, target);
}

function useArrivalFocus(ref: RefObject<FocusTarget | null>, { enabled, repeatOnReveal, preserveFocus, bandFirst }: ArrivalOptions): void {
  const handled = useRef(false);
  useEffect(() => {
    if (!enabled || preserveFocus?.() === true || (!repeatOnReveal && handled.current)) {
      return;
    }
    handled.current = true;
    if (!mayTakeFocus(browserDocument?.activeElement, ref.current)) {
      return;
    }
    lastPress = null;
    const band = bandFirst ? (browserDocument?.querySelector(LIST_BAND_FIRST_CONTROL) ?? null) : null;
    (band ?? ref.current)?.focus();
  }, [ref, enabled, repeatOnReveal, preserveFocus, bandFirst]);
}

/** Focus a freshly-mounted surface UNCONDITIONALLY — for an IN-PLACE swap, where the control the user just
 *  activated is REMOVED by the same render that mounts this surface.
 *
 *  What the sibling does that {@link useFocusOnMount} does not: it never stands down. It takes focus from a text
 *  field or an open overlay, and it needs no recorded press, so it also lands when the control that held focus went
 *  away through something other than a click or Enter. The caller opts in per site because that guard is what
 *  protects the rail's tab order on a cold load; a surface using THIS hook must only mount as the direct result
 *  of a user activation. */
export function useFocusOnSwap(ref: RefObject<FocusTarget | null>, enabled = true): void {
  useEffect(() => {
    if (enabled) {
      ref.current?.focus();
    }
  }, [ref, enabled]);
}
