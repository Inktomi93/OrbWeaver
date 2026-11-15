// Keyboard focus may enter a card or reply frame only by the reader's own hand: a press or tap on that frame, or Tab or
// Shift+Tab from the app (D294, D354). An interactive frame runs model-written or preset-written script, which can call
// `focus()` at any time. Focus taken that way would hand it every key the reader presses next, and its WebRTC channel
// (residual R1 in `packages/kit/src/card-frame/index.ts`) can carry them off the box. Focus that enters any other way
// goes back to the app element the reader last held, never into another frame. The decision, the learned press signal
// and the grab-loop stop are pure, in `packages/kit/src/card-frame/focus.ts`; this module observes the browser and
// feeds them.
//
// WHAT THE HOST CAN SEE, measured in Chromium (frame in and out of process) and WebKit. Gecko is not measured.
// - Focus entering a frame from an app element fires that element's `focusout`; from the bare page, the app window's
//   `blur`. Every such entry is judged, even into a frame the reader admitted before: an earlier press is not consent
//   to take the keyboard back later. Focus moving from one frame to another fires nothing in the app, so a check of
//   `document.activeElement` runs once per animation frame while a frame holds focus.
// - A press or tap inside a frame fires no app event, but the iframe matches `:active` as the focus moves. WebKit
//   clears it within a task, so it is read at the event. A frame's own `focus()` leaves it unmatched. Chromium with the
//   frame in process is the exception: a tap there does not match it.
// - The mouse entering a frame fires an app `pointerover` on the iframe; a touch leaves the iframe matching `:hover`.
// - A Tab pressed in the app is an app `keydown`; the focus move it makes is dispatched inside it.
// - A `focus()` the app makes while the browser dispatches that blur, or in its microtasks, does not take focus back
//   from a frame out of process, so the return runs in the next task.
//
// WHAT IT CANNOT SEE, and how each gap fails:
// - (OPEN, bounded) Keys pressed between a frame's `focus()` and the return land in the frame. For a frame out of
//   process the app learns of the move only from the browser, so the window cannot close: it is the browser's message
//   plus one task. A grab loop is stopped after FRAME_FOCUS_GRAB_LOOP_BOUND windows; a frame that takes focus more
//   slowly than FRAME_FOCUS_GRAB_GAP_MS is refused each time and never stopped.
// - (OPEN, bounded) Focus moving between frames is read up to one animation frame late, and keys in that frame land in
//   the frame that moved. A press released within that frame is missed, and refused.
// - (OPEN) On a touch screen with a frame in process, a tap shows only as `:hover`, so the frame under the last touch
//   is admitted while the page holds an activation and no app press or key came within APP_INPUT_ACTIVATION_MS.
// - (OPEN) On an engine that does not mark a press, see the kit module: the frame under the pointer is admitted while
//   the page holds an activation, and nothing is ever stopped.
// - A Tab pressed inside a frame is invisible, so tabbing from one frame straight into the next is refused, and focus
//   returns to the app.
// - A screen reader command that moves into a frame without a Tab or a press is refused, one move at a time.

import type { FrameFocusEntry, FramePressSignal, FrameRefusalRun } from "@orb/kit/card-frame";
import { APP_INPUT_ACTIVATION_MS, admitsFrameFocus, foldFramePressSignal, foldFrameRefusal, learnsUnmarkedPress, stopsFrameScripts } from "@orb/kit/card-frame";

// Where the mouse pointer rests: on which gated frame, since when, and whether the page held an activation then.
interface PointerVisit {
  readonly frame: HTMLIFrameElement;
  readonly sinceMs: number;
  readonly activeWhenEntered: boolean;
}

// What the app saw at the moment focus moved, before WebKit clears `:active` or the Tab's flag goes.
interface FocusMove {
  readonly pressed: HTMLIFrameElement | undefined;
  readonly touched: HTMLIFrameElement | undefined;
  readonly tabbed: boolean;
  readonly visit: PointerVisit | undefined;
  readonly active: boolean;
}

interface GatedFrame {
  readonly veiled: () => boolean;
  readonly stop: () => void;
  run: FrameRefusalRun | undefined;
}

