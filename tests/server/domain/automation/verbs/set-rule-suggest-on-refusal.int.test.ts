// verb: setRuleSuggestOnRefusal — RULED F4's per-rule OPT-OUT.
//
// What these pins hold, and why each one is not a tautology:
//   · the column DEFAULTS ON, so landing the knob changed nothing for any rule that already exists — the
//     ruling's own default is "invitations ON for spend arms", and an opt-OUT that shipped opt-IN would have
//     silently muted every rate-capped rule in the tree;
//   · the flip is DURABLE and round-trips through `RuleView` (the flip is worthless if the row a host reads
//     back does not carry it — the client switch renders off exactly this field);
//   · the flip does NOT clear the MINT PROVENANCE. This is the reason the verb exists at all: `updateRule`
//     always nulls `rule_preset_id`/`rule_preset_knobs` (the B10 biconditional), so had this preference been
//     folded into the PUT, toggling it would have cost a host the saved-cast lineage
//     (D170) they never touched. Without this assertion nothing in the tree
//     would notice that regression.

import { expect, test } from "../../../../support/fixtures.ts";
import { MSG_COMMITTED, principal, ruleFixture, SET_VAR } from "../_support.ts";

test("a rule is born OFFERING (the F4 default) and the verb flips it durably, announcing the change", async () => {
  const { host, chatId, svc, events } = await ruleFixture();
  const rule = await svc.createRule({ principal: principal(host), chatId, name: "r", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  // The ruling's default — landing an OPT-OUT must leave every existing rule exactly where it was.
  expect(rule.suggestOnRefusal).toBe(true);

  await svc.setRuleSuggestOnRefusal({ principal: principal(host), ruleId: rule.id, suggestOnRefusal: false });

  const [listed] = await svc.listRules({ principal: principal(host), chatId });
  expect(listed?.suggestOnRefusal).toBe(false);
  // A second host tab renders this rule's own switch, so the flip rides the same rules-changed announcement
  // the enable flip does (create, then the flip).
  expect(events).toEqual([
    { type: "rulesChanged", chatId },
    { type: "rulesChanged", chatId },
  ]);
});

test("the flip is idempotent and reversible — turning the offer back ON restores the default", async () => {
  const { host, chatId, svc } = await ruleFixture();
  const rule = await svc.createRule({ principal: principal(host), chatId, name: "r", trigger: MSG_COMMITTED, actions: [SET_VAR] });

  await svc.setRuleSuggestOnRefusal({ principal: principal(host), ruleId: rule.id, suggestOnRefusal: false });
  await svc.setRuleSuggestOnRefusal({ principal: principal(host), ruleId: rule.id, suggestOnRefusal: false });
  await svc.setRuleSuggestOnRefusal({ principal: principal(host), ruleId: rule.id, suggestOnRefusal: true });

  const [listed] = await svc.listRules({ principal: principal(host), chatId });
  expect(listed?.suggestOnRefusal).toBe(true);
});

test("the flip does NOT touch the rule's mint provenance — the whole reason it is not part of the PUT", async () => {
  const { host, chatId, svc } = await ruleFixture();
  // `pacingNudge` mints ONE rule carrying a `trigger_turn` (SPEND) arm — the exact class this knob governs.
  const minted = await svc.createRuleFromPreset({ principal: principal(host), chatId, presetId: "pacingNudge" });
  const rule = minted[0];
  if (rule === undefined) {
    throw new Error("createRuleFromPreset minted no rules");
  }
  expect(rule.rulePresetId).toBe("pacingNudge");
  expect(rule.rulePresetKnobs).not.toBeNull();

  await svc.setRuleSuggestOnRefusal({ principal: principal(host), ruleId: rule.id, suggestOnRefusal: false });

  const [after] = await svc.listRules({ principal: principal(host), chatId });
  expect(after?.suggestOnRefusal).toBe(false);
  // The lineage the saved-cast capture reads survived a preference toggle. `updateRule` would have nulled it.
  expect(after?.rulePresetId).toBe("pacingNudge");
  expect(after?.rulePresetKnobs).toEqual(rule.rulePresetKnobs);
});
