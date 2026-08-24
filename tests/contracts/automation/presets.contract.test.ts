// Contract tests for the S3 rule-PRESET wire slice: the committed id tuple (the domain's exhaustive registry
// derives from it), the knob-kind tuple the picker's editor dispatch is exhaustive over, and the knob-value
// wire validator. What is NOT here is deliberate: no CEL, no arm templates — those are server logic that the
// client never re-derives, so nothing in `@orb/contracts/automation` may carry them.

import type { RulePresetId, RulePresetKnobDescriptor, RulePresetKnobKind, RulePresetView } from "@orb/contracts/automation";
import { RULE_PRESET_IDS, RULE_PRESET_KNOB_KINDS, rulePresetIdSchema, rulePresetKnobValuesSchema } from "@orb/contracts/automation";
import { expect, test } from "../../support/fixtures.ts";

test("RULE_PRESET_IDS is the pinned 11-member catalogue (A3's seven + A4's four), in §4 build order", () => {
  expect(RULE_PRESET_IDS).toEqual([
    "welcomeBackRecap",
    "autoAddLore",
    "pacingNudge",
    "illustrateScenes",
    "diceChips",
    "clockFires",
    "openerChips",
    "sceneVeil",
    "callAVote",
    "callback",
    "cutaways",
  ]);
  expect(rulePresetIdSchema.options).toEqual(RULE_PRESET_IDS);
  // The rows riding LATER phases stay unspellable: #2 (C6's actor-excluding notification recipient) and
  // #11/#14-#16 (C1's analysis arm).
  expect(rulePresetIdSchema.safeParse("asyncTableNudge").success).toBe(false);
  expect(rulePresetIdSchema.safeParse("rumorMill").success).toBe(false);
});

test("RULE_PRESET_KNOB_KINDS is the pinned editor axis", () => {
  expect(RULE_PRESET_KNOB_KINDS).toEqual(["number", "text", "textList", "choice"]);
});

test("rulePresetKnobValuesSchema accepts each knob-value shape and refuses the rest", () => {
  expect(rulePresetKnobValuesSchema.safeParse({ everyN: 8, steer: "go", labels: ["a"] }).success).toBe(true);
  expect(rulePresetKnobValuesSchema.safeParse({}).success).toBe(true); // an empty override bag = all defaults
  expect(rulePresetKnobValuesSchema.safeParse({ everyN: true }).success).toBe(false);
  expect(rulePresetKnobValuesSchema.safeParse({ labels: [1, 2] }).success).toBe(false);
  expect(rulePresetKnobValuesSchema.safeParse({ nested: { a: 1 } }).success).toBe(false);
});

// Compile-time exhaustiveness backstops (the workloads KIND_SEEN pattern) — a tuple edit that the runtime
// `toEqual` above missed fails tsc here instead of drifting.
const PRESET_SEEN: Record<RulePresetId, true> = {
  welcomeBackRecap: true,
  autoAddLore: true,
  pacingNudge: true,
  illustrateScenes: true,
  diceChips: true,
  clockFires: true,
  openerChips: true,
  sceneVeil: true,
  callAVote: true,
  callback: true,
  cutaways: true,
};
const KIND_SEEN: Record<RulePresetKnobKind, true> = { number: true, text: true, textList: true, choice: true };

test("the preset id + knob-kind unions have no member beyond their tuples", () => {
  expect(Object.keys(PRESET_SEEN).sort()).toEqual(RULE_PRESET_IDS.toSorted());
  expect(Object.keys(KIND_SEEN).sort()).toEqual(RULE_PRESET_KNOB_KINDS.toSorted());
});

test("the knob descriptor union is discriminated on kind — each arm carries its own bounds", () => {
  // A structural pin: the picker's editor dispatch narrows off `kind`, so each arm must be constructible
  // with its own fields and only its own fields.
  const descriptors: readonly RulePresetKnobDescriptor[] = [
    { kind: "number", label: "N", default: 8, min: 2, max: 200 },
    { kind: "text", label: "Steer", default: "go", maxLength: 600 },
    { kind: "textList", label: "Chips", default: ["a"], minItems: 1, maxItems: 4, maxLength: 80 },
    { kind: "choice", label: "Mode", options: ["scenario", "background"], default: "scenario" },
  ];
  expect(descriptors.map((d) => d.kind)).toEqual([...RULE_PRESET_KNOB_KINDS]);
});

test("RulePresetView is the picker's whole read model — no CEL field exists to carry a predicate", () => {
  const view: RulePresetView = {
    id: "pacingNudge",
    title: "Periodic pacing nudge",
    summary: "s",
    ruleCount: 1,
    confirmFirst: false,
    knobs: [{ key: "everyN", kind: "number", label: "N", default: 8, min: 2, max: 200 }],
  };
  expect(Object.keys(view).toSorted()).toEqual(["confirmFirst", "id", "knobs", "ruleCount", "summary", "title"]);
});
