// The Presets page lands a SillyTavern preset's samplers and limits one field at a time: one value out of range is
// brought into range and lands beside the rest, the preview lists it as brought into range and never as left out, and a
// value of the wrong type is named before the run and lands nothing. Each field's own case table is
// `tests/contracts/preset/st-preset-samplers.contract.test.ts`.
// @subject packages/contracts/src/preset/index.ts
// @subject packages/server/src/domain/preset/verbs/import-file.ts

import { userIntentSchema } from "@orb/contracts/preset";
import { expect, test } from "@orb/testkit/node";
import { harness } from "./_st-tree-door.ts";

const maxOf = (knob: "frequencyPenalty" | "presencePenalty" | "topP"): number => userIntentSchema.shape[knob].unwrap().maxValue ?? Number.NaN;
const minOf = (knob: "presencePenalty"): number => userIntentSchema.shape[knob].unwrap().minValue ?? Number.NaN;

// SillyTavern wire text is snake_case by spec, so the file is raw JSON. Three values sit past the stored range and one
// is of the wrong type; the rest are in range.
const FILE = JSON.stringify({
  prompts: [{ identifier: "main", name: "Main", content: "You narrate.", role: "system" }],
  ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "main", enabled: true }] }],
  temperature: 0.9,
  ["frequency_penalty"]: maxOf("frequencyPenalty") + 1,
  ["presence_penalty"]: minOf("presencePenalty") - 1,
  ["top_p"]: maxOf("topP") + 0.5,
  ["top_k"]: "forty",
  ["openai_max_context"]: 200_000,
  ["openai_max_tokens"]: 8000,
});

test("a SillyTavern preset with samplers past their range keeps every sampler and limit, each brought into range", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);

  const preview = await caller.preset.previewFile({ fileText: FILE, fileName: "Keeper.json" });
  if (!preview.ok) {
    throw new Error(preview.error);
  }
  expect(preview.leftOut.map(({ field }) => field)).toContain("top_k");
  const outcome = await caller.preset.importFile({ fileText: FILE, fileName: "Keeper.json" });
  if (!outcome.ok || outcome.presetId === undefined) {
    throw new Error("the Presets page landed no preset");
  }
  const { params } = (await caller.preset.get({ id: outcome.presetId })).config;
  expect({
    temperature: params.temperature,
    frequencyPenalty: params.frequencyPenalty,
    presencePenalty: params.presencePenalty,
    topP: params.topP,
    topK: params.topK,
    maxContextTokens: params.maxContextTokens,
    maxOutputTokens: params.maxOutputTokens,
  }).toEqual({
    temperature: 0.9,
    frequencyPenalty: maxOf("frequencyPenalty"),
    presencePenalty: minOf("presencePenalty"),
    topP: maxOf("topP"),
    topK: undefined,
    maxContextTokens: 200_000,
    maxOutputTokens: 8000,
  });
});

// One sampler past its range, beside in-range values.
const SENT_TOP_P = maxOf("topP") + 0.5;
const ONE_OUT_FILE = JSON.stringify({
  prompts: [{ identifier: "main", name: "Main", content: "You narrate.", role: "system" }],
  ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "main", enabled: true }] }],
  temperature: 0.9,
  ["top_p"]: SENT_TOP_P,
});

test("the preview lists one out-of-range sampler as brought into range, not left out, and the preset lands the clamped value", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  const file = { fileText: ONE_OUT_FILE, fileName: "One hot.json" };

  const preview = await caller.preset.previewFile(file);
  if (!preview.ok) {
    throw new Error(preview.error);
  }
  expect(preview.clamped).toEqual([{ field: "top_p", sent: SENT_TOP_P, landedAs: maxOf("topP") }]);
  expect(preview.leftOut.map(({ field }) => field)).not.toContain("top_p");
  const outcome = await caller.preset.importFile(file);
  if (!outcome.ok || outcome.presetId === undefined) {
    throw new Error("the Presets page landed no preset");
  }
  const { params } = (await caller.preset.get({ id: outcome.presetId })).config;
  expect({ temperature: params.temperature, topP: params.topP }).toEqual({ temperature: 0.9, topP: maxOf("topP") });
});
