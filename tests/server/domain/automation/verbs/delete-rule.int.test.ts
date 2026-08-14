// verb: deleteRule — remove a rule (host-only).

import { RuleNotFoundError } from "@orb/server/domain/automation";
import { expect, test } from "../../../../support/fixtures.ts";
import { MSG_COMMITTED, principal, ruleFixture, SET_VAR, seedUser } from "../_support.ts";

test("deleteRule removes the rule from the chat's list, and announces the roster move", async () => {
  const { host, chatId, svc, events } = await ruleFixture();
  const rule = await svc.createRule({ principal: principal(host), chatId, name: "gone", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  await svc.deleteRule({ principal: principal(host), ruleId: rule.id });
  await expect(svc.listRules({ principal: principal(host), chatId })).resolves.toHaveLength(0);
  // Create + delete each announce. D50 bans per-entity DELETION events and this is not one — `rulesChanged`
  // is the coarse "this chat's rule set moved" member, identical on both writes (survey H2/F5).
  expect(events).toEqual([
    { type: "rulesChanged", chatId },
    { type: "rulesChanged", chatId },
  ]);
});

test("a foreign caller's delete is refused and announces nothing", async () => {
  const { db, host, chatId, svc, events } = await ruleFixture();
  const rule = await svc.createRule({ principal: principal(host), chatId, name: "kept", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  const stranger = await seedUser(db, "user_stranger");
  await expect(svc.deleteRule({ principal: principal(stranger), ruleId: rule.id })).rejects.toThrow(RuleNotFoundError);
  // The guard throws before the DELETE, so the ledger still holds only the create's event — a refused write
  // must never tell a subscriber to re-read (it would be announcing a change that did not happen).
  expect(events).toEqual([{ type: "rulesChanged", chatId }]);
  await expect(svc.listRules({ principal: principal(host), chatId })).resolves.toHaveLength(1);
});
