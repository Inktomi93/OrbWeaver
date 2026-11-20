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
// THE STOP COUNTS REFUSALS, NOT TIME. A frame's refusals run on until the reader makes a move that could put focus
// somewhere: a press anywhere in the app or a Tab there. That move starts a new run, as does the reader's admitted entry
// into that frame. {@link FRAME_FOCUS_GRAB_LOOP_BOUND} refusals in one run stop the frame's scripts, however far apart
// they land, so a loaded device cannot space a loop out of being stopped. Other keys typed in the app do not start a
// run: a loop that starts while the reader types would otherwise never stop.
// Residuals: a frame that grabs once per reader press is refused each time and never stopped, and gets at most the key
// in flight before each return. A reader's own entries the host cannot read (a screen reader moving into a card
// without Tab, a press released before the host reads it) count too, so that many of them into one card with no press
// or Tab in the app between stop its scripts.

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

/** One frame's current run of refusals: how many, since which of the reader's moves. */
export interface FrameRefusalRun {
  readonly count: number;
  /** The host's count of the reader's presses and Tabs in the app when the run began. */
  readonly sinceMove: number;
}

/** The frame's run after one more refusal, with `readerMoves` presses and Tabs seen so far: it continues while the
 *  reader has made no such move since the run began. */
export function foldFrameRefusal(run: FrameRefusalRun | undefined, readerMoves: number): FrameRefusalRun {
  const continues = run !== undefined && run.sinceMove === readerMoves;
  return { count: continues ? run.count + 1 : 1, sinceMove: readerMoves };
}

/** Whether a frame's run of refusals is a grab loop long enough to stop its scripts. Never on an unmarked engine. */
export function stopsFrameScripts(run: FrameRefusalRun, signal: FramePressSignal): boolean {
  return signal !== "unmarked" && run.count >= FRAME_FOCUS_GRAB_LOOP_BOUND;
}
