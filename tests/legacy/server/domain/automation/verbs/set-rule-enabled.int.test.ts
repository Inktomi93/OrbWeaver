// verb: setRuleEnabled — the consent flip (rules are born disabled).
// @subject packages/server/src/domain/automation/verbs/set-rule-enabled.ts

import { UTC_TIME_ZONE } from "@orb/kit/time";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { MSG_COMMITTED, principal, ruleFixture, SET_VAR } from "../_support.ts";

test("setRuleEnabled flips the enabled flag and announces the consent act", async () => {
  const db = await freshDb();
  const { host, chatId, svc, events } = await ruleFixture();
  const rule = await svc.createRule({
    timeZone: UTC_TIME_ZONE,
    principal: await principal(db, host),
    chatId,
    name: "r",
    trigger: MSG_COMMITTED,
    actions: [SET_VAR],
  });
  expect(rule.enabled).toBe(false);
  await svc.setRuleEnabled({ principal: await principal(db, host), ruleId: rule.id, enabled: true });
  const [listed] = await svc.listRules({ principal: await principal(db, host), chatId });
  expect(listed?.enabled).toBe(true);
  // Enablement is the write a second host tab most needs told about — a rule silently going live on another
  // device is the worst version of the H2 staleness (survey §2.3).
  expect(events).toEqual([
    { type: "rulesChanged", chatId },
    { type: "rulesChanged", chatId },
  ]);
});
