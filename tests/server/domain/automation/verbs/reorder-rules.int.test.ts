// verb: reorderRules — total position rewrite (host-only); listRules reads position order.

import { expect, test } from "../../../../support/fixtures.ts";
import { MSG_COMMITTED, principal, ruleFixture, SET_VAR } from "../_support.ts";

test("reorderRules rewrites position as a total order", async () => {
  const { host, chatId, svc } = await ruleFixture();
  const a = await svc.createRule({ principal: principal(host), chatId, name: "a", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  const b = await svc.createRule({ principal: principal(host), chatId, name: "b", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  const c = await svc.createRule({ principal: principal(host), chatId, name: "c", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  await svc.reorderRules({ principal: principal(host), chatId, orderedIds: [c.id, a.id, b.id] });
  const listed = await svc.listRules({ principal: principal(host), chatId });
  expect(listed.map((r) => r.name)).toEqual(["c", "a", "b"]);
  expect(listed.map((r) => r.position)).toEqual([0, 1, 2]);
});
