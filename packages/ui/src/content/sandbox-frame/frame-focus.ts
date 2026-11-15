// Keyboard focus may enter a card or reply frame only by the reader's own hand: a press or tap on that frame, or Tab or
// Shift+Tab from the app (D294, D354). An interactive frame runs model-written or preset-written script, which can call
// `focus()` at any time. Focus taken that way would hand it every key the reader presses next, and its WebRTC channel
// (residual R1 in `packages/kit/src/card-frame/index.ts`) can carry them off the box. Focus that enters any other way
// goes back to where it was.
//
// WHAT THE HOST CAN SEE, measured in Chromium (frame in and out of process) and WebKit:
// - Focus entering a frame from an app element fires that element's `focusout`; from the bare page, the app window's
//   `blur`. Focus moving from one frame to another fires nothing in the app, so a check of `document.activeElement`
//   runs once per animation frame while a frame holds focus.
// - A press or tap inside a frame fires no app event, but the iframe matches `:active` as the focus moves. WebKit
//   clears it within a task, so it is read at the event. A frame's own `focus()` leaves it unmatched. Chromium with the
//   frame in process is the exception: a tap there does not match it.
// - A touch leaves the iframe matching `:hover`, where the touch landed.
// - A Tab pressed in the app is an app `keydown`; the focus move it makes is dispatched inside it.
// - A `focus()` the app makes while the browser dispatches that blur, or in its microtasks, does not take focus back
//   from a frame out of process, so the return runs in the next task.
//
// WHAT IT CANNOT SEE, and how each gap fails:
// - (OPEN, bounded) Keys pressed between a frame's `focus()` and the return land in the frame. For a frame out of
//   process the app learns of the move only from the browser, so the window cannot close: it is the browser's message
//   plus one task. A frame that keeps taking focus would keep reopening it, so after
//   {@link FRAME_FOCUS_REFUSALS_ALLOWED} refusals its host draws it script-dead.
// - (OPEN, bounded) Focus moving between frames is read up to one animation frame late, and keys in that frame land in
//   the frame that moved. A press released within that frame is missed, and refused.
// - (OPEN) On a touch screen with a frame in process, a tap shows only as `:hover`, so the touch is read as "the last
//   touch landed in this frame, the page holds an activation, and no app press or key came within
//   {@link APP_INPUT_ACTIVATION_MS}". The frame the reader just touched may then take focus by its own script.
// - A Tab pressed inside a frame is invisible, so tabbing from one frame straight into the next is refused, and focus
//   returns to the first.
// - A screen reader command that moves into a frame without a Tab or a press is refused.

// What the host observed as focus entered a frame.
interface FrameFocusEntry {
  // The frame is mounted but not shown yet: no reader can see or reach it.
  readonly veiled: boolean;
  // Tab or Shift+Tab, pressed in the app document, moved focus into the frame.
  readonly tabbedFromApp: boolean;
  // The frame matched `:active` as focus moved: a press or tap was down on it.
  readonly pressed: boolean;
  // On a touch screen: the last touch landed in this frame, the page holds an activation, and no app press or key came
  // within {@link APP_INPUT_ACTIVATION_MS}, so the activation came from that touch.
  readonly touchedLast: boolean;
}

// At least the browsers' transient user activation lifetime, so an activation an app press or key made is never read as
// a touch inside a frame.
const APP_INPUT_ACTIVATION_MS = 5000;

// THE DECISION: focus that entered a frame got there by the reader's own hand, a Tab from the app or a press on the frame.
function admitsFrameFocus(entry: FrameFocusEntry): boolean {
  return !entry.veiled && (entry.tabbedFromApp || entry.pressed || entry.touchedLast);
}

// What the app saw at the moment focus moved, before WebKit clears `:active` or the Tab's flag goes.
interface FocusMove {
  readonly pressed: HTMLIFrameElement | undefined;
  readonly touched: HTMLIFrameElement | undefined;
  readonly tabbed: boolean;
}

interface GatedFrame {
  readonly veiled: () => boolean;
  readonly refused: () => void;
}

/** How many entries a frame may have refused before its host stops its scripts: each refusal leaves a window of keys
 *  the frame can read (the OPEN gaps above), so a frame that takes focus again and again is held to this many. */
export const FRAME_FOCUS_REFUSALS_ALLOWED = 3;

// The places a refusal may return focus to, newest last: the app elements the reader focused and the frames admitted.
const HOLDERS_KEPT = 8;
const TOUCH_SCREEN_QUERY = "(hover: none)";

const gated = new Map<HTMLIFrameElement, GatedFrame>();
const holders: Element[] = [];
let lastPointerWasTouch = false;
let appInputAt = Number.NEGATIVE_INFINITY;
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

function asGated(element: Element | null): HTMLIFrameElement | undefined {
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

function activatedByTouch(): boolean {
  const touchScreen = lastPointerWasTouch || globalThis.matchMedia(TOUCH_SCREEN_QUERY).matches;
  const activation = "userActivation" in navigator && navigator.userActivation.isActive;
  return touchScreen && activation && performance.now() - appInputAt >= APP_INPUT_ACTIVATION_MS;
}

function observeMove(): FocusMove {
  return { pressed: gatedMatching(":active"), touched: activatedByTouch() ? gatedMatching(":hover") : undefined, tabbed: tabbing };
}

// Focus the newest place the reader held that is still on the page and is not the refused frame. With none, take focus
// out of the frame onto the app document.
function returnFocus(refused: HTMLIFrameElement): void {
  for (let index = holders.length - 1; index >= 0; index -= 1) {
    const holder = holders[index];
    if (holder !== undefined && holder !== refused && holder.isConnected && holder instanceof HTMLElement) {
      holder.focus({ preventScroll: true });
      if (document.activeElement === holder) {
        return;
      }
    }
  }
  refused.blur();
}

// Focus is in `frame` after `move`: keep it and remember the frame as a place to return to, or send it back. Constant
// work, so a frame that calls `focus()` in a loop costs the app one check per call.
function judge(frame: HTMLIFrameElement, move: FocusMove): void {
  const entry: FrameFocusEntry = {
    veiled: gated.get(frame)?.veiled() ?? true,
    tabbedFromApp: move.tabbed,
    pressed: move.pressed === frame,
    touchedLast: move.touched === frame,
  };
  if (admitsFrameFocus(entry)) {
    hold(frame);
    return;
  }
  returnFocus(frame);
  gated.get(frame)?.refused();
}

// Judge whatever frame holds focus now, unless it is the one already admitted.
function judgeFocused(move: FocusMove): void {
  const frame = asGated(document.activeElement);
  if (frame !== undefined && holders.at(-1) !== frame) {
    judge(frame, move);
  }
}

// While a frame holds focus, one check per animation frame catches focus moving to another frame.
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
    judgeFocused(observeMove());
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

const onFocusLeavesApp = (): void => {
  const move = observeMove();
  setTimeout(() => {
    judgeFocused(move);
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
 * `refused` runs after each entry the gate sent back. The first frame installs the app's listeners and the last release
 * removes them.
 */
export function gateFrameFocus(frame: HTMLIFrameElement, veiled: () => boolean, refused: () => void): () => void {
  if (gated.size === 0) {
    listen();
  }
  gated.set(frame, { veiled, refused });
  // A frame already holding focus when it is gated (it focused itself while it loaded) is judged at once.
  if (document.activeElement === frame) {
    judgeFocused(observeMove());
    watchFrames();
  }
  return (): void => {
    gated.delete(frame);
    if (gated.size === 0) {
      unlisten();
    }
  };
}
