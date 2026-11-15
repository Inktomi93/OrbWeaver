// The focus rule for card and reply frames (D294): what admits keyboard focus into a frame, how the host learns
// whether its engine shows a press on a frame at all, and when a frame that keeps taking focus has its scripts
// stopped. Pure: the host (`packages/ui/src/content/sandbox-frame/frame-focus.ts`) observes the browser and feeds
// these functions plain facts.
//
// THE PRESS SIGNAL IS LEARNED, NEVER ASSUMED. Chromium and WebKit mark the iframe `:active` while a press inside it
// is down, so a press is told apart from a script's `focus()`. An engine that does not mark it (Gecko is unmeasured)
// would refuse every click into a frame. So the host starts at "unknown", moves to "marked" the first time a frame
// it judges matches `:active`, and moves to "unmarked" only on an entry that a real press inside that frame must
// have caused ({@link learnsUnmarkedPress}): a user activation born while the pointer rested on the frame, with
// focus in the app and no app press or key since. A script can create neither a press nor an activation, so it
// cannot move the signal either way. "marked" is final.
//
// ON AN UNMARKED ENGINE the gate admits an entry into the frame under the pointer while the page holds an activation,
// and never stops a frame's scripts. The cost: a frame's own `focus()` while the reader's pointer rests on it, inside
// the activation's lifetime of the reader's last input, takes the keys typed after it.
//
// THE STOP COUNTS ONLY A GRAB LOOP. A refusal counts toward {@link FRAME_FOCUS_GRAB_LOOP_BOUND} only when it follows
// a refusal of the same frame within {@link FRAME_FOCUS_GRAB_GAP_MS}. A reader's own moves (a screen reader entering a
// card without Tab, a click the host could not read) come far slower, are refused one at a time, and count nothing.
// The reader's own input does not break a run: a loop that starts while the reader types would otherwise never stop.
// Residual: a frame that grabs more slowly than the gap is refused each time and never stopped, and gets at most the
// key in flight before each return.

/** What the host observed as focus entered a frame. */
export interface FrameFocusEntry {
  /** The frame is mounted but not shown yet: no reader can see or reach it. */
  readonly veiled: boolean;
  /** Tab or Shift+Tab, pressed in the app document, moved focus into the frame. */
  readonly tabbedFromApp: boolean;
  /** The frame matched `:active` as focus moved: a press or tap was down on it. */
  readonly pressed: boolean;
  /** On a touch screen: the last touch landed in this frame, the page holds an activation, and no app press or key
   *  came within {@link APP_INPUT_ACTIVATION_MS}, so the activation came from that touch. */
  readonly touchedLast: boolean;
  /** The mouse pointer is over this frame and the page holds a live user activation. */
  readonly pointedWhileActive: boolean;
}

/** Whether the host's engine shows a press on a frame as the iframe matching `:active`. */
export const FRAME_PRESS_SIGNALS = ["unknown", "marked", "unmarked"] as const;
export type FramePressSignal = (typeof FRAME_PRESS_SIGNALS)[number];

/** At least the browsers' transient user activation lifetime, so an activation an app press or key made is never
 *  read as a press or touch inside a frame. */
export const APP_INPUT_ACTIVATION_MS = 5000;

/** The longest gap between two refusals of one frame that still reads as a grab loop. Measured in Chromium against a
 *  frame calling `focus()` on a timer while the reader typed: refusals came at most 33 ms apart at a 5 ms timer, 49 ms
 *  at 20 ms and 62 ms at 50 ms. A reader's own moves come far slower than this. */
export const FRAME_FOCUS_GRAB_GAP_MS = 100;

/** How many refusals in one grab loop stop a frame's scripts. Each refusal leaves the frame a window of the reader's
 *  keys (the browser's message plus one task), so a loop is held to this many windows. */
export const FRAME_FOCUS_GRAB_LOOP_BOUND = 3;

