// The frame focus rule (D294): what admits focus into a frame, how the press signal is learned, and which refusals
// stop a frame's scripts.
// @subject packages/kit/src/card-frame/focus.ts

import type { FrameFocusEntry, FramePressEvidence, FramePressSignal, FrameRefusalRun } from "@orb/kit/card-frame";
import {
  admitsFrameFocus,
  FRAME_FOCUS_GRAB_GAP_MS,
  FRAME_FOCUS_GRAB_LOOP_BOUND,
  FRAME_PRESS_SIGNALS,
  foldFramePressSignal,
  foldFrameRefusal,
  learnsUnmarkedPress,
  stopsFrameScripts,
} from "@orb/kit/card-frame";
import { expect, test } from "@orb/testkit/node";

const NOTHING: FrameFocusEntry = { veiled: false, tabbedFromApp: false, pressed: false, touchedLast: false, pointedWhileActive: false };
const READER_HANDS = ["tabbedFromApp", "pressed", "touchedLast"] as const satisfies readonly (keyof FrameFocusEntry)[];

test.each(FRAME_PRESS_SIGNALS)("on a %s engine a Tab, a press or a touch admits, a bare script focus does not, and a veil refuses all", (signal) => {
  for (const hand of READER_HANDS) {
    expect(admitsFrameFocus({ ...NOTHING, [hand]: true }, signal)).toBe(true);
    expect(admitsFrameFocus({ ...NOTHING, [hand]: true, veiled: true }, signal)).toBe(false);
  }
  expect(admitsFrameFocus(NOTHING, signal)).toBe(false);
});

test.each<readonly [FramePressSignal, boolean]>([
  ["unknown", false],
  ["marked", false],
  ["unmarked", true],
])("on a %s engine the frame under the pointer while the page is active is admitted: %s", (signal, admitted) => {
  expect(admitsFrameFocus({ ...NOTHING, pointedWhileActive: true }, signal)).toBe(admitted);
});

// A press inside a frame on an engine that does not mark it: the pointer rested on the frame from 1000, the page was
// not active then, it is now, the last app input was at 500 and no frame held focus since 200.
const PRESS_EVIDENCE: FramePressEvidence = {
  pressedOrTabbed: false,
  pointerOnFrameSinceMs: 1000,
  activeWhenPointerEntered: false,
  activeNow: true,
  lastAppInputMs: 500,
  lastFrameFocusMs: 200,
};

test("an activation born while the pointer rested on the frame, with focus in the app and no app input, is a press", () => {
  expect(learnsUnmarkedPress(PRESS_EVIDENCE)).toBe(true);
});

test.each<readonly [string, Partial<FramePressEvidence>]>([
  ["the entry was already read as a press or a Tab", { pressedOrTabbed: true }],
  ["the pointer is not on the frame", { pointerOnFrameSinceMs: undefined }],
  ["the page was already active when the pointer arrived", { activeWhenPointerEntered: true }],
  ["the page holds no activation, as after a script's focus", { activeNow: false }],
  ["an app press or key came after the pointer arrived", { lastAppInputMs: 1500 }],
  ["a frame held focus after the pointer arrived, so a key in it could have made the activation", { lastFrameFocusMs: 1500 }],
  ["an app press or key came the moment the pointer arrived", { lastAppInputMs: 1000 }],
  ["a frame held focus the moment the pointer arrived", { lastFrameFocusMs: 1000 }],
])("no press is learned when %s", (_name, change) => {
  expect(learnsUnmarkedPress({ ...PRESS_EVIDENCE, ...change })).toBe(false);
});

test.each<readonly [FramePressSignal, boolean, boolean, FramePressSignal]>([
  ["unknown", false, false, "unknown"],
  ["unknown", true, false, "marked"],
  ["unknown", false, true, "unmarked"],
  ["unmarked", true, false, "marked"],
  ["marked", false, true, "marked"],
])("a %s engine, after an entry pressed=%s learning-unmarked=%s, is %s", (signal, pressed, learnsUnmarked, next) => {
  expect(foldFramePressSignal(signal, { pressed, learnsUnmarked })).toBe(next);
});

// Folds refusals at `times` and says whether the run ever stopped the frame.
function stopsAfter(times: readonly number[], signal: FramePressSignal): boolean {
  let run: FrameRefusalRun | undefined;
  let stopped = false;
  for (const at of times) {
    run = foldFrameRefusal(run, at);
    stopped ||= stopsFrameScripts(run, signal);
  }
  return stopped;
}

// A loop well into the page's life, so the run reads gaps between refusals and not their clock values.
const LOOP_START_MS = 60_000;
const LOOP = Array.from({ length: FRAME_FOCUS_GRAB_LOOP_BOUND }, (_, index) => LOOP_START_MS + index * (FRAME_FOCUS_GRAB_GAP_MS / 4));
const AT_THE_GAP = Array.from({ length: FRAME_FOCUS_GRAB_LOOP_BOUND }, (_, index) => LOOP_START_MS + index * FRAME_FOCUS_GRAB_GAP_MS);
const SPACED = Array.from({ length: FRAME_FOCUS_GRAB_LOOP_BOUND * 4 }, (_, index) => index * (FRAME_FOCUS_GRAB_GAP_MS + 1));

test("a tight loop of refusals stops the frame at the bound, and one fewer does not", () => {
  expect(stopsAfter(LOOP, "marked")).toBe(true);
  expect(stopsAfter(LOOP.slice(1), "marked")).toBe(false);
  expect(stopsAfter(LOOP, "unknown")).toBe(true);
});

test("refusals exactly the gap apart are still a loop", () => {
  expect(stopsAfter(AT_THE_GAP, "marked")).toBe(true);
});

test("refusals spaced past the gap never stop the frame, however many", () => {
  expect(stopsAfter(SPACED, "marked")).toBe(false);
});

test("one gap past the window inside a run starts it again", () => {
  const [first = 0, ...rest] = LOOP;
  expect(stopsAfter([first, ...rest.map((at) => at + FRAME_FOCUS_GRAB_GAP_MS + 1)].slice(0, FRAME_FOCUS_GRAB_LOOP_BOUND), "marked")).toBe(false);
});

test("on an unmarked engine a loop never stops the frame", () => {
  expect(stopsAfter([...LOOP, ...LOOP.map((at) => at + 1)], "unmarked")).toBe(false);
});
