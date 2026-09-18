// @orb/server/kit/side-gen-posture — the seam mapper from a resolved SideGenSampling to the summarize role's
// SummarizeOptions. The load-bearing detail: `maxOutputTokens` (the ladder vocabulary) → `maxTokens` (the
// summarize seam), with absent knobs OMITTED so an empty posture yields `{}` (the backend default stands).

import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import { resolveSideGenSampling } from "@orb/kit/side-gen-posture";
import { toSummarizeOptions } from "@orb/server/kit/side-gen-posture";
import { expect, test } from "../../support/fixtures.ts";

test("maps maxOutputTokens → maxTokens and passes temperature through", () => {
  expect(toSummarizeOptions({ temperature: 0.2, maxOutputTokens: 24 })).toEqual({ temperature: 0.2, maxTokens: 24 });
});

test("an empty posture ⇒ {} (the caption case — no options sent, the backend default stands)", () => {
  expect(toSummarizeOptions({})).toEqual({});
});

test("an absent knob is OMITTED, never emitted as undefined", () => {
  const out = toSummarizeOptions({ temperature: 0.3 });
  expect(out).toEqual({ temperature: 0.3 });
  expect("maxTokens" in out).toBe(false);
});

test("the greeting-studio ladder maps to the summarize call: default ⇒ the floor's {temp, maxTokens}", () => {
  // The greeting-studio path folds SIDE_GEN_POSTURES.greeting_studio ← the caller's preset params, then maps to
  // the summarize seam. With no preset params the floor stands, mapped to the wire vocabulary.
  const posture = resolveSideGenSampling(SIDE_GEN_POSTURES.greeting_studio);
  expect(toSummarizeOptions(posture)).toEqual({ temperature: 0.3, maxTokens: 1024 });
});

test("the greeting-studio ladder maps to the summarize call: the caller's preset params reach the wire", () => {
  // A user whose default preset sets temperature 0.85 + maxOutputTokens 600 → those reach the summarize call
  // (over the greeting_studio floor), mapped maxOutputTokens → maxTokens.
  const posture = resolveSideGenSampling(SIDE_GEN_POSTURES.greeting_studio, { temperature: 0.85, maxOutputTokens: 600 });
  expect(toSummarizeOptions(posture)).toEqual({ temperature: 0.85, maxTokens: 600 });
});

test("the caption ladder: floor + no preset params ⇒ the floor values", () => {
  expect(toSummarizeOptions(resolveSideGenSampling(SIDE_GEN_POSTURES.caption))).toEqual({ temperature: 0.2, maxTokens: 512 });
});

test("the caption ladder: a user's preset params now REACH caption (the empty floor lets them through)", () => {
  const posture = resolveSideGenSampling(SIDE_GEN_POSTURES.caption, { temperature: 0.4, maxOutputTokens: 128 });
  expect(toSummarizeOptions(posture)).toEqual({ temperature: 0.4, maxTokens: 128 });
});
