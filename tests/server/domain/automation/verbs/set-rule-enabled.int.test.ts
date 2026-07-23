// verb: setRuleEnabled — the consent flip (rules are born disabled).

import { expect, test } from "../../../../support/fixtures";
import { MSG_COMMITTED, principal, ruleFixture, SET_VAR } from "../_support.ts";

test("setRuleEnabled flips the enabled flag", async () => {
  const { host, chatId, svc } = await ruleFixture();
  const rule = await svc.createRule({ principal: principal(host), chatId, name: "r", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  expect(rule.enabled).toBe(false);
  await svc.setRuleEnabled({ principal: principal(host), ruleId: rule.id, enabled: true });
  const [listed] = await svc.listRules({ principal: principal(host), chatId });
  expect(listed?.enabled).toBe(true);
});