// The places the reader held focus, newest last: the app elements they focused and the frames admitted. A refusal
// returns focus only to an app element; the frames are kept so the per-frame check knows which frame holds focus.
const HOLDERS_KEPT = 8;
const TOUCH_SCREEN_QUERY = "(hover: none)";

const gated = new Map<HTMLIFrameElement, GatedFrame>();
const holders: Element[] = [];
let pressSignal: FramePressSignal = "unknown";
let visit: PointerVisit | undefined;
let lastPointerWasTouch = false;
let appInputAt = Number.NEGATIVE_INFINITY;
let frameFocusAt = Number.NEGATIVE_INFINITY;
let tabbing = false;
let watching = false;

function hold(element: Element): void {
  const at = holders.indexOf(element);
  if (at !== -1) {
    holders.splice(at, 1);
  }
  holders.push(element);
  if (holders.length > HOLDERS_KEPT) {
    holders.shift();
  }
}

function asGated(element: EventTarget | null): HTMLIFrameElement | undefined {
  return element instanceof HTMLIFrameElement && gated.has(element) ? element : undefined;
}

function gatedMatching(selector: string): HTMLIFrameElement | undefined {
  for (const frame of gated.keys()) {
    if (frame.matches(selector)) {
      return frame;
    }
  }
  return undefined;
}

function pageActive(): boolean {
  return "userActivation" in navigator && navigator.userActivation.isActive;
}

function activatedByTouch(active: boolean): boolean {
  const touchScreen = lastPointerWasTouch || globalThis.matchMedia(TOUCH_SCREEN_QUERY).matches;
  return touchScreen && active && performance.now() - appInputAt >= APP_INPUT_ACTIVATION_MS;
}

function observeMove(): FocusMove {
  const active = pageActive();
  return {
    pressed: gatedMatching(":active"),
    touched: activatedByTouch(active) ? gatedMatching(":hover") : undefined,
    tabbed: tabbing,
    visit,
    active,
  };
}

// Focus the newest app element the reader held that is still on the page; with none, take focus out of the frame onto
// the app document. NEVER INTO ANOTHER FRAME: a host move into a frame is an entry the host would have to tell apart
// from that frame's own, and a refusal of one frame must never be judged against another. The cost: a reader typing in
// one card when another grabs loses their place in the first and clicks back in.
function returnFocus(refused: HTMLIFrameElement): void {
  for (let index = holders.length - 1; index >= 0; index -= 1) {
    const holder = holders[index];
    if (holder instanceof HTMLElement && !(holder instanceof HTMLIFrameElement) && holder.isConnected) {
      holder.focus({ preventScroll: true });
      if (document.activeElement === holder) {
        return;
      }
    }
  }
  refused.blur();
}

// Focus is in `frame` after `move`: keep it and remember the frame as a place to return to, or send it back and count
// the refusal toward a grab loop. Constant work, so a frame that calls `focus()` in a loop costs one check per call.
function judge(frame: HTMLIFrameElement, move: FocusMove): void {
  const record = gated.get(frame);
  if (record === undefined) {
    return;
  }
  const nowMs = performance.now();
  const pointedVisit = move.visit?.frame === frame ? move.visit : undefined;
  const entry: FrameFocusEntry = {
    veiled: record.veiled(),
    tabbedFromApp: move.tabbed,
    pressed: move.pressed === frame,
    touchedLast: move.touched === frame,
    pointedWhileActive: pointedVisit !== undefined && move.active,
  };
  const learnsUnmarked = learnsUnmarkedPress({
    pressedOrTabbed: entry.pressed || entry.tabbedFromApp,
    pointerOnFrameSinceMs: pointedVisit?.sinceMs,
    activeWhenPointerEntered: pointedVisit?.activeWhenEntered ?? true,
    activeNow: move.active,
    lastAppInputMs: appInputAt,
    lastFrameFocusMs: frameFocusAt,
  });
  pressSignal = foldFramePressSignal(pressSignal, { pressed: entry.pressed, learnsUnmarked });
  frameFocusAt = nowMs;
  if (admitsFrameFocus(entry, pressSignal)) {
    hold(frame);
    return;
  }
  returnFocus(frame);
  record.run = foldFrameRefusal(record.run, nowMs);
  if (stopsFrameScripts(record.run, pressSignal)) {
    record.stop();
  }
}

