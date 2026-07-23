// verb: getBudgets — read the per-chat budget panel (host-only). An absent `automation_budgets` row projects
// to the defaulted view (the values the write path stamps on insert / the dispatch gates use for a missing
// row); a present row projects its columns, including a host-cleared `maxUsdPerDay: null`.

import { AUTOMATION_CHAT_BUDGET_DEFAULTS } from "@orb/contracts/automation";
import { expect, test } from "../../../../support/fixtures";
import { principal, ruleFixture } from "../_support.ts";

test("getBudgets projects an absent row to the defaulted view (no invented ceilings)", async () => {
  const { host, chatId, svc } = await ruleFixture();
  await expect(svc.getBudgets({ principal: principal(host), chatId })).resolves.toEqual({
    maxFiresPerHour: AUTOMATION_CHAT_BUDGET_DEFAULTS.maxFiresPerHour,
    maxSpendActionsPerDay: AUTOMATION_CHAT_BUDGET_DEFAULTS.maxSpendActionsPerDay,
    maxUsdPerDay: AUTOMATION_CHAT_BUDGET_DEFAULTS.maxUsdPerDay,
    usdSpentToday: 0,
    spendDay: "",
  });
});

test("getBudgets reads back a host-set budget, including a cleared dollar ceiling", async () => {
  const { host, chatId, svc } = await ruleFixture();
  await svc.setBudgets({ principal: principal(host), chatId, maxFiresPerHour: 7, maxSpendActionsPerDay: 3, maxUsdPerDay: null });
  await expect(svc.getBudgets({ principal: principal(host), chatId })).resolves.toEqual({
    maxFiresPerHour: 7,
    maxSpendActionsPerDay: 3,
    maxUsdPerDay: null, // the host cleared the $ ceiling (local-only setups)
    usdSpentToday: 0,
    spendDay: "",
  });
});
