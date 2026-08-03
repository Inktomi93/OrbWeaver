// verb: listFires — the host's fire-log debug surface (a testRule writes a test_run row).

import { expect, test } from "../../../../support/fixtures.ts";
import { MSG_COMMITTED, principal, ruleFixture, SET_VAR } from "../_support.ts";

test("listFires returns the rule's fire log (the testRule test_run row)", async () => {
  const { host, chatId, svc } = await ruleFixture();
  const rule = await svc.createRule({ principal: principal(host), chatId, name: "r", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  await svc.testRule({ principal: principal(host), ruleId: rule.id });
  const fires = await svc.listFires({ principal: principal(host), ruleId: rule.id });
  expect(fires).toHaveLength(1);
  expect(fires[0]?.outcome).toBe("test_run");
});
