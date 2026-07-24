// verb: setBudgets — upsert the per-chat fire-rate cap (host-only); a re-set updates it.

import { expect, test } from "../../../../support/fixtures";
import { principal, ruleFixture } from "../_support.ts";

test("setBudgets upserts the fire-rate cap and a re-set updates it", async () => {
  const { host, chatId, svc } = await ruleFixture();
  await expect(svc.setBudgets({ principal: principal(host), chatId, maxFiresPerHour: 5 })).resolves.toBeUndefined();
  await expect(svc.setBudgets({ principal: principal(host), chatId, maxFiresPerHour: 9 })).resolves.toBeUndefined();
});
