// The v10→v11 settings cleanup: a stored blob from before it keeps every choice the user made, carried into the key
// that replaced it, and the next save keeps the user's other settings.
// @subject packages/contracts/src/settings/index.ts
import { IMAGERY_CAPTION_SLOT_IDS, IMAGERY_TEMPLATE_SLOT_IDS } from "@orb/contracts/imagery";
import type { UserSettings } from "@orb/contracts/settings";
import { AUTO_CONTINUE_ROUNDS_OFF, DEFAULT_USER_SETTINGS, SMOOTH_STREAM_OFF, userSettingsConfig } from "@orb/contracts/settings";
import { expect, test } from "@orb/testkit/node";
import { proseOverrideFromLegacy } from "#contracts/prose-slot/index.ts";

// The stored version column of a blob written before the cleanup: a fixed historic version, not the current one.
const BEFORE_CLEANUP = 10;

function lifted(blob: Record<string, unknown>): UserSettings {
  const outcome = userSettingsConfig.parseOutcome(blob, BEFORE_CLEANUP);
  expect(outcome.intact).toBe(true);
  return outcome.value;
}

test.for([
  [{ continueOnSend: true, generateOnEmptySend: true }, true],
  [{ continueOnSend: false, generateOnEmptySend: true }, false],
  [{ continueOnSend: true, generateOnEmptySend: false }, false],
  [{ continueOnSend: false }, false],
  [{}, DEFAULT_USER_SETTINGS.chat.emptyEnterReplies],
] as const)("stored empty-Enter switches %o read as one switch %s", ([stored, replies]) => {
  expect(lifted({ chat: stored }).chat.emptyEnterReplies).toBe(replies);
});

test.for([
  [{ autoContinue: true }, 1],
  [{ autoContinue: true, autoContinueRounds: 3 }, 3],
  [{ autoContinue: false, autoContinueRounds: 3 }, AUTO_CONTINUE_ROUNDS_OFF],
  [{ autoContinueRounds: 4 }, AUTO_CONTINUE_ROUNDS_OFF],
] as const)("stored auto-continue %o reads as %s rounds, 0 being off", ([stored, rounds]) => {
  expect(lifted({ chat: stored }).chat.autoContinueRounds).toBe(rounds);
});

test.for([
  [{ smoothStream: false, smoothStreamCps: 120 }, SMOOTH_STREAM_OFF],
  [{ smoothStream: true, smoothStreamCps: 120 }, 120],
  [{ smoothStreamCps: 120 }, 120],
] as const)("stored smooth streaming %o reads as a reveal speed of %s", ([stored, cps]) => {
  expect(lifted({ chat: stored }).chat.smoothStreamCps).toBe(cps);
});

test("a stored auto-swipe keeps every leaf it still has, and the retired retry count leaves", () => {
  const swipe = lifted({ chat: { autoSwipe: { enabled: true, minLength: 40, blacklist: ["As an AI"], maxRetries: 3 } } }).chat.autoSwipe;
  expect(swipe).toStrictEqual({ enabled: true, minLength: 40, blacklist: ["As an AI"] });
});

test.for([
  ["glow", "ramp"],
  ["ramp", "ramp"],
  ["flat", "flat"],
] as const)("a stored %s elevation reads as %s, so the deepest look keeps its depth", ([stored, elevation]) => {
  expect(lifted({ appearance: { elevation: stored } }).appearance.elevation).toBe(elevation);
});

test.for([
  ["on", []],
  ["off", ["panels", "modals"]],
  ["system", ["panels", "modals"]],
] as const)("a stored app reduce-transparency %s leaves the glass surfaces as %o", ([stored, surfaces]) => {
  const appearance = lifted({ appearance: { reducedTransparency: stored, blurSurfaces: ["panels", "modals"] } }).appearance;
  expect(appearance.blurSurfaces).toStrictEqual(surfaces);
});

test("the derived appearance knobs leave without taking a neighbouring choice with them", () => {
  const appearance = lifted({
    appearance: {
      readingNameScale: 1.4,
      readingParagraphSpacing: 2,
      backgroundDim: 0.9,
      shadowEffects: true,
      blurStrength: 24,
      fontScale: 1.25,
      readingLineHeight: 1.8,
      readingBodyScale: 1.2,
    },
  }).appearance;
  expect({ fontScale: appearance.fontScale, readingLineHeight: appearance.readingLineHeight, readingBodyScale: appearance.readingBodyScale }).toStrictEqual({
    fontScale: 1.25,
    readingLineHeight: 1.8,
    readingBodyScale: 1.2,
  });
});

test("stored image-prompt overrides move into prose under their slots, and an override prose already holds wins", () => {
  const settings = lifted({
    imagery: { templates: { character: "Old portrait wording.", face: "Old face wording." }, captions: { ["face_multimodal"]: "Old caption." } },
    prose: { [IMAGERY_TEMPLATE_SLOT_IDS.face]: proseOverrideFromLegacy("Newer face wording.") },
  });
  expect({
    character: settings.prose[IMAGERY_TEMPLATE_SLOT_IDS.character],
    face: settings.prose[IMAGERY_TEMPLATE_SLOT_IDS.face],
    caption: settings.prose[IMAGERY_CAPTION_SLOT_IDS["face_multimodal"]],
    untouched: settings.prose[IMAGERY_TEMPLATE_SLOT_IDS.background],
  }).toStrictEqual({
    character: proseOverrideFromLegacy("Old portrait wording."),
    face: proseOverrideFromLegacy("Newer face wording."),
    caption: proseOverrideFromLegacy("Old caption."),
    untouched: undefined,
  });
});

test("the retired sections leave and every other section keeps its stored values", () => {
  const settings = lifted({
    groupDefaults: { offerChoices: true },
    library: { pageSize: 60 },
    memory: { enabled: true },
    chat: { enterSends: false, autoContinue: true },
  });
  expect(Object.hasOwn(settings, "groupDefaults") || Object.hasOwn(settings, "library")).toBe(false);
  expect({ memory: settings.memory.enabled, enterSends: settings.chat.enterSends }).toStrictEqual({ memory: true, enterSends: false });
});
