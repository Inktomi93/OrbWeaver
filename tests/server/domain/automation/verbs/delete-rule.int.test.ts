// verb: deleteRule — remove a rule (host-only).

import { expect, test } from "../../../../support/fixtures.ts";
import { MSG_COMMITTED, principal, ruleFixture, SET_VAR } from "../_support.ts";

test("deleteRule removes the rule from the chat's list", async () => {
  const { host, chatId, svc } = await ruleFixture();
  const rule = await svc.createRule({ principal: principal(host), chatId, name: "gone", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  await svc.deleteRule({ principal: principal(host), ruleId: rule.id });
  await expect(svc.listRules({ principal: principal(host), chatId })).resolves.toHaveLength(0);
});
