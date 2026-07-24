// verb: getBudgets — read the per-chat fire-rate cap (host-only). An absent `automation_budgets` row projects
// to the defaulted view (the value the write path stamps on insert / the rate gate uses for a missing row); a
// present row projects its column.

import { AUTOMATION_CHAT_BUDGET_DEFAULTS } from "@orb/contracts/automation";
import { expect, test } from "../../../../support/fixtures";
import { principal, ruleFixture } from "../_support.ts";

test("getBudgets projects an absent row to the defaulted view (no invented ceiling)", async () => {
  const { host, chatId, svc } = await ruleFixture();
  await expect(svc.getBudgets({ principal: principal(host), chatId })).resolves.toEqual({
    maxFiresPerHour: AUTOMATION_CHAT_BUDGET_DEFAULTS.maxFiresPerHour,
  });
});

test("getBudgets reads back a host-set fire-rate cap", async () => {
  const { host, chatId, svc } = await ruleFixture();
  await svc.setBudgets({ principal: principal(host), chatId, maxFiresPerHour: 7 });
  await expect(svc.getBudgets({ principal: principal(host), chatId })).resolves.toEqual({
    maxFiresPerHour: 7,
  });
});
