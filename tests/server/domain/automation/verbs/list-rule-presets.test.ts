// S3 — the preset picker's read verb. A pure projection over the committed registry: no principal, no chat,
// no db. What it must NEVER leak is the point — a predicate is server logic, and a client that could read one
// would be a second place the dialect laws have to be obeyed.

import { RULE_PRESET_IDS } from "@orb/contracts/automation";
import { createListRulePresets } from "../../../../../packages/server/src/domain/automation/verbs/list-rule-presets.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const listRulePresets = createListRulePresets();

test("projects every committed preset, in RULE_PRESET_IDS (catalogue) order", () => {
  // Tuple order, never `Object.keys` — the declared vocabulary, not an insertion accident.
  expect(listRulePresets().map((view) => view.id)).toEqual([...RULE_PRESET_IDS]);
});

test("every projected view is renderable — title, summary, at least one rule, and labelled knobs", () => {
  const views = listRulePresets();
  expect(views.filter((view) => view.title.length === 0 || view.summary.length === 0 || view.ruleCount < 1)).toEqual([]);
  expect(views.flatMap((view) => view.knobs).filter((knob) => knob.key.length === 0 || knob.label.length === 0)).toEqual([]);
});

test("carries NO CEL and no arm templates — the picker never sees a predicate", () => {
  const serialized = JSON.stringify(listRulePresets());
  expect(serialized).not.toContain("vars.");
  expect(serialized).not.toContain("chat.messageCount");
  expect(serialized).not.toContain("{{expr::");
  expect(serialized).not.toContain("has(");
});

test("declares confirmFirst on every view — the two A4 rows ASK, the rest act directly", () => {
  // #1 (welcome-back recap) and #3 (auto-add lore) are the confirm-first rows; the picker reads this to
  // tell a host, BEFORE they enable it, whether the rule will act or ask.
  const asking = listRulePresets()
    .filter((view) => view.confirmFirst)
    .map((view) => view.id);
  expect(asking).toEqual(["welcomeBackRecap", "autoAddLore"]);
});
