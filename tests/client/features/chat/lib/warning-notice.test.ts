import type { BannedPhraseCause, ChatWarning } from "@orb/contracts/chat";
import { SETTINGS_ADJUSTED_CODE } from "@orb/contracts/chat";
import { WARNING_CODE } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node";
import { turnDropsNotice, warningNotice } from "#client/features/chat/lib/warning-notice.ts";

const KNOB_DROPPED = { code: SETTINGS_ADJUSTED_CODE, adjustment: WARNING_CODE.samplingKnobDropped } as const;
const TOP_K: ChatWarning = { ...KNOB_DROPPED, knob: "topK" };
const MIN_P: ChatWarning = { ...KNOB_DROPPED, knob: "minP" };
const phrases = (cause: BannedPhraseCause | undefined, counts?: { readonly dropped: number; readonly sent: number }): ChatWarning => ({
  ...KNOB_DROPPED,
  knob: "bannedStrings",
  ...(cause === undefined ? {} : { cause }),
  ...(counts === undefined ? {} : { droppedCount: counts.dropped, sentCount: counts.sent }),
});

// The notice is the user's only word on a ban that stopped working, so what it says must follow the cause the server raised.
test("a whole banned-phrase drop reads as plural and names its own cause, never a model value it did not use", () => {
  const sequence = warningNotice(phrases("sequence"));
  const tokenizer = warningNotice(phrases("tokenizer"));
  const unstated = warningNotice(phrases(undefined));
  // The title agrees with its plural subject, and a singular subject keeps its own verb: the positive control.
  expect(sequence.title).toMatch(/weren't used/u);
  expect(warningNotice(TOP_K).title).toMatch(/wasn't used/u);
  // Three causes, three different sentences, and none is the generic "model's own value" reason.
  expect(new Set([sequence.description, tokenizer.description, unstated.description]).size).toBe(3);
  for (const notice of [sequence, tokenizer, unstated]) {
    expect(notice.description).not.toMatch(/model's own value/u);
  }
  expect(warningNotice(TOP_K).description).toMatch(/model's own value/u);
});

test("a partial drop names its cause, how many were dropped and how many were sent", () => {
  const sequence = warningNotice(phrases("sequence", { dropped: 2, sent: 3 }));
  const tokenizer = warningNotice(phrases("tokenizer", { dropped: 2, sent: 3 }));
  expect(sequence.title).toMatch(/2 weren't used/u);
  expect(sequence.description).toMatch(/other 3 were sent/u);
  expect(tokenizer.description).toMatch(/other 3 were sent/u);
  expect(sequence.description).not.toEqual(tokenizer.description);
});

test("a grouped turn counts a partly sent list apart from the settings that did not ride, and keeps how many were sent", () => {
  const grouped = turnDropsNotice([TOP_K, MIN_P, phrases("sequence", { dropped: 2, sent: 3 })]);
  // Two settings did not ride; the phrase list did in part, so it is not a third thing the reply ran without.
  expect(grouped.title).toMatch(/ran without 2 things/u);
  expect(grouped.title).toMatch(/part of another/u);
  expect(grouped.description).toMatch(/other 3 were sent/u);

  const control = turnDropsNotice([TOP_K, MIN_P]);
  expect(control.title).toMatch(/ran without 2 things/u);
  expect(control.title).not.toMatch(/part of/u);
  expect(control.description).not.toMatch(/were sent/u);
});
