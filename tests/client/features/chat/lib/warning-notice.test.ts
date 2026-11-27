// @subject packages/client/src/features/chat/lib/warning-notice.ts
// What a dropped-setting notice follows: the cause the server raised, the knob's own number, and the counts it was given.
// Each case reads the notice for a warning and compares it with another notice or with the input, never with spelled copy.

import type { AdjustedKnob, BannedPhraseCause, ChatWarning } from "@orb/contracts/chat";
import { ADJUSTED_KNOB_NAMES, ADJUSTED_KNOBS, SETTINGS_ADJUSTED_CODE } from "@orb/contracts/chat";
import { WARNING_CODE } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node";
import { turnDropsNotice, warningNotice } from "#client/features/chat/lib/warning-notice.ts";

const KNOB_DROPPED = { code: SETTINGS_ADJUSTED_CODE, adjustment: WARNING_CODE.samplingKnobDropped } as const;
const dropped = (knob: AdjustedKnob): ChatWarning => ({ ...KNOB_DROPPED, knob });
const TOP_K = dropped("topK");
const MIN_P = dropped("minP");
const phrases = (cause: BannedPhraseCause | undefined, counts?: { readonly dropped: number; readonly sent: number }): ChatWarning => ({
  ...KNOB_DROPPED,
  knob: "bannedStrings",
  ...(cause === undefined ? {} : { cause }),
  ...(counts === undefined ? {} : { droppedCount: counts.dropped, sentCount: counts.sent }),
});

// The notice is the user's only word on a ban that stopped working, so what it says must follow the cause the server raised.
test("a whole banned-phrase drop says a different thing for each cause, and none of them is the reason a model's own knob gives", () => {
  const sequence = warningNotice(phrases("sequence"));
  const tokenizer = warningNotice(phrases("tokenizer"));
  const unstated = warningNotice(phrases(undefined));
  const modelKnob = warningNotice(TOP_K);
  expect(new Set([sequence.description, tokenizer.description, unstated.description, modelKnob.description]).size).toBe(4);
});

// The knobs whose names are plural nouns, stated here so a label or a verb that drifts from them fails.
const PLURAL_KNOBS: readonly AdjustedKnob[] = ["bannedStrings", "stop", "drySequenceBreakers", "replyMedia", "parallelToolCalls"];

// A title built from a knob's label takes the verb its number asks for. The verb is whatever follows the label, so the
// check never spells it: every knob of one number reads the same tail, and the two numbers read different ones.
test("a dropped knob's title agrees with the number of its name, for every knob", () => {
  const tails = (ofPlural: boolean): Set<string> =>
    new Set(
      ADJUSTED_KNOBS.filter((knob) => PLURAL_KNOBS.includes(knob) === ofPlural).map((knob) => {
        const label = ADJUSTED_KNOB_NAMES[knob].label;
        const { title } = warningNotice(dropped(knob));
        expect(title.startsWith(label)).toBe(true);
        return title.slice(label.length);
      }),
    );
  const singular = tails(false);
  const plural = tails(true);
  // Both groups are drawn, so agreement within each is not vacuous.
  expect([singular.size, plural.size]).toEqual([1, 1]);
  expect([...singular]).not.toEqual([...plural]);
});

test("a partial drop says how many were dropped and how many were sent, so each count changes the notice", () => {
  const partial = (counts: { readonly dropped: number; readonly sent: number }, cause: BannedPhraseCause = "sequence"): ReturnType<typeof warningNotice> =>
    warningNotice(phrases(cause, counts));
  const base = partial({ dropped: 2, sent: 3 });
  expect(base.title).toContain("2");
  expect(base.description).toContain("3");
  expect(partial({ dropped: 5, sent: 3 }).title).not.toEqual(base.title);
  expect(partial({ dropped: 2, sent: 4 }).description).not.toEqual(base.description);
  // One dropped reads in the singular, and the cause still decides the way out.
  expect(partial({ dropped: 1, sent: 3 }).title).not.toEqual(partial({ dropped: 2, sent: 3 }).title.replace("2", "1"));
  expect(partial({ dropped: 2, sent: 3 }, "tokenizer").description).not.toEqual(base.description);
});

test("a grouped turn counts a partly sent list apart from the settings that did not ride, and keeps how many were sent", () => {
  const counts = { dropped: 4, sent: 9 };
  const grouped = turnDropsNotice([TOP_K, MIN_P, phrases("sequence", counts)]);
  const control = turnDropsNotice([TOP_K, MIN_P]);
  // Two settings did not ride; the phrase list did in part, so it is not a third thing the reply ran without.
  expect(control.title).toContain("2");
  expect(grouped.title).toContain("2");
  expect(grouped.title).not.toContain("3");
  expect(grouped.title).not.toEqual(control.title);
  // The partial line keeps its sent count; a group with no partial list has none to keep.
  expect(grouped.description).toContain(String(counts.sent));
  expect(control.description).not.toContain(String(counts.sent));
});
