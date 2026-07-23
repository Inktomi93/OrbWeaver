// verb: setBudgets — upsert the per-chat ceilings (host-only); a re-set touches only the provided fields.

import { expect, test } from "../../../../support/fixtures";
import { principal, ruleFixture } from "../_support.ts";

test("setBudgets upserts and a re-set only touches provided fields", async () => {
  const { host, chatId, svc } = await ruleFixture();
  await expect(svc.setBudgets({ principal: principal(host), chatId, maxFiresPerHour: 5, maxUsdPerDay: null })).resolves.toBeUndefined();
  await expect(svc.setBudgets({ principal: principal(host), chatId, maxSpendActionsPerDay: 3 })).resolves.toBeUndefined();
});
