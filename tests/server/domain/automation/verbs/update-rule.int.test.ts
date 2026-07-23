// verb: updateRule — replace editable fields (host-only), same validation, resets the error ledger.

import { expect, test } from "../../../../support/fixtures";
import { MSG_COMMITTED, principal, ruleFixture, SET_VAR } from "../_support.ts";

test("updateRule replaces the editable fields", async () => {
  const { host, chatId, svc } = await ruleFixture();
  const rule = await svc.createRule({ principal: principal(host), chatId, name: "greet", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  const updated = await svc.updateRule({ principal: principal(host), ruleId: rule.id, name: "greet2", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  expect(updated.name).toBe("greet2");
  expect(updated.id).toBe(rule.id);
});