// Judge the frame that holds focus now. `fresh` is an entry the app just saw happen; the per-frame check passes
// false and skips the frame already admitted, which still holds the focus it was given.
function judgeFocused(move: FocusMove, fresh: boolean): void {
  const frame = asGated(document.activeElement);
  if (frame === undefined) {
    return;
  }
  if (fresh || holders.at(-1) !== frame) {
    judge(frame, move);
  }
}

// While a frame holds focus, one check per animation frame catches focus moving to another frame, and keeps the time a
// frame last held focus current: a key typed in a frame makes an activation the app never sees.
function watchFrames(): void {
  if (watching) {
    return;
  }
  watching = true;
  const check = (): void => {
    if (asGated(document.activeElement) === undefined) {
      watching = false;
      return;
    }
    frameFocusAt = performance.now();
    judgeFocused(observeMove(), false);
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

// An app element's `focusout` and the window's `blur` can both fire for one move. The second finds focus already
// returned after a refusal, or judges an admitted entry again from the same observation and admits it again.
const onFocusLeavesApp = (): void => {
  const move = observeMove();
  setTimeout(() => {
    judgeFocused(move, true);
    if (asGated(document.activeElement) !== undefined) {
      watchFrames();
    }
  }, 0);
};

const onFocusIn = (event: FocusEvent): void => {
  if (event.target instanceof Element && asGated(event.target) === undefined) {
    hold(event.target);
  }
};

const onPointer = (event: PointerEvent): void => {
  lastPointerWasTouch = event.pointerType === "touch";
  if (event.type === "pointerdown" && event.isTrusted) {
    appInputAt = performance.now();
  }
  if (event.type === "pointerover" && event.isTrusted && event.pointerType === "mouse") {
    const frame = asGated(event.target);
    visit = frame === undefined ? undefined : { frame, sinceMs: performance.now(), activeWhenEntered: pageActive() };
  }
};

const onKeyDown = (event: KeyboardEvent): void => {
  if (!event.isTrusted) {
    return;
  }
  appInputAt = performance.now();
  // The focus move a Tab makes is dispatched inside this keydown; the flag is gone by the next task.
  if (event.key === "Tab") {
    tabbing = true;
    setTimeout(() => {
      tabbing = false;
    }, 0);
  }
};

// Capture phase, so an app handler that stops propagation cannot hide an input from the gate.
function listen(): void {
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusLeavesApp, true);
  document.addEventListener("pointerdown", onPointer, true);
  document.addEventListener("pointerover", onPointer, true);
  document.addEventListener("keydown", onKeyDown, true);
  globalThis.addEventListener("blur", onFocusLeavesApp, true);
}

function unlisten(): void {
  document.removeEventListener("focusin", onFocusIn, true);
  document.removeEventListener("focusout", onFocusLeavesApp, true);
  document.removeEventListener("pointerdown", onPointer, true);
  document.removeEventListener("pointerover", onPointer, true);
  document.removeEventListener("keydown", onKeyDown, true);
  globalThis.removeEventListener("blur", onFocusLeavesApp, true);
}

/**
 * Gate focus into `frame` for as long as it is mounted; returns the release. `veiled` is read at each entry, and
 * `stop` runs when the frame's refusals form a grab loop. The first frame installs the app's listeners and the last
 * release removes them.
 */
export function gateFrameFocus(frame: HTMLIFrameElement, veiled: () => boolean, stop: () => void): () => void {
  if (gated.size === 0) {
    listen();
  }
  gated.set(frame, { veiled, stop, run: undefined });
  // A frame already holding focus when it is gated (it focused itself while it loaded) is judged at once.
  if (document.activeElement === frame) {
    judgeFocused(observeMove(), true);
    watchFrames();
  }
  return (): void => {
    gated.delete(frame);
    if (visit?.frame === frame) {
      visit = undefined;
    }
    if (gated.size === 0) {
      unlisten();
    }
  };
}
