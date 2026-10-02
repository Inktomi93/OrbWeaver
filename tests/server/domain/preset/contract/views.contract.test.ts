import { DEFAULT_PROMPT_CONFIG, promptConfigConfig } from "@orb/contracts/preset";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { effectivePresetSchema, presetDetailSchema } from "../../../../../packages/server/src/domain/preset/contract/views.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId } from "../../../../support/inference-identities.ts";

test("preset details retain normalized config and unreadable disclosure while rejecting typed config additions", () => {
  const detail = {
    id: mintTypeId(ID_PREFIX.preset),
    name: "Archive",
    kind: "chat",
    isSystemDefault: false,
    forkedFrom: null,
    createdAt: 1,
    updatedAt: 1,
    config: DEFAULT_PROMPT_CONFIG,
    schemaVersion: promptConfigConfig.currentVersion,
    configUnreadable: null,
  };
  expect(presetDetailSchema.parse(detail)).toEqual(detail);
  expect(presetDetailSchema.safeParse({ ...detail, config: { ...detail.config, params: { ...detail.config.params, privateKnob: true } } }).success).toBe(false);
});

test("effective knob maps keep absent knobs but close every declared reading and quality entry", () => {
  const reading = { value: 0.7, provenance: "explicit" };
  const effective = {
    presetId: mintTypeId(ID_PREFIX.preset),
    model: testModelId("chat-model"),
    knobs: { temperature: reading },
    stale: [],
    qualityMapping: { quality: "deep", entries: [{ knob: "temperature", value: 0.8 }] },
  };
  expect(effectivePresetSchema.parse(effective)).toEqual(effective);
  expect(effectivePresetSchema.safeParse({ ...effective, knobs: { temperature: { ...reading, privateKnob: true } } }).success).toBe(false);
  expect(
    effectivePresetSchema.safeParse({
      ...effective,
      qualityMapping: { ...effective.qualityMapping, entries: [{ knob: "temperature", value: 0.8, privateDial: true }] },
    }).success,
  ).toBe(false);
});
