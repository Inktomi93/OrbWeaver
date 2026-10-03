// verb: deleteRule — remove a rule (host-only).

import { UTC_TIME_ZONE } from "@orb/kit/time";
import { createAutomationService, createEnabledRuleIndex, RuleNotFoundError } from "@orb/server/domain/automation";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { MSG_COMMITTED, makeAutomationHarness, principal, readFailingDb, ruleFixture, SET_VAR, seedHostChat, seedUser } from "../_support.ts";

test("deleteRule removes the rule from the chat's list, and announces the roster move", async () => {
  const { host, chatId, svc, events } = await ruleFixture();
  const rule = await svc.createRule({ timeZone: UTC_TIME_ZONE, principal: principal(host), chatId, name: "gone", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  await svc.deleteRule({ principal: principal(host), ruleId: rule.id });
  await expect(svc.listRules({ principal: principal(host), chatId })).resolves.toHaveLength(0);
  // Create + delete each announce. D50 bans per-entity DELETION events and this is not one — `rulesChanged`
  // is the coarse "this chat's rule set moved" member, identical on both writes (survey H2/F5).
  expect(events).toEqual([
    { type: "rulesChanged", chatId },
    { type: "rulesChanged", chatId },
  ]);
});

// #1431 — THE SHARPEST FORM OF THE DEFECT: the DELETE commits, the index rebuild fails, the caller is told
// the operation failed, and the process keeps dispatching the rule they just deleted. The write is the source
// of truth and the index is derived state, so a failed rebuild latches STALE (reads fail open ⇒ the
// authoritative DB read decides) instead of rejecting a committed operation.
test("an index-refresh failure does not reject the committed delete, and the deleted rule stops dispatching anyway", async () => {
  const db = await freshDb();
  const host = await seedUser(db, "user_host");
  const chatId = await seedHostChat(db, host);
  const failing = { fail: false };
  const enabled = createEnabledRuleIndex(readFailingDb(db, failing));
  const calls: string[] = [];
  const ctx = makeAutomationHarness(db, {
    enabled,
    runArm: (): Promise<{ ok: true }> => {
      calls.push("fired");
      return Promise.resolve({ ok: true as const });
    },
  });
  const svc = createAutomationService(ctx);
  const rule = await svc.createRule({
    timeZone: UTC_TIME_ZONE,
    principal: principal(host),
    chatId,
    name: "doomed",
    trigger: { bus: "chat", type: "chatOpened" },
    actions: [SET_VAR],
  });
  await svc.setRuleEnabled({ principal: principal(host), ruleId: rule.id, enabled: true });
  await enabled.reload();

  failing.fail = true;
  await expect(svc.deleteRule({ principal: principal(host), ruleId: rule.id })).resolves.toBeUndefined();
  expect(enabled.isStale()).toBe(true);

  // The pre-check now claims interest (fail open), so the event reaches the DB — which no longer holds the
  // rule. The deleted rule does NOT fire.
  await svc.handleEvent({ type: "chatOpened", chatId });
  expect(calls).toEqual([]);
});

test("a foreign caller's delete is refused and announces nothing", async () => {
  const { db, host, chatId, svc, events } = await ruleFixture();
  const rule = await svc.createRule({ timeZone: UTC_TIME_ZONE, principal: principal(host), chatId, name: "kept", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  const stranger = await seedUser(db, "user_stranger");
  await expect(svc.deleteRule({ principal: principal(stranger), ruleId: rule.id })).rejects.toThrow(RuleNotFoundError);
  // The guard throws before the DELETE, so the ledger still holds only the create's event — a refused write
  // must never tell a subscriber to re-read (it would be announcing a change that did not happen).
  expect(events).toEqual([{ type: "rulesChanged", chatId }]);
  await expect(svc.listRules({ principal: principal(host), chatId })).resolves.toHaveLength(1);
});
