import type { RulePresetKnobView, RulePresetView } from "@orb/contracts/automation";
import { rulePresetViewSchema } from "@orb/contracts/automation";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

const KNOBS = [
  { key: "everyN", kind: "number", label: "Cadence", default: 8, min: 2, max: 200 },
  { key: "steer", kind: "text", label: "Direction", default: "", minLength: 0, maxLength: 600, help: "Leave empty for none" },
  { key: "labels", kind: "textList", label: "Choices", default: ["Stay", "Go"], minItems: 1, maxItems: 4, maxLength: 80 },
  {
    key: "mode",
    kind: "choice",
    label: "Mode",
    options: ["scenario", "background"],
    optionLabels: { scenario: "Scene", background: "Background" },
    default: "scenario",
  },
  { key: "book", kind: "entityRef", label: "World book", entity: "worldInfoBook" },
] as const satisfies readonly RulePresetKnobView[];

const PRESET = {
  id: "pacingNudge",
  scope: "chat",
  title: "Periodic pacing nudge",
  summary: "Offer a turn after a quiet beat.",
  ruleCount: 1,
  confirmFirst: false,
  spends: true,
  knobs: KNOBS,
} satisfies RulePresetView;

test("preset views round-trip both scopes and every descriptor's own fields without inventing defaults", () => {
  for (const scope of ["chat", "global"] as const) {
    const input = { ...PRESET, scope };
    expect(rulePresetViewSchema.parse(input)).toStrictEqual(input);
  }
  expect(rulePresetViewSchema.safeParse({ ...PRESET, scope: "owner" }).success).toBe(false);
  expect(rulePresetViewSchema.safeParse({ ...PRESET, scope: undefined }).success).toBe(false);
  expect(rulePresetViewSchema.safeParse({ ...PRESET, predicateCel: "true" }).success).toBe(false);
  expect(rulePresetViewSchema.safeParse({ ...PRESET, arms: [] }).success).toBe(false);
});

test("descriptor help omits absent and undefined values but preserves explicitly empty help", () => {
  const knob = KNOBS[0];
  expect(rulePresetViewSchema.parse({ ...PRESET, knobs: [knob] }).knobs).toStrictEqual([knob]);
  expect(rulePresetViewSchema.parse({ ...PRESET, knobs: [{ ...knob, help: undefined }] }).knobs).toStrictEqual([knob]);
  expect(rulePresetViewSchema.parse({ ...PRESET, knobs: [{ ...knob, help: "" }] }).knobs).toStrictEqual([{ ...knob, help: "" }]);
});

test("each knob kind requires its own bounds and default while entity references have neither a scalar default nor foreign entity kind", () => {
  const [number, text, textList, choice, entityRef] = KNOBS;
  const required = [
    { knob: number, fields: ["default", "min", "max"] },
    { knob: text, fields: ["default", "minLength", "maxLength"] },
    { knob: textList, fields: ["default", "minItems", "maxItems", "maxLength"] },
    { knob: choice, fields: ["default", "options", "optionLabels"] },
    { knob: entityRef, fields: ["entity"] },
  ];
  for (const { knob, fields } of required) {
    expect(rulePresetViewSchema.parse({ ...PRESET, knobs: [knob] }).knobs).toStrictEqual([knob]);
    for (const field of fields) {
      expect(rulePresetViewSchema.safeParse({ ...PRESET, knobs: [{ ...knob, [field]: undefined }] }).success, `${knob.kind}.${field}`).toBe(false);
    }
  }
  for (const knob of [
    { ...number, default: "8" },
    { ...text, default: false },
    { ...textList, default: [1] },
    { ...choice, options: [1] },
    { ...choice, optionLabels: { scenario: 1 } },
    { ...entityRef, entity: "character" },
    { ...entityRef, default: "" },
    { ...number, kind: "integer" },
  ]) {
    expect(rulePresetViewSchema.safeParse({ ...PRESET, knobs: [knob] }).success).toBe(false);
  }
});

test("descriptor envelopes refuse cross-kind fields and undeclared metadata rather than dropping them", () => {
  for (const knob of KNOBS) {
    expect(rulePresetViewSchema.safeParse({ ...PRESET, knobs: [{ ...knob, privateMetadata: "private" }] }).success).toBe(false);
    expect(rulePresetViewSchema.safeParse({ ...PRESET, knobs: [{ ...knob, key: undefined }] }).success).toBe(false);
    expect(rulePresetViewSchema.safeParse({ ...PRESET, knobs: [{ ...knob, label: undefined }] }).success).toBe(false);
  }
  expect(rulePresetViewSchema.safeParse({ ...PRESET, knobs: [{ ...KNOBS[0], maxLength: 1 }] }).success).toBe(false);
  expect(rulePresetViewSchema.safeParse({ ...PRESET, knobs: [{ ...KNOBS[4], min: 0 }] }).success).toBe(false);
});
