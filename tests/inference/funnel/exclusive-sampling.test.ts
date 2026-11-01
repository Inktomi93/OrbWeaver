// A model that rejects two sampling knobs together gets the first-listed one and a conflict warning for the other;
// a model that declares no such pair keeps both.
// @subject packages/inference/src/funnel/resolve-chat.ts

import { WARNING_CODE } from "@orb/contracts/inference";
import { resolveChat } from "@orb/inference";
import { makeGenerationCapability } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const KNOBS = { temperature: { min: 0, max: 2 }, topP: { min: 0, max: 1 } };
const INTENT = { temperature: 0.7, topP: 0.9 };

test("an exclusive pair keeps the first-listed knob, drops the other with a conflict warning and leaves the rest of the sampling alone", () => {
  const resolved = resolveChat(INTENT, makeGenerationCapability({ sampling: { ...KNOBS, exclusive: [["temperature", "topP"]] } }));
  expect(resolved.sampling).toEqual({ temperature: 0.7 });
  expect(resolved.warnings).toContainEqual({
    code: WARNING_CODE.samplingKnobConflict,
    knob: "topP",
    message: expect.stringContaining("temperature kept"),
  });
});

test("a model that declares no exclusive pair keeps both knobs and warns of nothing", () => {
  const resolved = resolveChat(INTENT, makeGenerationCapability({ sampling: KNOBS }));
  expect(resolved.sampling).toEqual({ temperature: 0.7, topP: 0.9 });
  expect(resolved.warnings).toEqual([]);
});