/** Whether focus that entered a frame got there by the reader's own hand. */
export function admitsFrameFocus(entry: FrameFocusEntry, signal: FramePressSignal): boolean {
  if (entry.veiled) {
    return false;
  }
  if (entry.tabbedFromApp || entry.pressed || entry.touchedLast) {
    return true;
  }
  return signal === "unmarked" && entry.pointedWhileActive;
}

/** What the host saw between the pointer entering a frame and focus entering it, on the host's clock. */
export interface FramePressEvidence {
  /** The entry matched `:active` or came by Tab: the signal needs no learning from it. */
  readonly pressedOrTabbed: boolean;
  /** When the mouse pointer entered this frame and stayed on it, or `undefined` when it is not on it. */
  readonly pointerOnFrameSinceMs: number | undefined;
  /** The page held a user activation when the pointer entered the frame. */
  readonly activeWhenPointerEntered: boolean;
  /** The page holds a user activation now. */
  readonly activeNow: boolean;
  /** The last trusted app press or key. */
  readonly lastAppInputMs: number;
  /** The last time any frame held focus. */
  readonly lastFrameFocusMs: number;
}

/** Whether an unmarked entry can only have come from a real press inside the frame: the activation was born while
 *  the pointer rested on this frame, with focus in the app and no app press or key, and no script can make one. */
export function learnsUnmarkedPress(evidence: FramePressEvidence): boolean {
  const since = evidence.pointerOnFrameSinceMs;
  return (
    !evidence.pressedOrTabbed &&
    since !== undefined &&
    !evidence.activeWhenPointerEntered &&
    evidence.activeNow &&
    evidence.lastAppInputMs < since &&
    evidence.lastFrameFocusMs < since
  );
}

/** The host's press signal after one judged entry. */
export function foldFramePressSignal(signal: FramePressSignal, entry: { readonly pressed: boolean; readonly learnsUnmarked: boolean }): FramePressSignal {
  if (signal === "marked" || entry.pressed) {
    return "marked";
  }
  return entry.learnsUnmarked ? "unmarked" : signal;
}

/**
 * What the host saw that bears on its own return of focus into a frame: it gave focus back to `frame` after a refusal,
 * focus landed in the app (an app element's `focusin`, or the app window's `focus`), or focus was found in `frame`.
 */
export type FrameHostReturnEvent<F> =
  | { readonly kind: "returned"; readonly frame: F }
  | { readonly kind: "app-focus" }
  | { readonly kind: "entry"; readonly frame: F };

/**
 * The host's one-use mark for its own return of focus into `F`, after one event, and whether that event is the host's
 * own move. The mark is spent by the entry it explains, and dropped once focus is seen in the app: focus that left
 * the frame unseen must not turn the frame's later `focus()` into the host's move.
 */
export function foldFrameHostReturn<F>(mark: F | undefined, event: FrameHostReturnEvent<F>): { readonly mark: F | undefined; readonly hostMove: boolean } {
  switch (event.kind) {
    case "returned":
      return { mark: event.frame, hostMove: false };
    case "app-focus":
      return { mark: undefined, hostMove: false };
    case "entry":
      return event.frame === mark ? { mark: undefined, hostMove: true } : { mark, hostMove: false };
  }
}

/** One frame's current run of refusals: how many, and when the last came. */
export interface FrameRefusalRun {
  readonly count: number;
  readonly lastAtMs: number;
}

/** The frame's run after one more refusal at `atMs`: it continues only inside {@link FRAME_FOCUS_GRAB_GAP_MS} of the
 *  last refusal. */
export function foldFrameRefusal(run: FrameRefusalRun | undefined, atMs: number): FrameRefusalRun {
  const continues = run !== undefined && atMs - run.lastAtMs <= FRAME_FOCUS_GRAB_GAP_MS;
  return { count: continues ? run.count + 1 : 1, lastAtMs: atMs };
}

/** Whether a frame's run of refusals is a grab loop long enough to stop its scripts. Never on an unmarked engine. */
export function stopsFrameScripts(run: FrameRefusalRun, signal: FramePressSignal): boolean {
  return signal !== "unmarked" && run.count >= FRAME_FOCUS_GRAB_LOOP_BOUND;
}
