// substrate/run-now — the verbs↔ENGINE mediator for a manual run. Pins directly (the verb-level suite pins the
// GATE LINE; this pins the mediator's own two claims): the run starts at MANUAL_DEPTH 0 with a SYNTHESIZED
// fact (no real event), and a `transform_draft` rule (which registers into the pipeline and never dispatches
// a terminal) resolves to `null` rather than a fabricated fire.

import type { AutomationRuleId } from "@orb/kit/ids";
import { mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import { listFiresForRule } from "../../../../../packages/server/src/domain/automation/persistence/fires.ts";
import { insertRule, selectRuleRow, setRuleEnabledRow } from "../../../../../packages/server/src/domain/automation/persistence/rules.ts";
import { dispatchRuleNow } from "../../../../../packages/server/src/domain/automation/substrate/run-now.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FIXED_NOW_MS, ruleFixture } from "../_support.ts";

async function seedEnabledRule(
  fixture: Awaited<ReturnType<typeof ruleFixture>>,
  actions: Parameters<typeof insertRule>[1]["actions"],
): Promise<AutomationRuleId> {
  const id = mintTypeId("automation_rule");
  await insertRule(fixture.db, {
    id,
    ownerId: fixture.host,
    chatId: fixture.chatId,
    name: "r",
    description: null,
    position: 0,
    triggerBus: "chat",
    triggerType: "messageCommitted",
    predicateCel: null,
    actions,
    rulePresetId: null,
    rulePresetKnobs: null,
    matchAutomationEvents: false,
    cooldownSeconds: 0,
    maxFiresPerHour: 30,
    createdAt: FIXED_NOW_MS,
    updatedAt: FIXED_NOW_MS,
  });
  await setRuleEnabledRow(fixture.db, id, true, FIXED_NOW_MS);
  const rule = await selectRuleRow(fixture.db, id);
  if (rule === undefined) {
    throw new Error("fixture bug: just-inserted rule not found");
  }
  return rule.id;
}

describe("dispatchRuleNow", () => {
  test("a transform_draft rule reaches NO terminal — dispatchRuleNow answers null rather than fabricate a fire", async () => {
    const fixture = await ruleFixture();
    const ruleId = await seedEnabledRule(fixture, [{ type: "transform_draft", target: "user_input", template: "x" }]);
    await fixture.ctx.enabled.reload();
    const rule = await selectRuleRow(fixture.db, ruleId);
    expect(rule).toBeDefined();
    if (rule === undefined) {
      return;
    }
    const outcome = await dispatchRuleNow(fixture.ctx, rule, fixture.chatId, fixture.host);
    expect(outcome).toBeNull();
  });

  test("a set_variable rule dispatches through to a terminal at MANUAL_DEPTH 0 with a synthesized fact", async () => {
    const fixture = await ruleFixture();
    const ruleId = await seedEnabledRule(fixture, [{ type: "set_variable", scope: "chat", key: "mood", op: "set", value: "grim" }]);
    await fixture.ctx.enabled.reload();
    const rule = await selectRuleRow(fixture.db, ruleId);
    expect(rule).toBeDefined();
    if (rule === undefined) {
      return;
    }
    // The shared harness's default `runArm` is NOT_WIRED (arm_error) — this pins the MEDIATOR's own claims
    // (it reached dispatch, not null, and the fire row is stamped at depth 0), not arm success (the
    // verb-level suite `run-rule-now.int.test.ts` pins the wired-arm "fired" outcome).
    const outcome = await dispatchRuleNow(fixture.ctx, rule, fixture.chatId, fixture.host);
    expect(outcome).not.toBeNull();

    const fires = await listFiresForRule(fixture.db, ruleId);
    expect(fires).toHaveLength(1);
    expect(fires[0]).toMatchObject({ outcome: "action_error", automationDepth: 0 });
  });
});
