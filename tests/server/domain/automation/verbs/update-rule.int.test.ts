// verb: updateRule — replace editable fields (host-only), same validation, resets the error ledger.

import { RuleValidationError } from "@orb/server/domain/automation";
import { expect, test } from "../../../../support/fixtures.ts";
import { MSG_COMMITTED, principal, ruleFixture, SET_VAR } from "../_support.ts";

test("updateRule replaces the editable fields and announces the edit", async () => {
  const { host, chatId, svc, events } = await ruleFixture();
  const rule = await svc.createRule({ principal: principal(host), chatId, name: "greet", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  const updated = await svc.updateRule({ principal: principal(host), ruleId: rule.id, name: "greet2", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  expect(updated.name).toBe("greet2");
  expect(updated.id).toBe(rule.id);
  expect(events).toEqual([
    { type: "rulesChanged", chatId },
    { type: "rulesChanged", chatId },
  ]);
});

test("an update that fails validation writes nothing and announces nothing", async () => {
  const { host, chatId, svc, events } = await ruleFixture();
  const rule = await svc.createRule({ principal: principal(host), chatId, name: "greet", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  await expect(
    svc.updateRule({ principal: principal(host), ruleId: rule.id, name: "bad", trigger: MSG_COMMITTED, predicateCel: "event.role ==", actions: [SET_VAR] }),
  ).rejects.toThrow(RuleValidationError);
  // Only the create's event stands: `validateRuleInput` runs before `applyRuleUpdate`, so the announce that
  // sits after the write cannot fire on a refusal.
  expect(events).toEqual([{ type: "rulesChanged", chatId }]);
  const [listed] = await svc.listRules({ principal: principal(host), chatId });
  expect(listed?.name).toBe("greet");
});
